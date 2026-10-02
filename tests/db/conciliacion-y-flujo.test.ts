import type { PGlite } from '@electric-sql/pglite'
import { beforeAll, describe, expect, it } from 'vitest'
import { como, crearBase, crearProducto, crearProveedor, error, unaComo } from './base'

// Migración 0027: impuestos, conciliación bancaria y flujo de caja
let db: PGlite
let banco: string
let cliente: string
let proveedor: string
let producto: string
let anio: number
let mes: number
let hoy: string

const venderCredito = (precio: number) =>
  unaComo<{ id: string }>(
    db,
    'admin',
    `select public.registrar_venta(p_items => $1::jsonb, p_cliente_id => $2, p_credito => true, p_vence => current_date + 10) as id`,
    [JSON.stringify([{ producto_id: producto, cantidad: 1, precio_unitario: precio }]), cliente],
  ).then((r) => r.id)

const estado = (extracto: string) =>
  unaComo<{ diferencia: string; lineas_pendientes: number; asientos_pendientes: number; saldo_libros: string }>(
    db,
    'contador',
    'select * from public.estado_conciliacion($1)',
    [extracto],
  ).then((r) => ({ ...r, diferencia: Number(r.diferencia), saldo_libros: Number(r.saldo_libros) }))

beforeAll(async () => {
  db = await crearBase()
  proveedor = await crearProveedor(db)
  producto = await crearProducto(db, { nombre: 'Router flujo' })
  cliente = (
    await unaComo<{ id: string }>(
      db,
      'admin',
      "insert into public.clientes (nombre, tipo_documento, documento, agente_retencion) values ('Cliente grande', 'NIT', '900555111', true) returning id",
    )
  ).id
  const fila = (
    await db.query<{ anio: number; mes: number; hoy: string }>(
      `select extract(year from public.hoy_colombia())::int anio, extract(month from public.hoy_colombia())::int mes,
              to_char(public.hoy_colombia(), 'YYYY-MM-DD') hoy`,
    )
  ).rows[0]!
  anio = fila.anio
  mes = fila.mes
  hoy = fila.hoy
  await como(db, 'contador', "update public.configuracion_contable set fecha_inicio = date_trunc('month', public.hoy_colombia())")
  banco = (await unaComo<{ id: string }>(db, 'contador', "select public.crear_cuenta_tesoreria('Banco flujo', 'banco') as id")).id
  await unaComo(
    db,
    'admin',
    "select public.registrar_movimiento(p_tipo => 'entrada', p_proveedor_id => $1, p_items => $2::jsonb) as id",
    [proveedor, JSON.stringify([{ producto_id: producto, cantidad: 10, costo_unitario: 100_000 }])],
  )
})

describe('impuestos', () => {
  it('base del ICA por bimestre y retenciones a favor por cliente', async () => {
    await como(db, 'contador', 'update public.configuracion_contable set tarifa_ica = 7')
    const venta = await venderCredito(1_000_000)
    await unaComo(
      db,
      'admin',
      "select public.registrar_pago(p_movimiento_id => $1, p_valor => 975000, p_metodo => 'transferencia', p_retencion => 25000, p_cuenta_tesoreria_id => $2) as id",
      [venta, banco],
    )
    const bimestres = await como<{ bimestre: number; base: string; impuesto: string }>(
      db,
      'contador',
      'select bimestre, base, impuesto from public.base_ica($1)',
      [anio],
    )
    expect(bimestres).toHaveLength(6)
    const actual = bimestres.find((b) => b.bimestre === Math.ceil(mes / 2))!
    expect(Number(actual.base)).toBe(1_000_000)
    expect(Number(actual.impuesto)).toBe(7_000)

    const retenciones = await como<{ nombre: string; base: string; retencion: string }>(
      db,
      'contador',
      "select * from public.retenciones_a_favor(date_trunc('month', current_date)::date, current_date)",
    )
    expect(retenciones.map((r) => [r.nombre, Number(r.base), Number(r.retencion)])).toEqual([['Cliente grande', 1_000_000, 25_000]])
  })
})

