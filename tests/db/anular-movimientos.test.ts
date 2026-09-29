import type { PGlite } from '@electric-sql/pglite'
import { beforeAll, describe, expect, it } from 'vitest'
import {
  como,
  costoPromedio,
  crearBase,
  crearProducto,
  crearProveedor,
  error,
  registrar,
  stock,
  unaComo,
  type Usuario,
} from './base'

// Migración 0020: anular movimientos con clave de anulación
const CLAVE = '4821'
let db: PGlite
let cliente: string
let proveedor: string

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
})

type Resultado = { ok: boolean; error?: string; anulacion_id?: string }

async function anular(id: string, clave = CLAVE, usuario: Usuario = 'admin') {
  const { r } = await unaComo<{ r: Resultado }>(
    db,
    usuario,
    "select public.anular_movimiento($1, 'Registrado por error', $2) as r",
    [id, clave],
  )
  if (!r.ok) throw new Error(r.error)
  return r.anulacion_id!
}

const vender = (items: unknown[], extra: { credito?: boolean } = {}) =>
  unaComo<{ id: string }>(
    db,
    'admin',
    `select public.registrar_venta(p_items => $1::jsonb, p_cliente_id => $2, p_credito => $3, p_vence => current_date + 30) as id`,
    [JSON.stringify(items), cliente, extra.credito ?? false],
  ).then((r) => r.id)

const estadoUnidad = (serial: string) =>
  db
    .query<{ estado: string; numero_serie: string }>(
      'select estado, numero_serie from public.unidades where numero_serie like $1',
      [`${serial}%`],
    )
    .then((r) => r.rows[0]!)

describe('clave de anulación', () => {
  it('sin clave definida no se puede anular', async () => {
    const producto = await crearProducto(db, { nombre: 'Sin clave' })
    const entrada = await registrar(db, 'admin', 'entrada', [
      { producto_id: producto, cantidad: 1, costo_unitario: 10 },
    ])
    expect(await error(anular(entrada))).toMatch(/Configuración/)
  })

  it('solo admin la define; nadie la puede leer', async () => {
    expect(await error(como(db, 'bodega', "select public.definir_clave_anulacion('9999')"))).toMatch(/administrador/)
    expect(await error(como(db, 'admin', "select public.definir_clave_anulacion('12')"))).toMatch(/entre 4 y 32/)
    const [{ r }] = await como<{ r: Resultado }>(db, 'admin', 'select public.definir_clave_anulacion($1) as r', [CLAVE])
    expect(r.ok).toBe(true)
    expect(await error(como(db, 'admin', 'select * from public.seguridad'))).toMatch(/permission denied/)
    expect(await como(db, 'admin', 'select public.hay_clave_anulacion() as h')).toEqual([{ h: true }])
    expect(await como(db, 'lectura', 'select public.hay_clave_anulacion() as h')).toEqual([{ h: false }])
    // Guardada cifrada
    const [fila] = (await db.query<{ c: string }>('select clave_anulacion c from public.seguridad')).rows
    expect(fila!.c).not.toContain(CLAVE)
  })

  it('cambiarla exige la clave actual', async () => {
    const [{ r }] = await como<{ r: Resultado }>(
      db,
      'admin',
      "select public.definir_clave_anulacion('0000', 'mala') as r",
    )
    expect(r).toEqual({ ok: false, error: 'La clave de anulación no es correcta' })
    const [{ r: bien }] = await como<{ r: Resultado }>(
      db,
      'admin',
      'select public.definir_clave_anulacion($1, $1) as r',
      [CLAVE],
    )
    expect(bien.ok).toBe(true)
  })

  it('solo admin anula, y con la clave correcta', async () => {
    const producto = await crearProducto(db, { nombre: 'Permisos' })
    const entrada = await registrar(db, 'admin', 'entrada', [
      { producto_id: producto, cantidad: 1, costo_unitario: 10 },
    ])
    expect(await error(anular(entrada, CLAVE, 'bodega'))).toMatch(/administrador/)
    expect(await error(anular(entrada, '0000'))).toMatch(/no es correcta/)
    await anular(entrada)
  })

  it('bloquea tras 5 intentos fallidos, y el bloqueo se recuerda', async () => {
    const producto = await crearProducto(db, { nombre: 'Bloqueo' })
    const entrada = await registrar(db, 'admin', 'entrada', [
      { producto_id: producto, cantidad: 1, costo_unitario: 10 },
    ])
    for (let i = 0; i < 5; i++) expect(await error(anular(entrada, 'xxxx'))).toMatch(/no es correcta/)
    expect(await error(anular(entrada))).toMatch(/15 minutos/)
    await db.exec('delete from public.intentos_clave')
    await anular(entrada)
  })
})

