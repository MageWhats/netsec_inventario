import { supabase } from './supabase'
import { traerTodo } from './paginar'

/*
 * Las columnas de costo (productos.precio_costo y movimiento_items.costo_unitario) no se pueden leer de
 * las tablas (migración 0015): se piden a estas funciones, que solo responden a admin, lectura y contador.
 * Para bodega devuelven mapas vacíos y el costo queda en 0 / null.
 */

/** Costo de cada producto (medio de sus capas PEPS), por id */
export async function traerCostosProductos(): Promise<Map<string, number>> {
  const { filas } = await traerTodo(
    (desde, hasta) => supabase.rpc('costos_productos').order('producto_id').range(desde, hasta),
    100_000,
  )
  return new Map(filas.map((f) => [f.producto_id, Number(f.precio_costo)]))
}

/** Costo de cada línea de movimiento, por id de línea: las de un movimiento o las de un período */
export async function traerCostosLineas(
  filtro: { movimientoId: string } | { desde: string; hasta: string },
): Promise<Map<string, number | null>> {
  const args =
    'movimientoId' in filtro
      ? { p_movimiento_id: filtro.movimientoId }
      : { p_desde: filtro.desde, p_hasta: filtro.hasta }
  const { filas } = await traerTodo(
    (desde, hasta) => supabase.rpc('costos_lineas', args).order('id').range(desde, hasta),
    100_000,
  )
  return new Map(filas.map((f) => [f.id, f.costo_unitario === null ? null : Number(f.costo_unitario)]))
}
