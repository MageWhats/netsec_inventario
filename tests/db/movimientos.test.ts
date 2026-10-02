import type { PGlite } from '@electric-sql/pglite'
import { beforeAll, describe, expect, it } from 'vitest'
import { como, costoPromedio, crearBase, crearProducto, error, registrar, stock, unaComo } from './base'

let db: PGlite
beforeAll(async () => {
  db = await crearBase()
})

// Migración 0023: PEPS. precio_costo es el costo medio de lo que queda en las capas
describe('costo PEPS', () => {
  it('el costo del producto es el medio de lo que queda en las capas', async () => {
    const p = await crearProducto(db, { nombre: 'Cable UTP' })
    await registrar(db, 'admin', 'entrada', [{ producto_id: p, cantidad: 10, costo_unitario: 1000 }])
    expect(await costoPromedio(db, p)).toBe(1000)

    // (10 × 1000 + 30 × 2000) / 40 = 1750
    await registrar(db, 'admin', 'entrada', [{ producto_id: p, cantidad: 30, costo_unitario: 2000 }])
    expect(await costoPromedio(db, p)).toBe(1750)
    expect(await stock(db, p)).toBe(40)
  })

  it('las salidas consumen primero lo más antiguo', async () => {
    const p = await crearProducto(db, { nombre: 'Conector RJ45' })
    await registrar(db, 'admin', 'entrada', [{ producto_id: p, cantidad: 4, costo_unitario: 100 }])
    await registrar(db, 'admin', 'entrada', [{ producto_id: p, cantidad: 4, costo_unitario: 300 }])
    const venta1 = await registrar(db, 'bodega', 'salida', [{ producto_id: p, cantidad: 3, precio_unitario: 500 }])
    // Toma 1 de la primera capa (100) y 2 de la segunda (300): (100 + 600) / 3 = 233,33
    const venta2 = await registrar(db, 'bodega', 'salida', [{ producto_id: p, cantidad: 3, precio_unitario: 500 }])

    const costo = async (id: string) =>
      Number(
        (
          await unaComo<{ costo_unitario: string }>(
            db,
            'admin',
            'select * from public.costos_lineas(p_movimiento_id => $1)',
            [id],
          )
        ).costo_unitario,
      )
    expect(await costo(venta1)).toBe(100)
    expect(await costo(venta2)).toBe(233.33)
    // Quedan 2 de la segunda capa
    expect(await costoPromedio(db, p)).toBe(300)
    expect(await stock(db, p)).toBe(2)
  })

  it('si el stock llegó a cero, la siguiente entrada fija el costo', async () => {
    const p = await crearProducto(db, { nombre: 'Canaleta' })
    await registrar(db, 'admin', 'entrada', [{ producto_id: p, cantidad: 2, costo_unitario: 100 }])
    await registrar(db, 'admin', 'salida', [{ producto_id: p, cantidad: 2, precio_unitario: 150 }])
    await registrar(db, 'admin', 'entrada', [{ producto_id: p, cantidad: 1, costo_unitario: 900 }])
    expect(await costoPromedio(db, p)).toBe(900)
  })

  it('el costo no se puede editar a mano', async () => {
    const p = await crearProducto(db, { nombre: 'Patch cord' })
    expect(await error(como(db, 'admin', 'update public.productos set precio_costo = 5 where id = $1', [p]))).toMatch(
      /se calcula automáticamente/,
    )
  })
})

describe('stock y seriales', () => {
  it('no deja sacar más de lo que hay', async () => {
    const p = await crearProducto(db, { nombre: 'Router' })
    await registrar(db, 'admin', 'entrada', [{ producto_id: p, cantidad: 2, costo_unitario: 10 }])
    expect(await error(registrar(db, 'bodega', 'salida', [{ producto_id: p, cantidad: 3 }]))).toMatch(
      /Stock insuficiente/,
    )
    expect(await stock(db, p)).toBe(2)
  })

  it('una unidad con serial entra una vez y sale una vez', async () => {
    const p = await crearProducto(db, { nombre: 'Cámara IP', serializado: true })
    await registrar(db, 'admin', 'entrada', [
      { producto_id: p, costo_unitario: 50, series: [{ numero_serie: 'cam-001' }] },
    ])
    expect(
      await error(
        registrar(db, 'admin', 'entrada', [
          { producto_id: p, costo_unitario: 50, series: [{ numero_serie: 'CAM-001' }] },
        ]),
      ),
    ).toMatch(/ya está registrado/)

    const [unidad] = await como<{ id: string; numero_serie: string }>(
      db,
      'bodega',
      'select id, numero_serie from public.unidades where producto_id = $1',
      [p],
    )
    expect(unidad!.numero_serie).toBe('CAM-001') // se guarda en mayúsculas
    await registrar(db, 'bodega', 'salida', [{ producto_id: p, unidad_ids: [unidad!.id] }])
    expect(await error(registrar(db, 'bodega', 'salida', [{ producto_id: p, unidad_ids: [unidad!.id] }]))).toMatch(
      /no está disponible/,
    )
  })
})

describe('permisos', () => {
  it('bodega registra entradas y salidas, pero no ajustes', async () => {
    const p = await crearProducto(db, { nombre: 'Access point' })
    await registrar(db, 'bodega', 'entrada', [{ producto_id: p, cantidad: 1, costo_unitario: 10 }])
    expect(
      await error(
        registrar(db, 'bodega', 'ajuste_entrada', [{ producto_id: p, cantidad: 1 }], { motivo: 'sobrante_conteo' }),
      ),
    ).toMatch(/Solo un administrador/)
  })

  it('lectura no registra nada', async () => {
    const p = await crearProducto(db, { nombre: 'NVR' })
    expect(await error(registrar(db, 'lectura', 'entrada', [{ producto_id: p, cantidad: 1 }]))).toMatch(
      /No tienes permisos/,
    )
  })

  it('los movimientos no se editan ni se borran', async () => {
    expect(await error(como(db, 'admin', "update public.movimientos set notas = 'x'"))).toMatch(/permission denied/)
    expect(await error(como(db, 'admin', 'delete from public.movimiento_items'))).toMatch(/permission denied/)
  })
})
