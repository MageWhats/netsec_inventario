import type { PGlite } from '@electric-sql/pglite'
import { beforeAll, describe, expect, it } from 'vitest'
import { como, crearBase, crearProveedor, error, unaComo } from './base'

// Migración 0026: gastos, recurrentes, activos fijos, estados financieros y cierres
let db: PGlite
let proveedor: string
let caja: string
let anio: number
let mes: number
let inicio: string

const categoria = (nombre: string) =>
  unaComo<{ id: string }>(db, 'contador', 'select id from public.categorias_gasto where nombre = $1', [nombre]).then(
    (r) => r.id,
  )

const lineas = (columna: string, id: string) =>
  como<{ cuenta: string; debito: string; credito: string }>(
    db,
    'contador',
    `select a.cuenta, a.debito, a.credito from public.asientos a join public.comprobantes c on c.id = a.comprobante_id
     where c.${columna} = $1 order by c.created_at, a.linea`,
    [id],
  ).then((f) => f.map((l) => [l.cuenta, Number(l.debito), Number(l.credito)]))

const valorDe = (filas: { codigo: string; valor: string }[], codigo: string) =>
  Number(filas.find((f) => f.codigo === codigo)?.valor ?? 0)

beforeAll(async () => {
  db = await crearBase()
  proveedor = await crearProveedor(db, 'Inmobiliaria')
  caja = (await unaComo<{ id: string }>(db, 'contador', "select id from public.cuentas_tesoreria where cuenta = '110505'")).id
  // Arranque el mes pasado, para poder cerrarlo
  const fila = (
    await db.query<{ inicio: string; anio: number; mes: number }>(
      `select to_char(date_trunc('month', public.hoy_colombia()) - interval '1 month', 'YYYY-MM-DD') inicio,
              extract(year from public.hoy_colombia() - interval '1 month')::int anio,
              extract(month from public.hoy_colombia() - interval '1 month')::int mes`,
    )
  ).rows[0]!
  inicio = fila.inicio
  anio = fila.anio
  mes = fila.mes
  await como(db, 'contador', 'update public.configuracion_contable set fecha_inicio = $1::date', [inicio])
  await como(
    db,
    'contador',
    "select public.registrar_comprobante('SI', $1::date, 'Apertura', $2::jsonb)",
    [
      inicio,
      JSON.stringify([
        { cuenta: '110505', debito: 5_000_000 },
        { cuenta: '1528', debito: 3_600_000 },
        { cuenta: '3105', credito: 8_600_000 },
      ]),
    ],
  )
})

