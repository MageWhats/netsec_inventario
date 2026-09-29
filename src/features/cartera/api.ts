import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { traerTodo } from '@/lib/paginar'
import type { Database, Enums, Views } from '@/types/database'

// Cartera (migración 0019): ventas a crédito, abonos y saldos. Admin y lectura la ven; solo admin abona.

export type VentaCredito = Views<'cartera'>
export type MetodoPago = Enums<'metodo_pago'>

export const metodosPago: Record<MetodoPago, string> = {
  efectivo: 'Efectivo',
  transferencia: 'Transferencia',
  tarjeta: 'Tarjeta',
  cheque: 'Cheque',
  otro: 'Otro',
}

/** Plazos que se ofrecen al vender a crédito */
export const PLAZOS = [8, 15, 30, 45, 60, 90]

/** Estado de cobro de una venta a crédito */
export type EstadoCobro = 'pagada' | 'vencida' | 'por_vencer' | 'al_dia'

/** Días antes del vencimiento en que una venta se marca "por vencer" */
export const DIAS_AVISO = 7

export function estadoCobro(v: Pick<VentaCredito, 'saldo' | 'vence'>, hoy = new Date()): EstadoCobro {
  if (v.saldo <= 0) return 'pagada'
  const vence = new Date(`${v.vence}T23:59:59`)
  const dias = Math.ceil((vence.getTime() - hoy.getTime()) / 86_400_000)
  if (dias < 0) return 'vencida'
  return dias <= DIAS_AVISO ? 'por_vencer' : 'al_dia'
}

export const estadosCobro: Record<EstadoCobro, { label: string; clase: string }> = {
  vencida: { label: 'Vencida', clase: 'bg-red-500/15 text-red-400' },
  por_vencer: { label: 'Por vencer', clase: 'bg-amber-500/15 text-amber-400' },
  al_dia: { label: 'Al día', clase: 'bg-blue-500/15 text-blue-400' },
  pagada: { label: 'Pagada', clase: 'bg-emerald-500/15 text-emerald-400' },
}

export const carteraKeys = {
  all: ['cartera'] as const,
  lista: (clienteId?: string) => [...carteraKeys.all, 'lista', clienteId ?? ''] as const,
  pagos: (movimientoId: string) => [...carteraKeys.all, 'pagos', movimientoId] as const,
}

/** Todas las ventas a crédito (con saldo o ya pagadas), de la más antigua a la más reciente */
export function useCartera(clienteId?: string, enabled = true) {
  return useQuery({
    queryKey: carteraKeys.lista(clienteId),
    enabled,
    queryFn: async () => {
      const { filas } = await traerTodo((desde, hasta) => {
        let query = supabase.from('cartera').select('*').order('vence').order('numero')
        if (clienteId) query = query.eq('cliente_id', clienteId)
        return query.range(desde, hasta)
      })
      return filas
    },
  })
}

/** Una venta en la cartera (null si es de contado) y sus abonos, incluidos los anulados */
export function usePagosVenta(movimientoId: string, enabled = true) {
  return useQuery({
    queryKey: carteraKeys.pagos(movimientoId),
    enabled: enabled && Boolean(movimientoId),
    queryFn: async () => {
      const [venta, pagos] = await Promise.all([
        supabase.from('cartera').select('*').eq('id', movimientoId).maybeSingle(),
        supabase.from('pagos').select('*').eq('movimiento_id', movimientoId).order('fecha').order('created_at'),
      ])
      if (venta.error) throw venta.error
      if (pagos.error) throw pagos.error
      return { venta: venta.data, pagos: pagos.data }
    },
  })
}

export type Pago = NonNullable<ReturnType<typeof usePagosVenta>['data']>['pagos'][number]

function useInvalidarCartera() {
  const queryClient = useQueryClient()
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: carteraKeys.all }),
      queryClient.invalidateQueries({ queryKey: ['movimientos'] }),
    ])
}

export type ArgsRegistrarPago = Database['public']['Functions']['registrar_pago']['Args']

export function useRegistrarPago() {
  const invalidar = useInvalidarCartera()
  return useMutation({
    mutationFn: async (args: ArgsRegistrarPago) => {
      const { data, error } = await supabase.rpc('registrar_pago', args)
      if (error) throw error
      return data
    },
    onSuccess: invalidar,
  })
}

export function useAnularPago() {
  const invalidar = useInvalidarCartera()
  return useMutation({
    mutationFn: async (args: { p_id: string; p_motivo: string }) => {
      const { error } = await supabase.rpc('anular_pago', args)
      if (error) throw error
    },
    onSuccess: invalidar,
  })
}

export function useCambiarFormaPago() {
  const invalidar = useInvalidarCartera()
  return useMutation({
    mutationFn: async (args: Database['public']['Functions']['cambiar_forma_pago']['Args']) => {
      const { error } = await supabase.rpc('cambiar_forma_pago', args)
      if (error) throw error
    },
    onSuccess: invalidar,
  })
}

/** Lo abonado (sin anulados) desde una fecha: el recaudo del período */
export function useRecaudo(desde: string, enabled = true) {
  return useQuery({
    queryKey: [...carteraKeys.all, 'recaudo', desde],
    enabled,
    queryFn: async () => {
      const { filas } = await traerTodo((inicio, fin) =>
        supabase
          .from('pagos')
          .select('id, valor')
          .is('anulado_at', null)
          .gte('fecha', new Date(`${desde}T00:00:00`).toISOString())
          .order('id')
          .range(inicio, fin),
      )
      return { total: filas.reduce((s, p) => s + p.valor, 0), abonos: filas.length }
    },
  })
}
