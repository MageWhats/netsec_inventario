import type { PGlite } from '@electric-sql/pglite'
import { beforeAll, describe, expect, it } from 'vitest'
import { como, costoPromedio, crearBase, crearProducto, crearProveedor, error, stock, unaComo } from './base'

// Migración 0017: órdenes de compra
let db: PGlite
let proveedor: string
let switchId: string
let camara: string

beforeAll(async () => {
  db = await crearBase()
  proveedor = await crearProveedor(db)
  switchId = await crearProducto(db, { nombre: 'Switch 24p' })
  camara = await crearProducto(db, { nombre: 'Cámara domo', serializado: true })
})

async function crearOrden(items: unknown[]) {
  const { id } = await unaComo<{ id: string }>(
    db,
    'admin',
    'select public.guardar_orden_compra(p_proveedor_id => $1, p_items => $2::jsonb) as id',
    [proveedor, JSON.stringify(items)],
  )
  return id
}

function recibir(orden: string, items: unknown[], usuario: 'admin' | 'bodega' = 'admin') {
  return unaComo<{ id: string }>(
    db,
    usuario,
    "select public.recibir_orden_compra(p_orden_id => $1, p_items => $2::jsonb, p_referencia => 'FAC-1') as id",
    [orden, JSON.stringify(items)],
  )
}

const resumen = (orden: string) =>
  unaComo<{ numero: number; estado: string; unidades: number; recibidas: number; total: string }>(
    db,
    'admin',
    'select * from public.ordenes_compra_resumen where id = $1',
    [orden],
  )

describe('órdenes de compra', () => {
  it('numera las órdenes y calcula el total', async () => {
    const orden = await crearOrden([
      { producto_id: switchId, cantidad: 10, costo_unitario: 100 },
      { producto_id: camara, cantidad: 2, costo_unitario: 500 },
    ])
    const r = await resumen(orden)
    expect(r.numero).toBe(1)
    expect(r.estado).toBe('abierta')
    expect(r.unidades).toBe(12)
    expect(Number(r.total)).toBe(2000)
  })

  it('se recibe en varias entregas y se cierra sola al llegar todo', async () => {
    const orden = await crearOrden([
      { producto_id: switchId, cantidad: 10, costo_unitario: 100 },
      { producto_id: camara, cantidad: 2, costo_unitario: 500 },
    ])
    const antes = await stock(db, switchId)

    const { id: mov } = await recibir(orden, [{ producto_id: switchId, cantidad: 6, costo_unitario: 100 }])
    expect((await resumen(orden)).estado).toBe('abierta')
    expect((await resumen(orden)).recibidas).toBe(6)
    const [entrada] = await como<{ orden_compra_id: string; proveedor_id: string; tipo: string }>(
      db,
      'admin',
      'select orden_compra_id, proveedor_id, tipo from public.movimientos where id = $1',
      [mov],
    )
    expect(entrada).toEqual({ orden_compra_id: orden, proveedor_id: proveedor, tipo: 'entrada' })

    await recibir(orden, [
      { producto_id: switchId, cantidad: 4, costo_unitario: 100 },
      { producto_id: camara, costo_unitario: 500, series: [{ numero_serie: 'DOMO-1' }, { numero_serie: 'DOMO-2' }] },
    ])
    expect((await resumen(orden)).estado).toBe('recibida')
    expect(await stock(db, switchId)).toBe(antes + 10)
    expect(await costoPromedio(db, camara)).toBe(500)
  })

  it('no deja recibir más de lo pedido ni productos que no están en la orden', async () => {
    const orden = await crearOrden([{ producto_id: switchId, cantidad: 3, costo_unitario: 100 }])
    const antes = await stock(db, switchId)
    expect(await error(recibir(orden, [{ producto_id: switchId, cantidad: 4, costo_unitario: 100 }]))).toMatch(
      /no se puede recibir más de lo pedido/,
    )
    expect(
      await error(recibir(orden, [{ producto_id: camara, costo_unitario: 1, series: [{ numero_serie: 'X-9' }] }])),
    ).toMatch(/Solo se pueden recibir productos de la orden/)
    // Nada quedó registrado a medias
    expect(await stock(db, switchId)).toBe(antes)
  })

  it('se edita solo mientras no tenga entregas, y se puede cancelar', async () => {
    const orden = await crearOrden([{ producto_id: switchId, cantidad: 5, costo_unitario: 100 }])
    await unaComo(
      db,
      'admin',
      'select public.guardar_orden_compra(p_id => $1, p_proveedor_id => $2, p_items => $3::jsonb)',
      [orden, proveedor, JSON.stringify([{ producto_id: switchId, cantidad: 8, costo_unitario: 90 }])],
    )
    expect((await resumen(orden)).unidades).toBe(8)

    await recibir(orden, [{ producto_id: switchId, cantidad: 1, costo_unitario: 90 }])
    expect(
      await error(
        unaComo(
          db,
          'admin',
          'select public.guardar_orden_compra(p_id => $1, p_proveedor_id => $2, p_items => $3::jsonb)',
          [orden, proveedor, JSON.stringify([{ producto_id: switchId, cantidad: 2 }])],
        ),
      ),
    ).toMatch(/ya tiene mercancía recibida/)

    await unaComo(db, 'admin', 'select public.cancelar_orden_compra($1)', [orden])
    expect((await resumen(orden)).estado).toBe('cancelada')
    expect(await error(recibir(orden, [{ producto_id: switchId, cantidad: 1 }]))).toMatch(/ya está cerrada/)
  })

  it('solo admin las gestiona; bodega ni siquiera las ve', async () => {
    const orden = await crearOrden([{ producto_id: switchId, cantidad: 1, costo_unitario: 100 }])
    expect(await error(recibir(orden, [{ producto_id: switchId, cantidad: 1 }], 'bodega'))).toMatch(
      /Solo un administrador/,
    )
    expect(await como(db, 'bodega', 'select * from public.ordenes_compra_resumen')).toHaveLength(0)
    expect(await como(db, 'lectura', 'select * from public.ordenes_compra_resumen')).not.toHaveLength(0)
    expect(await error(como(db, 'admin', "update public.ordenes_compra set estado = 'recibida'"))).toMatch(
      /permission denied/,
    )
  })
})