describe('gastos', () => {
  it('pagado: gasto contra la caja, con la cuenta de su categoría', async () => {
    const { id } = await unaComo<{ id: string }>(
      db,
      'contador',
      "select public.registrar_gasto($1::date, $2, 85000, 'Resmas de papel', p_cuenta_tesoreria_id => $3) as id",
      [inicio, await categoria('Papelería y útiles'), caja],
    )
    expect(await lineas('gasto_id', id)).toEqual([
      ['519595', 85_000, 0],
      ['110505', 0, 85_000],
    ])
  })

  it('por pagar: queda en 2335 y se paga después con un egreso', async () => {
    const { id } = await unaComo<{ id: string }>(
      db,
      'contador',
      "select public.registrar_gasto($1::date, $2, 1200000, 'Arriendo del local', p_proveedor_id => $3) as id",
      [inicio, await categoria('Arriendo'), proveedor],
    )
    expect(await lineas('gasto_id', id)).toEqual([
      ['5120', 1_200_000, 0],
      ['2335', 0, 1_200_000],
    ])
    expect(
      await error(como(db, 'contador', "select public.registrar_gasto($1::date, $2, 10, 'Sin beneficiario')", [inicio, await categoria('Arriendo')])),
    ).toMatch(/beneficiario/)

    const { egreso } = await unaComo<{ egreso: string }>(
      db,
      'contador',
      "select public.pagar_gasto($1, $2, $3::date, 'transferencia') as egreso",
      [id, caja, inicio],
    )
    expect(await lineas('egreso_id', egreso)).toEqual([
      ['2335', 1_200_000, 0],
      ['110505', 0, 1_200_000],
    ])
    expect(await error(como(db, 'contador', "select public.pagar_gasto($1, $2, $3::date, 'efectivo')", [id, caja, inicio]))).toMatch(
      /ya está pagado/,
    )
    expect(await error(como(db, 'contador', "select public.anular_gasto($1, 'Duplicado')", [id]))).toMatch(/anula primero el egreso/)
  })

  it('recurrentes: aparecen pendientes cada mes y se confirman una vez', async () => {
    await como(
      db,
      'contador',
      `insert into public.gastos_recurrentes (nombre, categoria_id, valor, dia, cuenta_tesoreria_id, created_at)
       values ('Internet fibra', $1, 120000, 5, $2, $3::date)`,
      [await categoria('Internet y telefonía'), caja, inicio],
    )
    const pendientes = await como<{ id: string }>(db, 'contador', 'select * from public.recurrentes_pendientes($1, $2)', [anio, mes])
    expect(pendientes).toHaveLength(1)
    await como(db, 'contador', 'select public.confirmar_recurrente($1, $2, $3)', [pendientes[0]!.id, anio, mes])
    expect(await como(db, 'contador', 'select * from public.recurrentes_pendientes($1, $2)', [anio, mes])).toHaveLength(0)
    expect(await error(como(db, 'contador', 'select public.confirmar_recurrente($1, $2, $3)', [pendientes[0]!.id, anio, mes]))).toMatch(
      /duplicate key/,
    )
  })
})

describe('activos fijos', () => {
  it('depreciación en línea recta desde el mes siguiente a la compra', async () => {
    const compra = new Date(`${inicio}T12:00:00`)
    compra.setMonth(compra.getMonth() - 6)
    const { id } = await unaComo<{ id: string }>(
      db,
      'contador',
      `insert into public.activos_fijos (nombre, cuenta, fecha_compra, costo, vida_util_meses, depreciacion_inicial)
       values ('Computador portátil', '1528', $1::date, 3600000, 36, 500000) returning id`,
      [compra.toISOString().slice(0, 10)],
    )
    expect(await como(db, 'contador', 'select public.depreciar_mes($1, $2) n', [anio, mes])).toEqual([{ n: 1 }])
    const [{ comprobante_id }] = await como<{ comprobante_id: string }>(
      db,
      'contador',
      'select comprobante_id from public.depreciaciones where activo_id = $1',
      [id],
    )
    expect(await lineas('id', comprobante_id)).toEqual([
      ['5260', 100_000, 0],
      ['1592', 0, 100_000],
    ])
    // Una vez por mes
    expect(await como(db, 'contador', 'select public.depreciar_mes($1, $2) n', [anio, mes])).toEqual([{ n: 0 }])
    expect(
      await error(como(db, 'contador', 'update public.activos_fijos set costo = 1 where id = $1', [id])),
    ).toMatch(/ya tiene depreciaciones/)
  })
})

describe('estados financieros', () => {
  it('estado de resultados y situación financiera cuadran', async () => {
    const er = await como<{ codigo: string; valor: string }>(
      db,
      'contador',
      "select codigo, valor from public.estado_resultados($1::date, public.hoy_colombia())",
      [inicio],
    )
    // Gastos: papelería 85.000 + arriendo 1.200.000 + internet 120.000 + depreciación 100.000
    expect(valorDe(er, '5')).toBe(1_505_000)

    const sf = await como<{ codigo: string; valor: string }>(
      db,
      'contador',
      'select codigo, valor from public.situacion_financiera(public.hoy_colombia())',
    )
    const activo = valorDe(sf, '1')
    const pasivo = valorDe(sf, '2')
    const patrimonio = valorDe(sf, '3') + valorDe(sf, 'resultado')
    expect(valorDe(sf, 'resultado')).toBe(-1_505_000)
    expect(activo).toBe(pasivo + patrimonio)
  })
})

