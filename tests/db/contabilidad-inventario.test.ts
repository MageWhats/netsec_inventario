import type { PGlite } from '@electric-sql/pglite'
import { beforeAll, describe, expect, it } from 'vitest'
import { como, costoPromedio, crearBase, crearProducto, crearProveedor, error, registrar, stock, unaComo } from './base'

// Migración 0023: costo PEPS por capas y asientos automáticos del inventario
const CLAVE = '4821'
let db: PGlite
let proveedor: string
let cliente: string

const costoLinea = async (movimientoId: string) =>
  (
    await como<{ costo_unitario: string }>(db, 'admin', 'select * from public.costos_lineas(p_movimiento_id => $1)', [
      movimientoId,
    ])
  ).map((l) => Number(l.costo_unitario))

async function anular(id: string) {
  const { r } = await unaComo<{ r: { ok: boolean; error?: string; anulacion_id?: string } }>(
    db,
    'admin',
    "select public.anular_movimiento($1, 'Registrado por error', $2) as r",
    [id, CLAVE],
  )
  if (!r.ok) throw new Error(r.error)
  return r.anulacion_id!
}

const vender = (items: unknown[]) =>
  unaComo<{ id: string }>(
    db,
    'admin',
    'select public.registrar_venta(p_items => $1::jsonb, p_cliente_id => $2, p_credito => false) as id',
    [JSON.stringify(items), cliente],
  ).then((r) => r.id)

const entrar = (items: unknown[], extra: { fecha?: string; proveedor?: string | null } = {}) =>
  unaComo<{ id: string }>(
    db,
    'admin',
    `select public.registrar_movimiento(p_tipo => 'entrada', p_items => $1::jsonb, p_proveedor_id => $2,
       p_fecha => coalesce($3::timestamptz, now())) as id`,
    [JSON.stringify(items), extra.proveedor === undefined ? proveedor : extra.proveedor, extra.fecha ?? null],
  ).then((r) => r.id)

/** Líneas del comprobante MI de un movimiento: [cuenta, débito, crédito] */
const asiento = (movimientoId: string) =>
  como<{ cuenta: string; debito: string; credito: string; proveedor_id: string | null }>(
    db,
    'contador',
    `select a.cuenta, a.debito, a.credito, a.proveedor_id
     from public.asientos a join public.comprobantes c on c.id = a.comprobante_id
     where c.movimiento_id = $1 order by a.linea`,
    [movimientoId],
  ).then((filas) => filas.map((f) => [f.cuenta, Number(f.debito), Number(f.credito)]))

const conciliacion = () =>
  unaComo<{ saldo_contable: string; valor_inventario: string; diferencia: string }>(
    db,
    'contador',
    'select * from public.conciliacion_inventario()',
  ).then((r) => ({
    saldo: Number(r.saldo_contable),
    valor: Number(r.valor_inventario),
    diferencia: Number(r.diferencia),
  }))

beforeAll(async () => {
  db = await crearBase()
  proveedor = await crearProveedor(db)
  cliente = (
    await unaComo<{ id: string }>(
      db,
      'admin',
      "insert into public.clientes (nombre, tipo_documento, documento) values ('Cliente', 'CC', '1020304050') returning id",
    )
  ).id
  await como(db, 'admin', 'select public.definir_clave_anulacion($1)', [CLAVE])
})

