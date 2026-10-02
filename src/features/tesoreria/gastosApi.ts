import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { traerTodo } from '@/lib/paginar'
import type { Database, Tables, TablesInsert, TablesUpdate } from '@/types/database'

// Gastos por categoría y recurrentes (migración 0026). Admin y la contadora registran; lectura consulta.

type Fn = Database['public']['Functions']
export type CategoriaGasto = Tables<'categorias_gasto'>
export type Recurrente = Tables<'gastos_recurrentes'>
export type RecurrentePendiente = Fn['recurrentes_pendientes']['Returns'][number]

export const gastosKeys = {
  all: ['gastos'] as const,
  categorias: () => [...gastosKeys.all, 'categorias'] as const,
  lista: (desde: string, hasta: string) => [...gastosKeys.all, 'lista', desde, hasta] as const,
  recurrentes: () => [...gastosKeys.all, 'recurrentes'] as const,
  pendientes: (anio: number, mes: number) => [...gastosKeys.all, 'pendientes', anio, mes] as const,
}

/** GA-000001 */
export const etiquetaGasto = (numero: number) => `GA-${String(numero).padStart(6, '0')}`

function useInvalidar() {
  const queryClient = useQueryClient()
  return () =>
    Promise.all(
      ['gastos', 'tesoreria', 'contabilidad'].map((clave) => queryClient.invalidateQueries({ queryKey: [clave] })),
    )
}

export function useCategoriasGasto() {
  return useQuery({
    queryKey: gastosKeys.categorias(),
    queryFn: async () => {
      const { data, error } = await supabase.from('categorias_gasto').select('*').order('nombre')
      if (error) throw error
      return data
    },
  })
}

export function useGuardarCategoria() {
  const invalidar = useInvalidar()
  return useMutation({
    mutationFn: async ({ id, ...datos }: TablesInsert<'categorias_gasto'>) => {
      const { error } = id
        ? await supabase.from('categorias_gasto').update(datos).eq('id', id)
        : await supabase.from('categorias_gasto').insert(datos)
      if (error) throw error
    },
    onSuccess: invalidar,
  })
}

export function useGastos(desde: string, hasta: string) {
  return useQuery({
    queryKey: gastosKeys.lista(desde, hasta),
    placeholderData: (previo) => previo,
    queryFn: async () => {
      const { filas } = await traerTodo((d, h) =>
        supabase
          .from('gastos')
          .select(
            '*, categoria:categorias_gasto(nombre), proveedor:proveedores(nombre), tercero:terceros(nombre), caja:cuentas_tesoreria(nombre), egreso:egresos(numero, anulado_at)',
          )
          .gte('fecha', desde)
          .lte('fecha', hasta)
          .order('numero', { ascending: false })
          .range(d, h),
      )
      return filas
    },
  })
}

export type Gasto = NonNullable<ReturnType<typeof useGastos>['data']>[number]

/** ¿Falta pagarlo? Quedó por pagar y no tiene un egreso vigente */
export const gastoPorPagar = (g: Gasto) => !g.anulado_at && !g.cuenta_tesoreria_id && (!g.egreso || Boolean(g.egreso.anulado_at))

export function useRegistrarGasto() {
  const invalidar = useInvalidar()
  return useMutation({
    mutationFn: async (args: Fn['registrar_gasto']['Args']) => {
      const { data, error } = await supabase.rpc('registrar_gasto', args)
      if (error) throw error
      return data
    },
    onSuccess: invalidar,
  })
}

export function usePagarGasto() {
  const invalidar = useInvalidar()
  return useMutation({
    mutationFn: async (args: Fn['pagar_gasto']['Args']) => {
      const { data, error } = await supabase.rpc('pagar_gasto', args)
      if (error) throw error
      return data
    },
    onSuccess: invalidar,
  })
}

export function useAnularGasto() {
  const invalidar = useInvalidar()
  return useMutation({
    mutationFn: async (args: { p_id: string; p_motivo: string }) => {
      const { error } = await supabase.rpc('anular_gasto', args)
      if (error) throw error
    },
    onSuccess: invalidar,
  })
}

export function useRecurrentes() {
  return useQuery({
    queryKey: gastosKeys.recurrentes(),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('gastos_recurrentes')
        .select('*, categoria:categorias_gasto(nombre), proveedor:proveedores(nombre), tercero:terceros(nombre), caja:cuentas_tesoreria(nombre)')
        .order('dia')
        .order('nombre')
      if (error) throw error
      return data
    },
  })
}

export type RecurrenteDetalle = NonNullable<ReturnType<typeof useRecurrentes>['data']>[number]

export function useGuardarRecurrente() {
  const invalidar = useInvalidar()
  return useMutation({
    mutationFn: async ({ id, ...datos }: TablesInsert<'gastos_recurrentes'> & TablesUpdate<'gastos_recurrentes'>) => {
      const { error } = id
        ? await supabase.from('gastos_recurrentes').update(datos).eq('id', id)
        : await supabase.from('gastos_recurrentes').insert(datos)
      if (error) throw error
    },
    onSuccess: invalidar,
  })
}

export function useRecurrentesPendientes(anio: number, mes: number) {
  return useQuery({
    queryKey: gastosKeys.pendientes(anio, mes),
    queryFn: async () => {
      const { data, error } = await supabase.rpc('recurrentes_pendientes', { p_anio: anio, p_mes: mes })
      if (error) throw error
      return data
    },
  })
}

export function useConfirmarRecurrente() {
  const invalidar = useInvalidar()
  return useMutation({
    mutationFn: async (args: Fn['confirmar_recurrente']['Args']) => {
      const { data, error } = await supabase.rpc('confirmar_recurrente', args)
      if (error) throw error
      return data
    },
    onSuccess: invalidar,
  })
}
