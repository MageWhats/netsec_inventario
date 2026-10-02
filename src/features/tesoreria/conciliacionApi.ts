import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Database, Json } from '@/types/database'
import type { LineaExtracto } from './extracto'

// Conciliación bancaria y flujo de caja (migración 0027)

type Fn = Database['public']['Functions']
export type EstadoConciliacion = Fn['estado_conciliacion']['Returns'][number]
export type AsientoSinConciliar = Fn['asientos_sin_conciliar']['Returns'][number]
export type FilaFlujo = Fn['flujo_efectivo']['Returns'][number]
export type SemanaProyectada = Fn['flujo_proyectado']['Returns'][number]

const claves = {
  extracto: (cuenta: string, anio: number, mes: number) => ['tesoreria', 'extracto', cuenta, anio, mes] as const,
  detalle: (id: string) => ['tesoreria', 'extracto-detalle', id] as const,
}

function useInvalidar() {
  const queryClient = useQueryClient()
  return () =>
    Promise.all(['tesoreria', 'contabilidad'].map((clave) => queryClient.invalidateQueries({ queryKey: [clave] })))
}

/** Extracto de un banco y mes, con sus líneas (null si aún no se importa) */
export function useExtracto(cuentaId: string, anio: number, mes: number) {
  return useQuery({
    queryKey: claves.extracto(cuentaId, anio, mes),
    enabled: Boolean(cuentaId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('extractos')
        .select('*, lineas:extracto_lineas(*)')
        .eq('cuenta_tesoreria_id', cuentaId)
        .eq('anio', anio)
        .eq('mes', mes)
        .order('orden', { referencedTable: 'extracto_lineas' })
        .maybeSingle()
      if (error) throw error
      return data
    },
  })
}

/** Estado de la conciliación y los asientos del banco que siguen sin conciliar */
export function useDetalleConciliacion(extractoId: string | undefined) {
  return useQuery({
    queryKey: claves.detalle(extractoId ?? ''),
    enabled: Boolean(extractoId),
    queryFn: async () => {
      const [estado, asientos] = await Promise.all([
        supabase.rpc('estado_conciliacion', { p_extracto_id: extractoId! }),
        supabase.rpc('asientos_sin_conciliar', { p_extracto_id: extractoId! }),
      ])
      if (estado.error) throw estado.error
      if (asientos.error) throw asientos.error
      return { estado: estado.data[0] ?? null, asientos: asientos.data }
    },
  })
}

export function useImportarExtracto() {
  const invalidar = useInvalidar()
  return useMutation({
    mutationFn: async (args: {
      cuentaId: string
      anio: number
      mes: number
      saldoInicial: number
      saldoFinal: number
      lineas: LineaExtracto[]
    }) => {
      const { data, error } = await supabase.rpc('importar_extracto', {
        p_cuenta_tesoreria_id: args.cuentaId,
        p_anio: args.anio,
        p_mes: args.mes,
        p_saldo_inicial: args.saldoInicial,
        p_saldo_final: args.saldoFinal,
        p_lineas: args.lineas as unknown as Json,
      })
      if (error) throw error
      return data
    },
    onSuccess: invalidar,
  })
}

export function useConciliarAutomatico() {
  const invalidar = useInvalidar()
  return useMutation({
    mutationFn: async (extractoId: string) => {
      const { data, error } = await supabase.rpc('conciliar_automatico', { p_extracto_id: extractoId })
      if (error) throw error
      return data
    },
    onSuccess: invalidar,
  })
}

export function useConciliarLinea() {
  const invalidar = useInvalidar()
  return useMutation({
    mutationFn: async (args: { p_linea_id: string; p_asiento_id: string | null }) => {
      const { error } = await supabase.rpc('conciliar_linea', args)
      if (error) throw error
    },
    onSuccess: invalidar,
  })
}

export function useCerrarConciliacion() {
  const invalidar = useInvalidar()
  return useMutation({
    mutationFn: async (args: { p_extracto_id: string; p_cerrar: boolean }) => {
      const { error } = await supabase.rpc('cerrar_conciliacion', args)
      if (error) throw error
    },
    onSuccess: invalidar,
  })
}

export function useFlujoEfectivo(desde: string, hasta: string) {
  return useQuery({
    queryKey: ['tesoreria', 'flujo', desde, hasta],
    placeholderData: (previo) => previo,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('flujo_efectivo', { p_desde: desde, p_hasta: hasta })
      if (error) throw error
      return data
    },
  })
}

export function useFlujoProyectado(semanas: number) {
  return useQuery({
    queryKey: ['tesoreria', 'proyectado', semanas],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('flujo_proyectado', { p_semanas: semanas })
      if (error) throw error
      return data
    },
  })
}