describe('PEPS', () => {
  it('anular una venta devuelve lo consumido a las mismas capas', async () => {
    const p = await crearProducto(db, { nombre: 'Switch PEPS' })
    await entrar([{ producto_id: p, cantidad: 2, costo_unitario: 100 }])
    await entrar([{ producto_id: p, cantidad: 2, costo_unitario: 500 }])
    const venta = await vender([{ producto_id: p, cantidad: 1, precio_unitario: 900 }])
    expect(await costoLinea(venta)).toEqual([100])

    await anular(venta)
    // La unidad volvió a la capa de 100: la próxima venta vuelve a salir a 100
    const otra = await vender([{ producto_id: p, cantidad: 2, precio_unitario: 900 }])
    expect(await costoLinea(otra)).toEqual([100])
    expect(await costoPromedio(db, p)).toBe(500)
  })

  it('una entrada solo se anula si nada de ella ha salido', async () => {
    const p = await crearProducto(db, { nombre: 'Router PEPS' })
    const vieja = await entrar([{ producto_id: p, cantidad: 5, costo_unitario: 100 }])
    const nueva = await entrar([{ producto_id: p, cantidad: 5, costo_unitario: 300 }])
    await vender([{ producto_id: p, cantidad: 1, precio_unitario: 900 }])
    // Hay stock suficiente, pero lo vendido salió de la entrada vieja
    expect(await error(anular(vieja))).toMatch(/Ya salió parte/)
    await anular(nueva)
    expect(await stock(db, p)).toBe(4)
    expect(await costoPromedio(db, p)).toBe(100)
  })

  it('una devolución vuelve al costo con el que salió', async () => {
    const p = await crearProducto(db, { nombre: 'Cargador PEPS' })
    await entrar([{ producto_id: p, cantidad: 1, costo_unitario: 100 }])
    await entrar([{ producto_id: p, cantidad: 1, costo_unitario: 700 }])
    const venta = await vender([{ producto_id: p, cantidad: 1, precio_unitario: 900 }])
    const devolucion = await unaComo<{ id: string }>(
      db,
      'admin',
      `select public.registrar_movimiento(p_tipo => 'ajuste_entrada', p_items => $1::jsonb,
         p_motivo => 'devolucion_cliente', p_movimiento_origen_id => $2) as id`,
      [JSON.stringify([{ producto_id: p, cantidad: 1 }]), venta],
    )
    expect(await costoLinea(devolucion.id)).toEqual([100])
    // Quedan la capa de 700 y la devuelta de 100
    expect(await costoPromedio(db, p)).toBe(400)
  })

  it('un equipo con serial sale al costo de la capa más antigua', async () => {
    const p = await crearProducto(db, { nombre: 'AP serial', serializado: true })
    await entrar([{ producto_id: p, costo_unitario: 1000, series: [{ numero_serie: 'AP-1' }] }])
    await entrar([{ producto_id: p, costo_unitario: 1500, series: [{ numero_serie: 'AP-2' }] }])
    const { id: unidad } = (
      await db.query<{ id: string }>("select id from public.unidades where numero_serie = 'AP-2'")
    ).rows[0]!
    // Se despacha el serial nuevo, pero PEPS toma el costo más antiguo
    const venta = await vender([{ producto_id: p, unidad_ids: [unidad], precio_unitario: 3000 }])
    expect(await costoLinea(venta)).toEqual([1000])
  })

  it('bodega no ve las capas', async () => {
    expect(await como(db, 'bodega', 'select * from public.capas_costo')).toHaveLength(0)
    expect(
      (await como<{ n: number }>(db, 'lectura', 'select count(*)::int n from public.capas_costo'))[0]!.n,
    ).toBeGreaterThan(0)
  })
})

