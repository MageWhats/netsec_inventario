import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { traerTodo } from '@/lib/paginar'
import type { Tables, TablesInsert } from '@/types/database'

export type Cliente = Tables<'clientes'>

export const clientesKeys = {
  all: ['clientes'] as const,
  lista: () => [...clientesKeys.all, 'lista'] as const,
  detalle: (id: string) => [...clientesKeys.all, 'detalle', id] as const,
  seriales: (id: string) => [...clientesKeys.all, 'seriales', id] as const,
}

export function useClientes() {
  return useQuery({
    queryKey: clientesKeys.lista(),
    queryFn: async () => {
      const { filas } = await traerTodo((desde, hasta) =>
        supabase.from('clientes').select('*').order('nombre').order('id').range(desde, hasta),
      )
      return filas
    },
  })
}

export function useCliente(id: string) {
  return useQuery({
    queryKey: clientesKeys.detalle(id),
    queryFn: async () => {
      const { data, error } = await supabase.from('clientes').select('*').eq('id', id).maybeSingle()
      if (error) throw error
      return data
    },
  })
}

/** Unidades con serial que salieron hacia este cliente (útil para garantías) */
export function useSerialesCliente(id: string) {
  return useQuery({
    queryKey: clientesKeys.seriales(id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('movimientos')
        .select(
          'id, numero, tipo, fecha, items:movimiento_items!inner(id, producto:productos(id, sku, nombre), unidad:unidades!inner(id, numero_serie, mac, estado))',
        )
        .eq('cliente_id', id)
        .order('fecha', { ascending: false })
      if (error) throw error
      return data.flatMap(({ items, ...movimiento }) =>
        items.map((item) => ({ id: item.id, producto: item.producto, unidad: item.unidad, movimiento })),
      )
    },
  })
}

export function useGuardarCliente() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, valores }: { id?: string; valores: TablesInsert<'clientes'> }) => {
      const query = id
        ? supabase.from('clientes').update(valores).eq('id', id)
        : supabase.from('clientes').insert(valores)
      const { data, error } = await query.select('id').single()
      if (error) throw error
      return data.id
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: clientesKeys.all }),
  })
}

export function useCambiarActivoCliente() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, activo }: { id: string; activo: boolean }) => {
      const { error } = await supabase.from('clientes').update({ activo }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: clientesKeys.all }),
  })
}
