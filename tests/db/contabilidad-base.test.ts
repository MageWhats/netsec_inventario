import type { PGlite } from '@electric-sql/pglite'
import { beforeAll, describe, expect, it } from 'vitest'
import { como, crearBase, crearProveedor, error, unaComo, type Usuario } from './base'

// Migraciones 0021 y 0022: rol contador y base contable (fase 1)
let db: PGlite
let proveedor: string
// La contabilidad arranca el primer día del mes pasado: así hay un mes que se puede cerrar
let inicio: string
let mesActual: string

type Linea = {
  cuenta: string
  debito?: number
  credito?: number
  descripcion?: string
  proveedor_id?: string
  tercero_id?: string
}

const registrarComprobante = (
  lineas: Linea[],
  extra: { tipo?: 'CC' | 'SI'; fecha?: string; usuario?: Usuario; descripcion?: string } = {},
) =>
  unaComo<{ id: string }>(
    db,
    extra.usuario ?? 'contador',
    'select public.registrar_comprobante($1, $2::date, $3, $4::jsonb) as id',
    [extra.tipo ?? 'CC', extra.fecha ?? mesActual, extra.descripcion ?? 'Comprobante de prueba', JSON.stringify(lineas)],
  ).then((r) => r.id)

const saldo = async (cuenta: string, desde = inicio, hasta = '2100-01-01') => {
  const filas = await como<{ codigo: string; saldo_final: string }>(
    db,
    'contador',
    'select codigo, saldo_final from public.balance_prueba($1::date, $2::date)',
    [desde, hasta],
  )
  return Number(filas.find((f) => f.codigo === cuenta)?.saldo_final ?? 0)
}

beforeAll(async () => {
  db = await crearBase()
  proveedor = await crearProveedor(db)
  const { a, b } = (
    await db.query<{ a: string; b: string }>(
      `select to_char(date_trunc('month', public.hoy_colombia()) - interval '1 month', 'YYYY-MM-DD') a,
              to_char(public.hoy_colombia(), 'YYYY-MM-DD') b`,
    )
  ).rows[0]!
  inicio = a
  mesActual = b
})

describe('rol contador', () => {
  it('ve costos y la contabilidad; bodega no ve la contabilidad', async () => {
    expect(await como(db, 'contador', 'select public.ver_costos() v')).toEqual([{ v: true }])
    expect(await como(db, 'contador', 'select public.lleva_contabilidad() v')).toEqual([{ v: true }])
    expect(await como(db, 'lectura', 'select public.lleva_contabilidad() v')).toEqual([{ v: false }])
    expect(await como(db, 'bodega', 'select count(*)::int n from public.cuentas')).toEqual([{ n: 0 }])
    expect((await como<{ n: number }>(db, 'lectura', 'select count(*)::int n from public.cuentas'))[0]!.n).toBeGreaterThan(
      30,
    )
  })

  it('no registra movimientos de inventario', async () => {
    expect(
      await error(
        como(db, 'contador', `select public.registrar_movimiento('entrada', '[{"producto_id": null}]'::jsonb)`),
      ),
    ).toMatch(/permisos/)
  })
})

describe('plan de cuentas', () => {
  it('trae las subcuentas aprobadas y la 3105 con su nombre nuevo', async () => {
    const filas = await como<{ codigo: string; nombre: string; padre: string }>(
      db,
      'contador',
      `select codigo, nombre, padre from public.cuentas
       where codigo in ('3105', '519535', '519540', '519545', '425095') order by codigo`,
    )
    expect(filas).toEqual([
      { codigo: '3105', nombre: 'Aportes de los comerciantes', padre: '31' },
      { codigo: '425095', nombre: 'Sobrantes de inventario', padre: '4250' },
      { codigo: '519535', nombre: 'Faltantes de inventario', padre: '5195' },
      { codigo: '519540', nombre: 'Garantías a clientes', padre: '5195' },
      { codigo: '519545', nombre: 'Obsequios y muestras gratis', padre: '5195' },
    ])
  })

  it('la contadora crea subcuentas; el código debe tener padre y no se edita', async () => {
    await como(
      db,
      'contador',
      `insert into public.cuentas (codigo, nombre, naturaleza) values ('11100501', 'Banco de prueba', 'debito')`,
    )
    expect(
      await error(
        como(db, 'contador', `insert into public.cuentas (codigo, nombre, naturaleza) values ('112005', 'Sin padre', 'debito')`),
      ),
    ).toMatch(/padre/)
    expect(
      await error(como(db, 'contador', `update public.cuentas set codigo = '111006' where codigo = '111005'`)),
    ).toMatch(/permission denied/)
    expect(
      await error(
        como(db, 'lectura', `insert into public.cuentas (codigo, nombre, naturaleza) values ('111010', 'X', 'debito')`),
      ),
    ).toMatch(/row-level security/)
  })

  it('la primera subcuenta de una cuenta de los parámetros la reemplaza en ellos (0024)', async () => {
    await como(
      db,
      'contador',
      `insert into public.cuentas (codigo, nombre, naturaleza) values ('51954001', 'Garantías de equipos', 'debito')`,
    )
    expect(
      await como(db, 'contador', "select cuenta from public.parametros_contables where clave = 'garantias_clientes'"),
    ).toEqual([{ cuenta: '51954001' }])
  })
})

