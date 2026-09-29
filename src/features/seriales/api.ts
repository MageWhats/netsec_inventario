import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Enums } from '@/types/database'

const SELECT_UNIDAD = `
  id, numero_serie, mac, estado, notas, created_at,
  bodega:bodegas(nombre),
  producto:productos(id, sku, nombre, imagen_url, categoria:categorias(nombre, garantia_meses))
`

/** Unidades cuyo serial o MAC contiene el texto (las coincidencias exactas primero) */
export function useBuscarUnidades(texto: string) {
  const termino = texto.trim()
  return useQuery({
    queryKey: ['seriales', 'busqueda', termino],
    enabled: termino.length >= 3,
    placeholderData: (anterior) => anterior,
    queryFn: async () => {
      const limpio = termino.replace(/[%_,()]/g, '')
      const { data, error } = await supabase
        .from('unidades')
        .select(SELECT_UNIDAD)
        .or(`numero_serie.ilike.%${limpio}%,mac.ilike.%${limpio}%`)
        .order('numero_serie')
        .limit(50)
      if (error) throw error
      const exacto = (u: (typeof data)[number]) =>
        u.numero_serie.toLowerCase() === limpio.toLowerCase() || u.mac?.toLowerCase() === limpio.toLowerCase()
      return [...data].sort((a, b) => Number(exacto(b)) - Number(exacto(a)))
    },
  })
}

export type UnidadEncontrada = NonNullable<ReturnType<typeof useBuscarUnidades>['data']>[number]

export function useUnidad(id: string | null) {
  return useQuery({
    queryKey: ['seriales', 'unidad', id],
    enabled: Boolean(id),
    queryFn: async () => {
      const { data, error } = await supabase.from('unidades').select(SELECT_UNIDAD).eq('id', id!).maybeSingle()
      if (error) throw error
      return data
    },
  })
}

/** Unidades en un estado (p. ej. las que están en garantía), de la más reciente a la más antigua */
export function useUnidadesEnEstado(estado: Enums<'estado_unidad'> | null) {
  return useQuery({
    queryKey: ['seriales', 'estado', estado],
    enabled: Boolean(estado),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('unidades')
        .select(SELECT_UNIDAD)
        .eq('estado', estado!)
        .order('updated_at', { ascending: false })
        .limit(200)
      if (error) throw error
      return data
    },
  })
}
