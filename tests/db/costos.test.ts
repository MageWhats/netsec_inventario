import type { PGlite } from '@electric-sql/pglite'
import { beforeAll, describe, expect, it } from 'vitest'
import { como, crearBase, crearProducto, error, registrar } from './base'

// Migración 0015: bodega no puede leer costos ni consultando la API directamente
let db: PGlite
let producto: string
let entrada: string

beforeAll(async () => {
  db = await crearBase()
  producto = await crearProducto(db)
  entrada = await registrar(db, 'admin', 'entrada', [{ producto_id: producto, cantidad: 5, costo_unitario: 1000 }])
  await registrar(db, 'bodega', 'entrada', [{ producto_id: producto, cantidad: 5, costo_unitario: 2000 }])
})

describe('bodega', () => {
  it('no puede leer las columnas de costo', async () => {
    expect(await error(como(db, 'bodega', 'select precio_costo from public.productos'))).toMatch(/permission denied/)
    expect(await error(como(db, 'bodega', 'select * from public.productos'))).toMatch(/permission denied/)
    expect(await error(como(db, 'bodega', 'select costo_unitario from public.movimiento_items'))).toMatch(
      /permission denied/,
    )
  })

  it('lee el resto de columnas y el stock', async () => {
    expect(
      await como(db, 'bodega', 'select id, nombre, precio_venta, stock_minimo from public.productos'),
    ).toHaveLength(1)
    expect(await como(db, 'bodega', 'select id, cantidad, precio_unitario from public.movimiento_items')).toHaveLength(
      2,
    )
    expect(await como(db, 'bodega', 'select * from public.stock_actual')).toHaveLength(1)
  })

  it('las funciones de costos no le devuelven nada', async () => {
    expect(await como(db, 'bodega', 'select * from public.costos_productos()')).toHaveLength(0)
    expect(
      await como(db, 'bodega', 'select * from public.costos_lineas(p_movimiento_id => $1)', [entrada]),
    ).toHaveLength(0)
    const resumen = await como<{ total_costo: string }>(
      db,
      'bodega',
      'select total_costo from public.movimientos_resumen',
    )
    expect(resumen.map((r) => Number(r.total_costo))).toEqual([0, 0])
  })
})

describe.each(['admin', 'lectura'] as const)('%s', (usuario) => {
  it('ve el costo promedio y el de cada línea', async () => {
    const [costo] = await como<{ precio_costo: string }>(db, usuario, 'select * from public.costos_productos()')
    expect(Number(costo!.precio_costo)).toBe(1500)

    const lineas = await como<{ costo_unitario: string }>(
      db,
      usuario,
      'select * from public.costos_lineas(p_movimiento_id => $1)',
      [entrada],
    )
    expect(lineas.map((l) => Number(l.costo_unitario))).toEqual([1000])

    const periodo = await como(
      db,
      usuario,
      "select * from public.costos_lineas(p_desde => now() - interval '1 day', p_hasta => now())",
    )
    expect(periodo).toHaveLength(2)
  })

  it('sin filtro, costos_lineas no devuelve toda la tabla', async () => {
    expect(await como(db, usuario, 'select * from public.costos_lineas()')).toHaveLength(0)
  })

  it('ve el total a costo del historial', async () => {
    const [fila] = await como<{ t: string }>(db, usuario, 'select sum(total_costo) t from public.movimientos_resumen')
    expect(Number(fila!.t)).toBe(15000)
  })
})