describe('comprobantes', () => {
  it('sin fecha de arranque no se registra nada', async () => {
    expect(
      await error(
        registrarComprobante([
          { cuenta: '110505', debito: 100 },
          { cuenta: '3105', credito: 100 },
        ]),
      ),
    ).toMatch(/fecha de arranque/)
  })

  it('la fecha de arranque es el primer día de un mes', async () => {
    expect(
      await error(como(db, 'contador', `update public.configuracion_contable set fecha_inicio = '2026-10-15'`)),
    ).toMatch(/check constraint/)
    await como(db, 'contador', 'update public.configuracion_contable set fecha_inicio = $1::date', [inicio])
  })

  it('saldos iniciales: uno solo y en la fecha de arranque', async () => {
    const lineas = [
      { cuenta: '110505', debito: 1_000_000 },
      { cuenta: '1435', debito: 4_000_000 },
      { cuenta: '2205', credito: 1_500_000, proveedor_id: proveedor },
      { cuenta: '3105', credito: 3_500_000 },
    ]
    expect(await error(registrarComprobante(lineas, { tipo: 'SI' }))).toMatch(/fecha de arranque/)
    await registrarComprobante(lineas, { tipo: 'SI', fecha: inicio })
    expect(await error(registrarComprobante(lineas, { tipo: 'SI', fecha: inicio }))).toMatch(/Ya hay/)
    expect(await saldo('1435')).toBe(4_000_000)
    expect(await saldo('2205')).toBe(1_500_000)
    expect(await saldo('1')).toBe(5_000_000)
  })

  it('debe cuadrar', async () => {
    expect(
      await error(
        registrarComprobante([
          { cuenta: '519595', debito: 50_000 },
          { cuenta: '110505', credito: 40_000 },
        ]),
      ),
    ).toMatch(/no cuadra/)
  })

  it('solo cuentas de último nivel, activas y con tercero donde se exige', async () => {
    expect(
      await error(
        registrarComprobante([
          { cuenta: '5195', debito: 1 },
          { cuenta: '110505', credito: 1 },
        ]),
      ),
    ).toMatch(/último nivel/)
    expect(
      await error(
        registrarComprobante([
          { cuenta: '519595', debito: 1 },
          { cuenta: '2205', credito: 1 },
        ]),
      ),
    ).toMatch(/exige indicar el tercero/)
    expect(
      await error(
        registrarComprobante([
          { cuenta: '519595', debito: 1, credito: 1 },
          { cuenta: '110505', credito: 1 },
        ]),
      ),
    ).toMatch(/uno solo/)
  })

  it('solo admin y contador registran; nadie escribe las tablas directamente', async () => {
    const lineas = [
      { cuenta: '519595', debito: 1 },
      { cuenta: '110505', credito: 1 },
    ]
    expect(await error(registrarComprobante(lineas, { usuario: 'lectura' }))).toMatch(/contadora/)
    expect(await error(registrarComprobante(lineas, { usuario: 'bodega' }))).toMatch(/contadora/)
    await registrarComprobante(lineas, { usuario: 'admin' })
    expect(
      await error(como(db, 'contador', `update public.asientos set debito = 2 where cuenta = '519595'`)),
    ).toMatch(/permission denied/)
    expect(await error(como(db, 'contador', `delete from public.comprobantes`))).toMatch(/permission denied/)
  })

  it('consecutivo por tipo y anulación con el comprobante inverso', async () => {
    const antes = await saldo('519595')
    const id = await registrarComprobante([
      { cuenta: '519595', debito: 80_000, descripcion: 'Papelería' },
      { cuenta: '110505', credito: 80_000 },
    ])
    expect(await saldo('519595')).toBe(antes + 80_000)

    const inverso = (
      await unaComo<{ id: string }>(db, 'contador', "select public.anular_comprobante($1, 'Se registró dos veces') as id", [
        id,
      ])
    ).id
    expect(await saldo('519595')).toBe(antes)
    const [orig, inv] = await como<{ numero: number; anulado: boolean; anula_id: string | null }>(
      db,
      'contador',
      `select numero, anulado_at is not null as anulado, anula_id from public.comprobantes
       where id in ($1, $2) order by numero`,
      [id, inverso],
    )
    expect(orig).toMatchObject({ anulado: true, anula_id: null })
    expect(inv).toMatchObject({ numero: orig!.numero + 1, anulado: false, anula_id: id })
    expect(
      await error(como(db, 'contador', "select public.anular_comprobante($1, 'Otra vez')", [id])),
    ).toMatch(/ya está anulado/)
    expect(
      await error(como(db, 'contador', "select public.anular_comprobante($1, 'Otra vez')", [inverso])),
    ).toMatch(/es una anulación/)
  })

  it('nada antes de la fecha de arranque ni muy en el futuro', async () => {
    const lineas = [
      { cuenta: '519595', debito: 1 },
      { cuenta: '110505', credito: 1 },
    ]
    expect(await error(registrarComprobante(lineas, { fecha: '2020-01-01' }))).toMatch(/arranca/)
    expect(await error(registrarComprobante(lineas, { fecha: '2099-01-01' }))).toMatch(/futuro/)
  })

  it('la fecha de arranque ya no cambia', async () => {
    expect(
      await error(como(db, 'contador', `update public.configuracion_contable set fecha_inicio = '2020-01-01'`)),
    ).toMatch(/no se puede cambiar/)
  })
})

