import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Tables, TablesInsert } from '@/types/database'

export type Proveedor = Tables<'proveedores'>

export const proveedoresKeys = {
  all: ['proveedores'] as const,
  lista: () => [...proveedoresKeys.all, 'lista'] as const,
  detalle: (id: string) => [...proveedoresKeys.all, 'detalle', id] as const,
}

export function useProveedores() {
  return useQuery({
    queryKey: proveedoresKeys.lista(),
    queryFn: async () => {
      const { data, error } = await supabase.from('proveedores').select('*').order('nombre')
      if (error) throw error
      return data
    },
  })
}

export function useProveedor(id: string) {
  return useQuery({
    queryKey: proveedoresKeys.detalle(id),
    queryFn: async () => {
      const { data, error } = await supabase.from('proveedores').select('*').eq('id', id).maybeSingle()
      if (error) throw error
      return data
    },
  })
}

export function useGuardarProveedor() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, valores }: { id?: string; valores: TablesInsert<'proveedores'> }) => {
      const query = id
        ? supabase.from('proveedores').update(valores).eq('id', id)
        : supabase.from('proveedores').insert(valores)
      const { data, error } = await query.select('id').single()
      if (error) throw error
      return data.id
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: proveedoresKeys.all }),
  })
}

export function useCambiarActivoProveedor() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, activo }: { id: string; activo: boolean }) => {
      const { error } = await supabase.from('proveedores').update({ activo }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: proveedoresKeys.all }),
  })
}
