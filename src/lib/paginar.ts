import type { PostgrestError } from '@supabase/supabase-js'

/**
 * Supabase devuelve como máximo 1000 filas por consulta (Settings → API → Max rows), y lo hace
 * sin avisar. Esta función pide página a página hasta traerlo todo o llegar a `maximo`.
 * La consulta debe tener un orden estable (p. ej. terminar en .order('id')) para no repetir filas.
 */
export const TAMANO_PAGINA = 1000

export async function traerTodo<T>(
  consulta: (desde: number, hasta: number) => PromiseLike<{ data: T[] | null; error: PostgrestError | null }>,
  maximo = 20_000,
): Promise<{ filas: T[]; truncado: boolean }> {
  const filas: T[] = []
  for (let desde = 0; desde < maximo; desde += TAMANO_PAGINA) {
    const hasta = Math.min(desde + TAMANO_PAGINA, maximo) - 1
    const { data, error } = await consulta(desde, hasta)
    if (error) throw error
    filas.push(...(data ?? []))
    if (!data || data.length < hasta - desde + 1) return { filas, truncado: false }
  }
  return { filas, truncado: true }
}