describe('periodos', () => {
  it('se cierran en orden y en un mes cerrado no se registra', async () => {
    const [anio, mes] = inicio.split('-').map(Number) as [number, number]
    const [anioAct, mesAct] = mesActual.split('-').map(Number) as [number, number]
    expect(await error(como(db, 'contador', 'select public.cerrar_periodo($1, $2)', [anioAct, mesAct]))).toMatch(
      /mes anterior/,
    )
    expect(await error(como(db, 'lectura', 'select public.cerrar_periodo($1, $2)', [anio, mes]))).toMatch(/contadora/)
    await como(db, 'contador', 'select public.cerrar_periodo($1, $2)', [anio, mes])

    expect(
      await error(
        registrarComprobante(
          [
            { cuenta: '519595', debito: 1 },
            { cuenta: '110505', credito: 1 },
          ],
          { fecha: inicio },
        ),
      ),
    ).toMatch(/está cerrado/)
  })

  it('solo la contadora reabre, con motivo', async () => {
    const [anio, mes] = inicio.split('-').map(Number) as [number, number]
    expect(
      await error(como(db, 'admin', "select public.reabrir_periodo($1, $2, 'Falta una factura')", [anio, mes])),
    ).toMatch(/Solo la contadora/)
    expect(await error(como(db, 'contador', "select public.reabrir_periodo($1, $2, 'x')", [anio, mes]))).toMatch(
      /motivo/,
    )
    await como(db, 'contador', "select public.reabrir_periodo($1, $2, 'Falta una factura')", [anio, mes])
    const [p] = await como<{ cerrado: boolean; motivo_reapertura: string }>(
      db,
      'contador',
      'select cerrado, motivo_reapertura from public.periodos where anio = $1 and mes = $2',
      [anio, mes],
    )
    expect(p).toEqual({ cerrado: false, motivo_reapertura: 'Falta una factura' })
  })
})

describe('informes', () => {
  it('balance de prueba cuadrado y auxiliar con saldo corrido', async () => {
    const filas = await como<{ nivel: number; debitos: string; creditos: string }>(
      db,
      'lectura',
      'select nivel, debitos, creditos from public.balance_prueba($1::date, $2::date)',
      [inicio, '2100-01-01'],
    )
    const clases = filas.filter((f) => f.nivel === 1)
    const d = clases.reduce((s, f) => s + Number(f.debitos), 0)
    const c = clases.reduce((s, f) => s + Number(f.creditos), 0)
    expect(d).toBe(c)

    const aux = await como<{ descripcion: string; saldo: string }>(
      db,
      'contador',
      'select descripcion, saldo from public.auxiliar_cuenta($1, $2::date, $3::date)',
      ['1105', inicio, '2100-01-01'],
    )
    expect(aux[0]).toEqual({ descripcion: 'Saldo anterior', saldo: '0' })
    expect(Number(aux.at(-1)!.saldo)).toBe(await saldo('1105'))
    expect(await error(como(db, 'bodega', 'select * from public.balance_prueba(current_date, current_date)'))).toMatch(
      /permisos/,
    )
  })
})