describe('anular una venta', () => {
  it('devuelve el stock y los seriales, y sale de reportes y cartera', async () => {
    const cable = await crearProducto(db, { nombre: 'Cable' })
    const camara = await crearProducto(db, { nombre: 'Cámara', serializado: true })
    await registrar(db, 'admin', 'entrada', [
      { producto_id: cable, cantidad: 10, costo_unitario: 5 },
      { producto_id: camara, costo_unitario: 100, series: [{ numero_serie: 'CAM-V1' }] },
    ])
    const [{ id: unidad }] = await como<{ id: string }>(
      db,
      'admin',
      "select id from public.unidades where numero_serie = 'CAM-V1'",
    )
    const venta = await vender(
      [
        { producto_id: cable, cantidad: 4, precio_unitario: 8 },
        { producto_id: camara, precio_unitario: 150, unidad_ids: [unidad] },
      ],
      { credito: true },
    )
    expect(await como(db, 'admin', 'select id from public.cartera where id = $1', [venta])).toHaveLength(1)

    const anulacion = await anular(venta)
    expect(await stock(db, cable)).toBe(10)
    expect(await stock(db, camara)).toBe(1)
    expect((await estadoUnidad('CAM-V1')).estado).toBe('disponible')
    expect(await costoPromedio(db, cable)).toBe(5)
    expect(await como(db, 'admin', 'select id from public.cartera where id = $1', [venta])).toEqual([])

    const [historial] = await como<{ anulado_at: string | null }>(
      db,
      'lectura',
      'select anulado_at from public.movimientos_resumen where id = $1',
      [venta],
    )
    expect(historial!.anulado_at).not.toBeNull()
    const [contrario] = await como<{ tipo: string; anula_id: string }>(
      db,
      'admin',
      'select tipo, anula_id from public.movimientos where id = $1',
      [anulacion],
    )
    expect(contrario).toEqual({ tipo: 'ajuste_entrada', anula_id: venta })

    expect(await error(anular(venta))).toMatch(/ya está anulado/)
    expect(await error(anular(anulacion))).toMatch(/es una anulación/)
    // Ni devoluciones ni abonos sobre una venta anulada
    expect(
      await error(
        como(
          db,
          'admin',
          `select public.registrar_movimiento(p_tipo => 'ajuste_entrada', p_items => $1::jsonb,
             p_motivo => 'devolucion_cliente', p_movimiento_origen_id => $2)`,
          [JSON.stringify([{ producto_id: cable, cantidad: 1 }]), venta],
        ),
      ),
    ).toMatch(/anulada/)
    expect(await error(como(db, 'admin', "select public.registrar_pago($1, 10, 'efectivo')", [venta]))).toMatch(
      /anulada/,
    )
  })

  it('no se anula con abonos o devoluciones', async () => {
    const producto = await crearProducto(db, { nombre: 'Con abonos' })
    await registrar(db, 'admin', 'entrada', [{ producto_id: producto, cantidad: 10, costo_unitario: 5 }])
    const conAbono = await vender([{ producto_id: producto, cantidad: 2, precio_unitario: 10 }], { credito: true })
    await como(db, 'admin', "select public.registrar_pago($1, 5, 'efectivo')", [conAbono])
    expect(await error(anular(conAbono))).toMatch(/abonos/)

    const conDevolucion = await vender([{ producto_id: producto, cantidad: 2, precio_unitario: 10 }])
    await como(
      db,
      'admin',
      `select public.registrar_movimiento(p_tipo => 'ajuste_entrada', p_items => $1::jsonb,
         p_motivo => 'devolucion_cliente', p_movimiento_origen_id => $2)`,
      [JSON.stringify([{ producto_id: producto, cantidad: 1 }]), conDevolucion],
    )
    expect(await error(anular(conDevolucion))).toMatch(/devoluciones/)
  })

  it('una cotización vendida vuelve a quedar abierta y se puede vender otra vez', async () => {
    const producto = await crearProducto(db, { nombre: 'Cotizado' })
    await registrar(db, 'admin', 'entrada', [{ producto_id: producto, cantidad: 10, costo_unitario: 5 }])
    const items = JSON.stringify([{ producto_id: producto, cantidad: 1, precio_unitario: 9 }])
    const { id: cotizacion } = await unaComo<{ id: string }>(
      db,
      'admin',
      'select public.guardar_cotizacion(p_items => $1::jsonb, p_valida_hasta => current_date + 5, p_cliente_id => $2) as id',
      [items, cliente],
    )
    const venta = (
      await unaComo<{ id: string }>(
        db,
        'admin',
        'select public.registrar_venta(p_items => $1::jsonb, p_cotizacion_id => $2) as id',
        [items, cotizacion],
      )
    ).id
    await anular(venta)
    const estado = () =>
      unaComo<{ estado: string; venta_id: string | null }>(
        db,
        'admin',
        'select estado, venta_id from public.cotizaciones_resumen where id = $1',
        [cotizacion],
      )
    expect(await estado()).toEqual({ estado: 'abierta', venta_id: null })
    await unaComo(db, 'admin', 'select public.registrar_venta(p_items => $1::jsonb, p_cotizacion_id => $2)', [
      items,
      cotizacion,
    ])
    expect((await estado()).estado).toBe('aceptada')
  })
})