describe('conciliación bancaria', () => {
  let extracto: string

  it('importa el extracto, valida los saldos y concilia solo lo que coincide', async () => {
    // En los libros: el abono de 975.000. En el banco: ese abono y una comisión que falta registrar
    const lineas = [
      { fecha: hoy, descripcion: 'Transferencia Cliente grande', valor: 975_000 },
      { fecha: hoy, descripcion: 'Cuota de manejo', valor: -12_000 },
    ]
    expect(
      await error(
        como(db, 'contador', 'select public.importar_extracto($1, $2, $3, 0, 1000, $4::jsonb)', [banco, anio, mes, JSON.stringify(lineas)]),
      ),
    ).toMatch(/no cuadran/)
    extracto = (
      await unaComo<{ id: string }>(db, 'contador', 'select public.importar_extracto($1, $2, $3, 0, 963000, $4::jsonb) as id', [
        banco,
        anio,
        mes,
        JSON.stringify(lineas),
      ])
    ).id
    const e = await estado(extracto)
    expect(e.lineas_pendientes).toBe(1)
    expect(e.diferencia).toBe(0)
    expect(await como(db, 'contador', 'select * from public.asientos_sin_conciliar($1)', [extracto])).toHaveLength(0)
  })

  it('la comisión se registra con un egreso, se concilia y el mes se cierra', async () => {
    await como(
      db,
      'contador',
      "select public.registrar_egreso(public.hoy_colombia(), 'otro', $1, 12000, 'otro', 'Cuota de manejo', p_cuenta => '5305')",
      [banco],
    )
    expect(await como(db, 'contador', 'select public.conciliar_automatico($1) n', [extracto])).toEqual([{ n: 1 }])
    const e = await estado(extracto)
    expect([e.lineas_pendientes, e.asientos_pendientes, e.diferencia]).toEqual([0, 0, 0])
    expect(e.saldo_libros).toBe(963_000)
    await como(db, 'contador', 'select public.cerrar_conciliacion($1)', [extracto])
    expect(
      await error(como(db, 'contador', "select public.importar_extracto($1, $2, $3, 0, 0, '[]'::jsonb)", [banco, anio, mes])),
    ).toMatch(/está cerrada/)
  })

  it('conciliar a mano exige el mismo valor y la misma cuenta', async () => {
    await como(db, 'contador', 'select public.cerrar_conciliacion($1, false)', [extracto])
    const [linea] = await como<{ id: string; asiento_id: string }>(
      db,
      'contador',
      'select id, asiento_id from public.extracto_lineas where extracto_id = $1 and valor = -12000',
      [extracto],
    )
    await como(db, 'contador', 'select public.conciliar_linea($1, null)', [linea!.id])
    const [otro] = await como<{ id: string }>(
      db,
      'contador',
      "select a.id from public.asientos a where a.cuenta = '5305' limit 1",
    )
    expect(await error(como(db, 'contador', 'select public.conciliar_linea($1, $2)', [linea!.id, otro!.id]))).toMatch(/no es de esta cuenta/)
    await como(db, 'contador', 'select public.conciliar_linea($1, $2)', [linea!.id, linea!.asiento_id])
    await como(db, 'contador', 'select public.cerrar_conciliacion($1)', [extracto])
  })

  it('el cierre del mes exige la conciliación de cada banco con movimientos', async () => {
    const lista = await como<{ item: string; ok: boolean }>(db, 'contador', 'select item, ok from public.checklist_cierre($1, $2)', [anio, mes])
    expect(lista.find((i) => i.item === 'bancos')?.ok).toBe(true)
    await como(db, 'contador', 'select public.cerrar_conciliacion($1, false)', [extracto])
    const lista2 = await como<{ item: string; ok: boolean; detalle: string }>(
      db,
      'contador',
      'select item, ok, detalle from public.checklist_cierre($1, $2)',
      [anio, mes],
    )
    expect(lista2.find((i) => i.item === 'bancos')).toMatchObject({ ok: false, detalle: 'Falta: Banco flujo' })
  })
})

describe('flujo de caja', () => {
  it('flujo del período por concepto (sin traslados)', async () => {
    const filas = await como<{ concepto: string; entradas: string; salidas: string }>(
      db,
      'contador',
      "select * from public.flujo_efectivo(date_trunc('month', current_date)::date, current_date)",
    )
    const de = (c: string) => filas.find((f) => f.concepto === c)
    expect(Number(de('Cobros a clientes')?.entradas)).toBe(975_000)
    expect(Number(de('Gastos y otros pagos')?.salidas)).toBe(12_000)
  })

  it('proyectado: cobros de la cartera y pagos a proveedores en su semana', async () => {
    await venderCredito(400_000)
    const semanas = await como<{ semana: number; cobros: string; pagos: string }>(
      db,
      'contador',
      'select * from public.flujo_proyectado(4)',
    )
    expect(semanas).toHaveLength(4)
    const cobros = semanas.reduce((s, x) => s + Number(x.cobros), 0)
    const pagos = semanas.reduce((s, x) => s + Number(x.pagos), 0)
    // Venta de 400.000 que vence en 10 días; la entrada de 1.000.000 al proveedor, sin plazo (ya vencida: semana 1)
    expect(cobros).toBe(400_000)
    expect(Number(semanas[1]!.cobros)).toBe(400_000)
    expect(pagos).toBe(1_000_000)
    expect(Number(semanas[0]!.pagos)).toBe(1_000_000)
  })
})
