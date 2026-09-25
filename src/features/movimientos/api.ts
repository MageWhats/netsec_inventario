import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { traerTodo } from '@/lib/paginar'
import type { Database, Enums, Views } from '@/types/database'
import { serieMovimiento, TIPOS_MOVIMIENTO, type TipoMovimiento } from './tipos'

export type MovimientoResumen = Views<'movimientos_resumen'>

export interface FiltrosMovimientos {
  tipo?: TipoMovimiento | ''
  /** Fechas en formato YYYY-MM-DD (hora local) */
  desde?: string
  hasta?: string
  busqueda?: string
  clienteId?: string
  proveedorId?: string
  limite?: number
}

export const movimientosKeys = {
  all: ['movimientos'] as const,
  lista: (filtros: FiltrosMovimientos) => [...movimientosKeys.all, 'lista', filtros] as const,
  detalle: (id: string) => [...movimientosKeys.all, 'detalle', id] as const,
}

export function useMovimientos(filtros: FiltrosMovimientos) {
  return useQuery({
    queryKey: movimientosKeys.lista(filtros),
    placeholderData: (anterior) => anterior,
    queryFn: async () => {
      let query = supabase
        .from('movimientos_resumen')
        .select('*', { count: 'exact' })
        .order('fecha', { ascending: false })
        .order('numero', { ascending: false })
        .limit(filtros.limite ?? 50)

      if (filtros.tipo) query = query.eq('tipo', filtros.tipo)
      if (filtros.clienteId) query = query.eq('cliente_id', filtros.clienteId)
      if (filtros.proveedorId) query = query.eq('proveedor_id', filtros.proveedorId)
      if (filtros.desde) query = query.gte('fecha', new Date(`${filtros.desde}T00:00:00`).toISOString())
      if (filtros.hasta) query = query.lte('fecha', new Date(`${filtros.hasta}T23:59:59.999`).toISOString())

      const texto = filtros.busqueda?.trim().replace(/[%_,()]/g, '')
      if (texto) {
        const condiciones = [
          `referencia.ilike.%${texto}%`,
          `cliente_nombre.ilike.%${texto}%`,
          `proveedor_nombre.ilike.%${texto}%`,
          `notas.ilike.%${texto}%`,
        ]
        // Número de movimiento: "12" (cualquier serie) o con la letra, "E12" / "s-12", para una sola serie
        const consecutivo = /^#?([esa])?-?(\d+)$/i.exec(texto)
        const numero = Number(consecutivo?.[2])
        if (consecutivo && numero > 0) {
          const serie = consecutivo[1]?.toUpperCase()
          const tipos = serie ? TIPOS_MOVIMIENTO.filter((t) => serieMovimiento(t) === serie) : []
          condiciones.push(tipos.length ? `and(numero.eq.${numero},tipo.in.(${tipos.join(',')}))` : `numero.eq.${numero}`)
        }
        query = query.or(condiciones.join(','))
      }

      const { data, error, count } = await query
      if (error) throw error
      return { movimientos: data, total: count ?? data.length }
    },
  })
}

const SELECT_DETALLE = `
  *,
  bodega:bodegas(id, nombre),
  proveedor:proveedores(id, nombre, nit),
  cliente:clientes(id, nombre, tipo_documento, documento),
  items:movimiento_items(
    id, cantidad, costo_unitario, precio_unitario,
    producto:productos(id, sku, nombre, es_serializado),
    unidad:unidades(id, numero_serie, mac, estado)
  )
`

export function useMovimiento(id: string) {
  return useQuery({
    queryKey: movimientosKeys.detalle(id),
    queryFn: async () => {
      const { data, error } = await supabase.from('movimientos').select(SELECT_DETALLE).eq('id', id).maybeSingle()
      if (error) throw error
      if (!data) return null

      // usuario_id apunta a auth.users; el nombre visible está en perfiles
      let usuario: string | null = null
      if (data.usuario_id) {
        const { data: perfil } = await supabase.from('perfiles').select('nombre').eq('id', data.usuario_id).maybeSingle()
        usuario = perfil?.nombre ?? null
      }
      return { ...data, usuario }
    },
  })
}

export type MovimientoDetalle = NonNullable<ReturnType<typeof useMovimiento>['data']>

export function useBodegas() {
  return useQuery({
    queryKey: ['bodegas'],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from('bodegas').select('*').eq('activa', true).order('created_at')
      if (error) throw error
      return data
    },
  })
}

/** Unidades de un producto en ciertos estados (para elegir qué seriales salen o reingresan) */
export function useUnidadesPorEstado(productoId: string, estados: Enums<'estado_unidad'>[]) {
  return useQuery({
    queryKey: ['productos', 'unidades', productoId, 'estados', estados],
    queryFn: async () => {
      const { filas } = await traerTodo((desde, hasta) =>
        supabase
          .from('unidades')
          .select('id, numero_serie, mac, estado, bodega_id')
          .eq('producto_id', productoId)
          .in('estado', estados)
          .order('numero_serie')
          .order('id')
          .range(desde, hasta),
      )
      return filas
    },
  })
}

export type ArgsRegistrarMovimiento = Database['public']['Functions']['registrar_movimiento']['Args']

export function useRegistrarMovimiento() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (args: ArgsRegistrarMovimiento) => {
      const { data, error } = await supabase.rpc('registrar_movimiento', args)
      if (error) throw error
      return data
    },
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: movimientosKeys.all }),
        // El stock, las unidades y los historiales de clientes/proveedores cambian
        queryClient.invalidateQueries({ queryKey: ['productos'] }),
        queryClient.invalidateQueries({ queryKey: ['clientes'] }),
        queryClient.invalidateQueries({ queryKey: ['proveedores'] }),
      ]),
  })
}
