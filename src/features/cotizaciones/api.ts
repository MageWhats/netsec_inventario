import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { fechaIso } from '@/lib/exportar'
import { supabase } from '@/lib/supabase'
import type { Database, Enums, Views } from '@/types/database'

// Cotizaciones (migración 0019). Admin y bodega las crean; todos las ven.

export type EstadoCotizacion = Enums<'estado_cotizacion'>
export type CotizacionResumen = Views<'cotizaciones_resumen'>
/** El estado que se muestra: una abierta con la validez vencida se ve como "vencida" */
export type EstadoVisible = EstadoCotizacion | 'vencida'

export const estadosCotizacion: Record<EstadoVisible, { label: string; clase: string }> = {
  abierta: { label: 'Abierta', clase: 'bg-blue-500/15 text-blue-400' },
  vencida: { label: 'Vencida', clase: 'bg-amber-500/15 text-amber-400' },
  aceptada: { label: 'Aceptada', clase: 'bg-emerald-500/15 text-emerald-400' },
  rechazada: { label: 'Rechazada', clase: 'bg-slate-500/15 text-slate-400' },
}

export const estadoVisible = (c: Pick<CotizacionResumen, 'estado' | 'vencida'>): EstadoVisible =>
  c.vencida ? 'vencida' : c.estado

/** COT-000012 */
export const formatearCotizacion = (c: { numero: number }) => `COT-${String(c.numero).padStart(6, '0')}`

/** Validez por defecto de una cotización nueva */
export const DIAS_VALIDEZ = 15
export const validezPorDefecto = () => {
  const d = new Date()
  d.setDate(d.getDate() + DIAS_VALIDEZ)
  return fechaIso(d)
}

export const cotizacionesKeys = {
  all: ['cotizaciones'] as const,
  lista: (estado: EstadoCotizacion | '', clienteId?: string) =>
    [...cotizacionesKeys.all, 'lista', estado, clienteId ?? ''] as const,
  detalle: (id: string) => [...cotizacionesKeys.all, 'detalle', id] as const,
}

export function useCotizaciones(estado: EstadoCotizacion | '' = '', clienteId?: string) {
  return useQuery({
    queryKey: cotizacionesKeys.lista(estado, clienteId),
    queryFn: async () => {
      let query = supabase.from('cotizaciones_resumen').select('*').order('numero', { ascending: false }).limit(500)
      if (estado) query = query.eq('estado', estado)
      if (clienteId) query = query.eq('cliente_id', clienteId)
      const { data, error } = await query
      if (error) throw error
      return data
    },
  })
}

export function useCotizacion(id: string) {
  return useQuery({
    queryKey: cotizacionesKeys.detalle(id),
    enabled: Boolean(id),
    queryFn: async () => {
      const [cotizacion, items, cliente] = await Promise.all([
        supabase.from('cotizaciones_resumen').select('*').eq('id', id).maybeSingle(),
        supabase
          .from('cotizacion_items')
          .select(
            'id, producto_id, cantidad, precio_unitario, producto:productos(id, sku, nombre, marca, modelo, es_serializado, activo)',
          )
          .eq('cotizacion_id', id),
        // Datos de contacto del cliente registrado (para el PDF)
        supabase
          .from('cotizaciones')
          .select('cliente:clientes(id, nombre, tipo_documento, documento, telefono, email, direccion, ciudad)')
          .eq('id', id)
          .maybeSingle(),
      ])
      if (cotizacion.error) throw cotizacion.error
      if (items.error) throw items.error
      if (cliente.error) throw cliente.error
      if (!cotizacion.data) return null

      let usuario: string | null = null
      if (cotizacion.data.usuario_id) {
        const { data: perfil } = await supabase
          .from('perfiles')
          .select('nombre')
          .eq('id', cotizacion.data.usuario_id)
          .maybeSingle()
        usuario = perfil?.nombre ?? null
      }

      return {
        ...cotizacion.data,
        cliente: cliente.data?.cliente ?? null,
        usuario,
        items: [...items.data].sort((a, b) => a.producto.nombre.localeCompare(b.producto.nombre)),
      }
    },
  })
}

export type CotizacionDetalle = NonNullable<ReturnType<typeof useCotizacion>['data']>

function useInvalidarCotizaciones() {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: cotizacionesKeys.all })
}

export type ArgsGuardarCotizacion = Database['public']['Functions']['guardar_cotizacion']['Args']

export function useGuardarCotizacion() {
  const invalidar = useInvalidarCotizaciones()
  return useMutation({
    mutationFn: async (args: ArgsGuardarCotizacion) => {
      const { data, error } = await supabase.rpc('guardar_cotizacion', args)
      if (error) throw error
      return data
    },
    onSuccess: invalidar,
  })
}

export function useRechazarCotizacion() {
  const invalidar = useInvalidarCotizaciones()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc('rechazar_cotizacion', { p_id: id })
      if (error) throw error
    },
    onSuccess: invalidar,
  })
}
