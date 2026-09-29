import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { fechaIso } from '@/lib/exportar'
import { supabase } from '@/lib/supabase'
import type { Database, Enums, Views } from '@/types/database'

// Órdenes de compra (migración 0017). Solo admin las gestiona; admin y lectura las ven.

export type EstadoOrden = Enums<'estado_orden_compra'>
export type OrdenResumen = Views<'ordenes_compra_resumen'>

export const estadosOrden: Record<EstadoOrden, { label: string; clase: string }> = {
  abierta: { label: 'Abierta', clase: 'bg-blue-500/15 text-blue-400' },
  recibida: { label: 'Recibida', clase: 'bg-emerald-500/15 text-emerald-400' },
  cancelada: { label: 'Cancelada', clase: 'bg-slate-500/15 text-slate-400' },
}

/** OC-000012 */
export const formatearOrden = (o: { numero: number }) => `OC-${String(o.numero).padStart(6, '0')}`

export const ordenesKeys = {
  all: ['ordenes-compra'] as const,
  lista: (estado: EstadoOrden | '') => [...ordenesKeys.all, 'lista', estado] as const,
  detalle: (id: string) => [...ordenesKeys.all, 'detalle', id] as const,
}

export function useOrdenes(estado: EstadoOrden | '' = '', enabled = true) {
  return useQuery({
    queryKey: ordenesKeys.lista(estado),
    enabled,
    queryFn: async () => {
      let query = supabase.from('ordenes_compra_resumen').select('*').order('numero', { ascending: false }).limit(500)
      if (estado) query = query.eq('estado', estado)
      const { data, error } = await query
      if (error) throw error
      return data
    },
  })
}

export function useOrden(id: string) {
  return useQuery({
    queryKey: ordenesKeys.detalle(id),
    enabled: Boolean(id),
    queryFn: async () => {
      const [orden, items, entregas] = await Promise.all([
        supabase.from('ordenes_compra_resumen').select('*').eq('id', id).maybeSingle(),
        supabase
          .from('orden_compra_items_estado')
          .select(
            'id, producto_id, cantidad, costo_unitario, recibido, producto:productos(id, sku, nombre, es_serializado, activo)',
          )
          .eq('orden_id', id),
        // Entregas: las entradas enlazadas a la orden
        supabase
          .from('movimientos')
          .select('id, numero, tipo, fecha, referencia, anulado_at')
          .eq('orden_compra_id', id)
          .order('fecha'),
      ])
      if (orden.error) throw orden.error
      if (items.error) throw items.error
      if (entregas.error) throw entregas.error
      if (!orden.data) return null

      return {
        ...orden.data,
        items: [...items.data].sort((a, b) => a.producto.nombre.localeCompare(b.producto.nombre)),
        entregas: entregas.data,
      }
    },
  })
}

export type OrdenDetalle = NonNullable<ReturnType<typeof useOrden>['data']>

function useInvalidarOrdenes() {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: ordenesKeys.all })
}

export type ArgsGuardarOrden = Database['public']['Functions']['guardar_orden_compra']['Args']

export function useGuardarOrden() {
  const invalidar = useInvalidarOrdenes()
  return useMutation({
    mutationFn: async (args: ArgsGuardarOrden) => {
      const { data, error } = await supabase.rpc('guardar_orden_compra', args)
      if (error) throw error
      return data
    },
    onSuccess: invalidar,
  })
}

export function useCancelarOrden() {
  const invalidar = useInvalidarOrdenes()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc('cancelar_orden_compra', { p_id: id })
      if (error) throw error
    },
    onSuccess: invalidar,
  })
}

export type ArgsRecibirOrden = Database['public']['Functions']['recibir_orden_compra']['Args']

/** Registra la entrada de lo recibido y la enlaza a la orden */
export function useRecibirOrden() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (args: ArgsRecibirOrden) => {
      const { data, error } = await supabase.rpc('recibir_orden_compra', args)
      if (error) throw error
      return data
    },
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ordenesKeys.all }),
        queryClient.invalidateQueries({ queryKey: ['movimientos'] }),
        queryClient.invalidateQueries({ queryKey: ['productos'] }),
        queryClient.invalidateQueries({ queryKey: ['proveedores'] }),
      ]),
  })
}

/** Abierta y con la fecha de llegada esperada ya pasada */
export const estaAtrasada = (o: Pick<OrdenResumen, 'estado' | 'fecha_esperada'>) =>
  o.estado === 'abierta' && Boolean(o.fecha_esperada) && o.fecha_esperada! < fechaIso(new Date())