describe('anular una entrada', () => {
  it('saca lo que entró y el costo promedio vuelve a ser el de antes', async () => {
    const producto = await crearProducto(db, { nombre: 'Promedio' })
    await registrar(db, 'admin', 'entrada', [{ producto_id: producto, cantidad: 10, costo_unitario: 100 }])
    const errada = await registrar(db, 'admin', 'entrada', [
      { producto_id: producto, cantidad: 10, costo_unitario: 300 },
    ])
    expect(await costoPromedio(db, producto)).toBe(200)
    await anular(errada)
    expect(await stock(db, producto)).toBe(10)
    expect(await costoPromedio(db, producto)).toBe(100)
  })

  it('no se anula si ya salió parte de la mercancía', async () => {
    const producto = await crearProducto(db, { nombre: 'Vendido' })
    const entrada = await registrar(db, 'admin', 'entrada', [
      { producto_id: producto, cantidad: 5, costo_unitario: 10 },
    ])
    await vender([{ producto_id: producto, cantidad: 1, precio_unitario: 20 }])
    expect(await error(anular(entrada))).toMatch(/Ya salió parte/)
  })

  it('los seriales quedan de baja y renombrados: se pueden registrar de nuevo', async () => {
    const producto = await crearProducto(db, { nombre: 'Router', serializado: true })
    const entrada = await registrar(db, 'admin', 'entrada', [
      { producto_id: producto, costo_unitario: 50, series: [{ numero_serie: 'RT-001' }] },
    ])
    await anular(entrada)
    const unidad = await estadoUnidad('RT-001-ANULADO')
    expect(unidad.estado).toBe('baja')
    expect(await stock(db, producto)).toBe(0)
    await registrar(db, 'admin', 'entrada', [
      { producto_id: producto, costo_unitario: 55, series: [{ numero_serie: 'RT-001' }] },
    ])
    expect(await stock(db, producto)).toBe(1)
  })

  it('una orden de compra recibida vuelve a quedar abierta', async () => {
    const producto = await crearProducto(db, { nombre: 'De la orden' })
    const { id: orden } = await unaComo<{ id: string }>(
      db,
      'admin',
      'select public.guardar_orden_compra(p_proveedor_id => $1, p_items => $2::jsonb) as id',
      [proveedor, JSON.stringify([{ producto_id: producto, cantidad: 3, costo_unitario: 10 }])],
    )
    const { id: entrada } = await unaComo<{ id: string }>(
      db,
      'admin',
      'select public.recibir_orden_compra(p_orden_id => $1, p_items => $2::jsonb) as id',
      [orden, JSON.stringify([{ producto_id: producto, cantidad: 3, costo_unitario: 10 }])],
    )
    const resumen = () =>
      unaComo<{ estado: string; recibidas: number }>(
        db,
        'admin',
        'select estado, recibidas from public.ordenes_compra_resumen where id = $1',
        [orden],
      )
    expect(await resumen()).toEqual({ estado: 'recibida', recibidas: 3 })
    await anular(entrada)
    expect(await resumen()).toEqual({ estado: 'abierta', recibidas: 0 })
  })

  it('los ajustes no se anulan', async () => {
    const producto = await crearProducto(db, { nombre: 'Ajustado' })
    const ajuste = await registrar(
      db,
      'admin',
      'ajuste_entrada',
      [{ producto_id: producto, cantidad: 1, costo_unitario: 1 }],
      {
        motivo: 'inventario_inicial',
      },
    )
    expect(await error(anular(ajuste))).toMatch(/ajustes no se anulan/)
  })
})