describe('cierres', () => {
  it('el cierre mensual revisa la lista de chequeo', async () => {
    const lista = await como<{ item: string; ok: boolean }>(db, 'contador', 'select item, ok from public.checklist_cierre($1, $2)', [
      anio,
      mes,
    ])
    expect(lista.every((i) => i.ok)).toBe(true)
    await como(db, 'contador', 'select public.cerrar_periodo($1, $2)', [anio, mes])
  })

  it('un recurrente sin confirmar impide cerrar, salvo que se fuerce', async () => {
    const [{ a, m }] = (
      await db.query<{ a: number; m: number }>(
        'select extract(year from public.hoy_colombia())::int a, extract(month from public.hoy_colombia())::int m',
      )
    ).rows
    expect(await error(como(db, 'contador', 'select public.cerrar_periodo($1, $2)', [a, m]))).toMatch(/recurrentes/)
    await como(db, 'contador', 'select public.cerrar_periodo($1, $2, true)', [a, m])
    await como(db, 'contador', "select public.reabrir_periodo($1, $2, 'Prueba de cierre forzado')", [a, m])
  })

})

describe('cierre anual', () => {
  it('lleva ingresos, gastos y costos a la 3605 y se puede deshacer', async () => {
    // Base aparte: arranque el 1 de diciembre del año pasado (de enero a noviembre no hay meses que cerrar)
    const otra = await crearBase()
    const [{ pasado }] = (await otra.query<{ pasado: number }>('select extract(year from public.hoy_colombia())::int - 1 pasado')).rows
    await como(otra, 'contador', 'update public.configuracion_contable set fecha_inicio = make_date($1, 12, 1)', [pasado])
    await como(otra, 'contador', "select public.registrar_comprobante('CC', make_date($1, 12, 10), 'Venta de servicio', $2::jsonb)", [
      pasado,
      JSON.stringify([
        { cuenta: '110505', debito: 1_000_000 },
        { cuenta: '4135', credito: 1_000_000 },
      ]),
    ])
    await como(otra, 'contador', "select public.registrar_comprobante('CC', make_date($1, 12, 20), 'Arriendo', $2::jsonb)", [
      pasado,
      JSON.stringify([
        { cuenta: '5120', debito: 300_000 },
        { cuenta: '110505', credito: 300_000 },
      ]),
    ])

    const { id } = await unaComo<{ id: string }>(otra, 'contador', 'select public.cierre_anual($1) as id', [pasado])
    const cierre = await como<{ cuenta: string; debito: string; credito: string }>(
      otra,
      'contador',
      'select cuenta, debito, credito from public.asientos where comprobante_id = $1 order by linea',
      [id],
    )
    expect(cierre.map((l) => [l.cuenta, Number(l.debito), Number(l.credito)])).toEqual([
      ['4135', 1_000_000, 0],
      ['5120', 0, 300_000],
      ['3605', 0, 700_000],
    ])
    // El estado de resultados del año no cuenta el cierre; la situación financiera ya no tiene resultado sin cerrar
    const er = await como<{ codigo: string; valor: string }>(
      otra,
      'contador',
      'select codigo, valor from public.estado_resultados(make_date($1, 1, 1), make_date($1, 12, 31))',
      [pasado],
    )
    expect(valorDe(er, '4')).toBe(1_000_000)
    const sf = await como<{ codigo: string; valor: string }>(
      otra,
      'contador',
      'select codigo, valor from public.situacion_financiera(make_date($1, 12, 31))',
      [pasado],
    )
    expect(valorDe(sf, 'resultado')).toBe(0)
    expect(valorDe(sf, '3605')).toBe(700_000)
    expect(await error(como(otra, 'contador', 'select public.cierre_anual($1)', [pasado]))).toMatch(/ya está cerrado/)

    await como(otra, 'contador', "select public.anular_cierre_anual($1, 'Falta un ajuste')", [pasado])
    const sf2 = await como<{ codigo: string; valor: string }>(
      otra,
      'contador',
      'select codigo, valor from public.situacion_financiera(make_date($1, 12, 31))',
      [pasado],
    )
    expect(valorDe(sf2, 'resultado')).toBe(700_000)
    await otra.close()
  })
})
