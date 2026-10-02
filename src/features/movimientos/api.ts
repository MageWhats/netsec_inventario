import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { traerTodo } from '@/lib/paginar'
import { traerCostosLineas } from '@/lib/costos'
import type { Database, Enums, Views } from '@/types/database'
import { parsearNumeroMovimiento, type TipoMovimiento } from './tipos'

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
        // Número de movimiento: "12" (cualquier serie) o con prefijo, "NetE-000012" / "e12", para una sola serie
        const consecutivo = parsearNumeroMovimiento(texto)
        if (consecutivo) {
          const { numero, tipos } = consecutivo
          condiciones.push(
            tipos.length ? `and(numero.eq.${numero},tipo.in.(${tipos.join(',')}))` : `numero.eq.${numero}`,
          )
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
    id, cantidad, precio_unitario,
    producto:productos(id, sku, nombre, es_serializado, categoria:categorias(garantia_meses)),
    unidad:unidades(id, numero_serie, mac, estado)
  )
`

export function useMovimiento(id: string, enabled = true) {
  return useQuery({
    queryKey: movimientosKeys.detalle(id),
    enabled: enabled && Boolean(id),
    queryFn: async () => {
      const [{ data, error }, costos] = await Promise.all([
        supabase.from('movimientos').select(SELECT_DETALLE).eq('id', id).maybeSingle(),
        traerCostosLineas({ movimientoId: id }),
      ])
      if (error) throw error
      if (!data) return null
      // El costo de cada línea solo llega a quien ve costos (migración 0015); para el resto queda en null
      const items = data.items.map((i) => ({ ...i, costo_unitario: costos.get(i.id) ?? null }))

      // usuario_id y anulado_por apuntan a auth.users; el nombre visible está en perfiles
      const ids = [data.usuario_id, data.anulado_por].filter((x): x is string => Boolean(x))
      const nombres = new Map<string, string>()
      if (ids.length) {
        const { data: perfiles } = await supabase.from('perfiles').select('id, nombre').in('id', ids)
        for (const p of perfiles ?? []) if (p.nombre) nombres.set(p.id, p.nombre)
      }
      const usuario = (data.usuario_id && nombres.get(data.usuario_id)) || null
      const anuladoPor = (data.anulado_por && nombres.get(data.anulado_por)) || null
      return { ...data, items, usuario, anuladoPor }
    },
  })
}

export type MovimientoDetalle = NonNullable<ReturnType<typeof useMovimiento>['data']>

/** Ventas (salidas) para elegir el origen de una devolución, de la más reciente a la más antigua */
export function useSalidasParaDevolucion(enabled: boolean) {
  return useQuery({
    queryKey: [...movimientosKeys.all, 'salidas-devolucion'],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('movimientos_resumen')
        .select('id, numero, tipo, fecha, cliente_nombre, referencia, unidades')
        .eq('tipo', 'salida')
        .is('anulado_at', null)
        .order('created_at', { ascending: false })
        .limit(1000)
      if (error) throw error
      return data
    },
  })
}

export type SalidaDevolucion = NonNullable<ReturnType<typeof useSalidasParaDevolucion>['data']>[number]

/** Movimientos enlazados: la venta de origen de una devolución y las devoluciones de una venta */
export function useMovimientosEnlazados(movimiento: { id: string; movimiento_origen_id: string | null } | null | undefined) {
  return useQuery({
    queryKey: [...movimientosKeys.all, 'enlazados', movimiento?.id],
    enabled: Boolean(movimiento),
    queryFn: async () => {
      const campos = 'id, numero, tipo, fecha, referencia'
      const [origen, devoluciones, anulacion] = await Promise.all([
        movimiento!.movimiento_origen_id
          ? supabase.from('movimientos').select(campos).eq('id', movimiento!.movimiento_origen_id).maybeSingle()
          : Promise.resolve({ data: null, error: null }),
        supabase.from('movimientos').select(campos).eq('movimiento_origen_id', movimiento!.id).order('created_at'),
        // El ajuste que anula este movimiento, si fue anulado
        supabase.from('movimientos').select(campos).eq('anula_id', movimiento!.id).maybeSingle(),
      ])
      if (origen.error) throw origen.error
      if (devoluciones.error) throw devoluciones.error
      if (anulacion.error) throw anulacion.error
      return { origen: origen.data, devoluciones: devoluciones.data, anulacion: anulacion.data }
    },
  })
}

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
        // Cada movimiento genera su comprobante contable (migración 0023)
        queryClient.invalidateQueries({ queryKey: ['contabilidad'] }),
      ]),
  })
}

export type ArgsRegistrarVenta = Database['public']['Functions']['registrar_venta']['Args']

/** Salidas: registrar_movimiento() más la forma de pago y la cotización de origen (migración 0019) */
export function useRegistrarVenta() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (args: ArgsRegistrarVenta) => {
      const { data, error } = await supabase.rpc('registrar_venta', args)
      if (error) throw error
      return data
    },
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: movimientosKeys.all }),
        queryClient.invalidateQueries({ queryKey: ['productos'] }),
        queryClient.invalidateQueries({ queryKey: ['clientes'] }),
        queryClient.invalidateQueries({ queryKey: ['cotizaciones'] }),
        queryClient.invalidateQueries({ queryKey: ['cartera'] }),
        queryClient.invalidateQueries({ queryKey: ['contabilidad'] }),
      ]),
  })
}

/** ¿Hay clave de anulación definida? (false para quien no es admin) */
export function useHayClaveAnulacion(enabled = true) {
  return useQuery({
    queryKey: ['seguridad', 'clave-anulacion'],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('hay_clave_anulacion')
      if (error) throw error
      return data
    },
  })
}

interface ResultadoClave {
  ok: boolean
  error?: string
  anulacion_id?: string
}

/** Las funciones de la clave no lanzan error con una clave incorrecta (para registrar el intento): lo devuelven */
function comprobar(data: unknown): ResultadoClave {
  const r = data as ResultadoClave
  if (!r.ok) throw new Error(r.error ?? 'No se pudo completar la operación')
  return r
}

/** Anula una entrada o una venta con la clave de anulación; devuelve el id del movimiento contrario */
export function useAnularMovimiento() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (args: { p_id: string; p_motivo: string; p_clave: string }) => {
      const { data, error } = await supabase.rpc('anular_movimiento', args)
      if (error) throw error
      return comprobar(data).anulacion_id!
    },
    onSuccess: () =>
      Promise.all(
        [
          'movimientos',
          'productos',
          'clientes',
          'proveedores',
          'cotizaciones',
          'cartera',
          'ordenes-compra',
          'reportes',
          'dashboard',
          'contabilidad',
        ].map((clave) => queryClient.invalidateQueries({ queryKey: [clave] })),
      ),
  })
}

export function useDefinirClaveAnulacion() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (args: { p_nueva: string; p_actual?: string | null }) => {
      const { data, error } = await supabase.rpc('definir_clave_anulacion', args)
      if (error) throw error
      comprobar(data)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['seguridad'] }),
  })
}