describe('asientos automáticos', () => {
  let p: string

  it('antes del arranque no se contabiliza nada', async () => {
    p = await crearProducto(db, { nombre: 'Reloj contable' })
    // Inventario que ya existía antes del arranque (fecha del mes pasado)
    const vieja = await entrar([{ producto_id: p, cantidad: 10, costo_unitario: 1000 }], {
      fecha: new Date(Date.now() - 40 * 86_400_000).toISOString(),
    })
    expect(await asiento(vieja)).toEqual([])
  })

  it('arranque con saldos iniciales que incluyen el inventario', async () => {
    await como(
      db,
      'contador',
      "update public.configuracion_contable set fecha_inicio = date_trunc('month', public.hoy_colombia())",
    )
    // Los movimientos de este mes registrados antes de definir el arranque quedan pendientes
    const [{ n }] = await como<{ n: number }>(db, 'contador', 'select public.contabilizar_movimientos_pendientes() n')
    expect(n).toBeGreaterThan(0)
    // El saldo inicial es el inventario al comenzar el mes: solo lo que entró el mes pasado
    const { valor, saldo } = await conciliacion()
    expect(valor - saldo).toBe(10_000)
    await como(
      db,
      'contador',
      "select public.registrar_comprobante('SI', (select fecha_inicio from public.configuracion_contable), 'Apertura', $1::jsonb)",
      [
        JSON.stringify([
          { cuenta: '1435', debito: valor - saldo },
          { cuenta: '3105', credito: valor - saldo },
        ]),
      ],
    )
    expect((await conciliacion()).diferencia).toBe(0)
  })

  it('entrada: inventario contra el proveedor', async () => {
    const entrada = await entrar([{ producto_id: p, cantidad: 5, costo_unitario: 2000 }])
    expect(await asiento(entrada)).toEqual([
      ['1435', 10_000, 0],
      ['2205', 0, 10_000],
    ])
    const [{ proveedor_id }] = await como<{ proveedor_id: string }>(
      db,
      'contador',
      `select a.proveedor_id from public.asientos a join public.comprobantes c on c.id = a.comprobante_id
       where c.movimiento_id = $1 and a.cuenta = '2205'`,
      [entrada],
    )
    expect(proveedor_id).toBe(proveedor)
    expect(await error(entrar([{ producto_id: p, cantidad: 1, costo_unitario: 2000 }], { proveedor: null }))).toMatch(
      /no tiene proveedor/,
    )
  })

  it('después del arranque no se registran movimientos con fecha anterior', async () => {
    expect(
      await error(
        entrar([{ producto_id: p, cantidad: 1, costo_unitario: 2000 }], {
          fecha: new Date(Date.now() - 40 * 86_400_000).toISOString(),
        }),
      ),
    ).toMatch(/fecha anterior/)
  })

  it('venta: costo de ventas a costo PEPS', async () => {
    // 10 a 1000 (antes del arranque) y 2 a 2000
    const venta = await vender([{ producto_id: p, cantidad: 12, precio_unitario: 3000 }])
    expect(await asiento(venta)).toEqual([
      ['6135', 14_000, 0],
      ['1435', 0, 14_000],
    ])
  })

  it('cada motivo de ajuste va a su subcuenta', async () => {
    const ajuste = (tipo: string, motivo: string, cantidad: number) =>
      registrar(db, 'admin', tipo as 'ajuste_salida', [{ producto_id: p, cantidad }], { motivo })
    expect(await asiento(await ajuste('ajuste_salida', 'obsequio', 1))).toEqual([
      ['519545', 2000, 0],
      ['1435', 0, 2000],
    ])
    expect(await asiento(await ajuste('ajuste_salida', 'faltante_conteo', 1))).toEqual([
      ['519535', 2000, 0],
      ['1435', 0, 2000],
    ])
    expect(await asiento(await ajuste('ajuste_entrada', 'sobrante_conteo', 1))).toEqual([
      ['1435', 2000, 0],
      ['425095', 0, 2000],
    ])
  })

  it('anular una venta revierte su costo', async () => {
    const venta = await vender([{ producto_id: p, cantidad: 1, precio_unitario: 3000 }])
    const anulacion = await anular(venta)
    expect(await asiento(anulacion)).toEqual([
      ['1435', 2000, 0],
      ['6135', 0, 2000],
    ])
  })

  it('el saldo de la 1435 cuadra con el valor de las capas', async () => {
    const r = await conciliacion()
    expect(r.diferencia).toBe(0)
    expect(r.saldo).toBeGreaterThan(0)
    expect(await como(db, 'contador', 'select public.contabilizar_movimientos_pendientes() n')).toEqual([{ n: 0 }])
    expect(await error(como(db, 'lectura', 'select public.contabilizar_movimientos_pendientes()'))).toMatch(/contadora/)
  })

  it('en un mes cerrado no se registran movimientos', async () => {
    const [{ anio, mes }] = (
      await db.query<{ anio: number; mes: number }>(
        'select extract(year from public.hoy_colombia())::int anio, extract(month from public.hoy_colombia())::int mes',
      )
    ).rows
    await como(db, 'contador', 'select public.cerrar_periodo($1, $2)', [anio, mes])
    expect(await error(entrar([{ producto_id: p, cantidad: 1, costo_unitario: 2000 }]))).toMatch(/está cerrado/)
    await como(db, 'contador', "select public.reabrir_periodo($1, $2, 'Prueba de cierre')", [anio, mes])
    await entrar([{ producto_id: p, cantidad: 1, costo_unitario: 2000 }])
  })
})
