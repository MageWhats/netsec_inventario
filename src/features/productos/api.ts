import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { PostgrestError } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import type { Tables, TablesInsert, TablesUpdate } from '@/types/database'

export type Categoria = Tables<'categorias'>
export type Unidad = Tables<'unidades'>

export type Producto = Tables<'productos'> & {
  categoria: Pick<Categoria, 'id' | 'nombre'> | null
  /** Suma del stock en todas las bodegas (calculado desde los movimientos) */
  stock: number
}

export const productosKeys = {
  all: ['productos'] as const,
  lista: () => [...productosKeys.all, 'lista'] as const,
  detalle: (id: string) => [...productosKeys.all, 'detalle', id] as const,
  tieneMovimientos: (id: string) => [...productosKeys.all, 'tiene-movimientos', id] as const,
  unidades: (id: string) => [...productosKeys.all, 'unidades', id] as const,
  busquedaSerie: (texto: string) => [...productosKeys.all, 'busqueda-serie', texto] as const,
}

const SELECT_PRODUCTO = '*, categoria:categorias(id, nombre)'

async function obtenerStock(productoId?: string) {
  let query = supabase.from('stock_actual').select('producto_id, cantidad')
  if (productoId) query = query.eq('producto_id', productoId)
  const { data, error } = await query
  if (error) throw error

  const stock = new Map<string, number>()
  for (const fila of data) {
    if (!fila.producto_id) continue
    stock.set(fila.producto_id, (stock.get(fila.producto_id) ?? 0) + (fila.cantidad ?? 0))
  }
  return stock
}

// ---------------------------------------------------------------------
// Consultas
// ---------------------------------------------------------------------

export function useProductos() {
  return useQuery({
    queryKey: productosKeys.lista(),
    queryFn: async (): Promise<Producto[]> => {
      const [{ data, error }, stock] = await Promise.all([
        supabase.from('productos').select(SELECT_PRODUCTO).order('nombre'),
        obtenerStock(),
      ])
      if (error) throw error
      return data.map((p) => ({ ...p, stock: stock.get(p.id) ?? 0 }))
    },
  })
}

export function useProducto(id: string) {
  return useQuery({
    queryKey: productosKeys.detalle(id),
    queryFn: async (): Promise<Producto | null> => {
      const [{ data, error }, stock] = await Promise.all([
        supabase.from('productos').select(SELECT_PRODUCTO).eq('id', id).maybeSingle(),
        obtenerStock(id),
      ])
      if (error) throw error
      return data && { ...data, stock: stock.get(data.id) ?? 0 }
    },
  })
}

/** Si el producto ya tiene movimientos, no se puede cambiar su modo de control (serial / cantidad) */
export function useTieneMovimientos(id: string | undefined) {
  return useQuery({
    queryKey: productosKeys.tieneMovimientos(id ?? ''),
    enabled: Boolean(id),
    queryFn: async () => {
      const { count, error } = await supabase
        .from('movimiento_items')
        .select('id', { count: 'exact', head: true })
        .eq('producto_id', id!)
      if (error) throw error
      return (count ?? 0) > 0
    },
  })
}

export function useCategorias() {
  return useQuery({
    queryKey: ['categorias'],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from('categorias').select('*').order('nombre')
      if (error) throw error
      return data
    },
  })
}

export function useUnidades(productoId: string, enabled = true) {
  return useQuery({
    queryKey: productosKeys.unidades(productoId),
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('unidades')
        .select('*')
        .eq('producto_id', productoId)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data
    },
  })
}

/** IDs de productos que tienen alguna unidad cuyo serial o MAC contiene el texto */
export function useBusquedaSerie(texto: string) {
  const termino = texto.trim()
  return useQuery({
    queryKey: productosKeys.busquedaSerie(termino),
    enabled: termino.length >= 3,
    queryFn: async () => {
      const patron = `%${termino.replace(/[%_,()]/g, '')}%`
      const { data, error } = await supabase
        .from('unidades')
        .select('producto_id')
        .or(`numero_serie.ilike.${patron},mac.ilike.${patron}`)
        .limit(200)
      if (error) throw error
      return new Set(data.map((u) => u.producto_id))
    },
  })
}

// ---------------------------------------------------------------------
// Mutaciones
// ---------------------------------------------------------------------

export function useGuardarProducto() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, valores }: { id?: string; valores: TablesInsert<'productos'> }) => {
      const query = id
        ? supabase.from('productos').update(valores).eq('id', id)
        : supabase.from('productos').insert(valores)
      const { data, error } = await query.select('id').single()
      if (error) throw error
      return data.id
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: productosKeys.all }),
  })
}

export function useCambiarActivo() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, activo }: { id: string; activo: boolean }) => {
      const { error } = await supabase.from('productos').update({ activo }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: productosKeys.all }),
  })
}

/** Solo datos descriptivos: el estado de una unidad cambia a través de los movimientos */
export function useActualizarUnidad() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, valores }: { id: string; valores: Pick<TablesUpdate<'unidades'>, 'mac' | 'notas'> }) => {
      const { data, error } = await supabase.from('unidades').update(valores).eq('id', id).select('producto_id').single()
      if (error) throw error
      return data.producto_id
    },
    onSuccess: (productoId) => queryClient.invalidateQueries({ queryKey: productosKeys.unidades(productoId) }),
  })
}

// ---------------------------------------------------------------------
// Errores
// ---------------------------------------------------------------------

export function mensajeError(error: unknown): string {
  const pgError = error as Partial<PostgrestError> | null
  if (pgError?.code === '23505') {
    if (pgError.message?.includes('codigo_barras')) return 'Ya existe otro producto con ese código de barras.'
    if (pgError.message?.includes('sku')) return 'Ya existe otro producto con ese SKU.'
    return 'Ya existe un registro con esos datos.'
  }
  if (pgError?.code === '42501') return 'No tienes permisos para realizar esta acción.'
  return pgError?.message ?? 'Ocurrió un error inesperado.'
}
