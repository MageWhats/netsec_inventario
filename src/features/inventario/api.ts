import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Enums, Views } from '@/types/database'

export type EstadoToma = Enums<'estado_toma'>
export type TomaResumen = Views<'tomas_resumen'>

export const tomasKeys = {
  all: ['tomas'] as const,
  lista: () => [...tomasKeys.all, 'lista'] as const,
  detalle: (id: string) => [...tomasKeys.all, 'detalle', id] as const,
  productos: (id: string) => [...tomasKeys.all, 'productos', id] as const,
  seriales: (id: string) => [...tomasKeys.all, 'seriales', id] as const,
  movimientosDesde: (id: string) => [...tomasKeys.all, 'movimientos-desde', id] as const,
}

/** Mientras la toma está abierta se refresca sola: pueden estar contando desde varios teléfonos */
const REFRESCO_EN_CURSO_MS = 15_000

// ---------------------------------------------------------------------
// Consultas
// ---------------------------------------------------------------------

export function useTomas() {
  return useQuery({
    queryKey: tomasKeys.lista(),
    queryFn: async () => {
      const { data, error } = await supabase.from('tomas_resumen').select('*').order('numero', { ascending: false })
      if (error) throw error
      return data
    },
  })
}

export function useToma(id: string) {
  return useQuery({
    queryKey: tomasKeys.detalle(id),
    queryFn: async () => {
      const { data, error } = await supabase.from('tomas_resumen').select('*').eq('id', id).maybeSingle()
      if (error) throw error
      return data
    },
  })
}

const SELECT_TOMA_PRODUCTO = `
  producto_id, stock_inicial, contado,
  producto:productos(id, sku, nombre, codigo_barras, es_serializado, precio_costo, activo, categoria:categorias(nombre))
`

export function useTomaProductos(id: string, enCurso: boolean) {
  return useQuery({
    queryKey: tomasKeys.productos(id),
    refetchInterval: enCurso ? REFRESCO_EN_CURSO_MS : false,
    queryFn: async () => {
      const { data, error } = await supabase.from('toma_productos').select(SELECT_TOMA_PRODUCTO).eq('toma_id', id)
      if (error) throw error
      return data.sort((a, b) => a.producto.nombre.localeCompare(b.producto.nombre))
    },
  })
}

export type TomaProducto = NonNullable<ReturnType<typeof useTomaProductos>['data']>[number]

export function useTomaSeriales(id: string, enCurso: boolean) {
  return useQuery({
    queryKey: tomasKeys.seriales(id),
    refetchInterval: enCurso ? REFRESCO_EN_CURSO_MS : false,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('toma_seriales')
        .select('producto_id, created_at, unidad:unidades(id, numero_serie, mac, estado)')
        .eq('toma_id', id)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data
    },
  })
}

export type TomaSerial = NonNullable<ReturnType<typeof useTomaSeriales>['data']>[number]

/**
 * Movimientos registrados desde que empezó la toma. Si hay, los productos contados antes de
 * esos movimientos pueden quedar con diferencias falsas (se comparan con el stock actual).
 */
export function useMovimientosDesde(toma: TomaResumen | null | undefined) {
  return useQuery({
    queryKey: tomasKeys.movimientosDesde(toma?.id ?? ''),
    enabled: toma?.estado === 'en_curso',
    refetchInterval: REFRESCO_EN_CURSO_MS,
    queryFn: async () => {
      const { count, error } = await supabase
        .from('movimientos')
        .select('id', { count: 'exact', head: true })
        .gt('created_at', toma!.created_at)
      if (error) throw error
      return count ?? 0
    },
  })
}

// ---------------------------------------------------------------------
// Mutaciones (todas pasan por funciones del servidor que validan la toma)
// ---------------------------------------------------------------------

function useInvalidarToma(id: string) {
  const queryClient = useQueryClient()
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: tomasKeys.productos(id) }),
      queryClient.invalidateQueries({ queryKey: tomasKeys.seriales(id) }),
      queryClient.invalidateQueries({ queryKey: tomasKeys.detalle(id) }),
      queryClient.invalidateQueries({ queryKey: tomasKeys.lista() }),
    ])
}

export function useIniciarToma() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ categoriaId, notas }: { categoriaId: string | null; notas: string }) => {
      const { data, error } = await supabase.rpc('iniciar_toma', { p_categoria_id: categoriaId, p_notas: notas })
      if (error) throw error
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: tomasKeys.all }),
  })
}

export function useContarProducto(tomaId: string) {
  const invalidar = useInvalidarToma(tomaId)
  return useMutation({
    mutationFn: async ({ productoId, contado }: { productoId: string; contado: number | null }) => {
      const { error } = await supabase.rpc('contar_producto', {
        p_toma_id: tomaId,
        p_producto_id: productoId,
        p_contado: contado,
      })
      if (error) throw error
    },
    onSettled: invalidar,
  })
}

export function useSumarConteo(tomaId: string) {
  const invalidar = useInvalidarToma(tomaId)
  return useMutation({
    mutationFn: async ({ productoId, cantidad = 1 }: { productoId: string; cantidad?: number }) => {
      const { data, error } = await supabase.rpc('sumar_conteo', {
        p_toma_id: tomaId,
        p_producto_id: productoId,
        p_cantidad: cantidad,
      })
      if (error) throw error
      return data
    },
    onSettled: invalidar,
  })
}

export interface SerialEscaneado {
  producto_id: string
  producto: string
  numero_serie: string
  estado: Enums<'estado_unidad'>
}

export function useEscanearSerial(tomaId: string) {
  const invalidar = useInvalidarToma(tomaId)
  return useMutation({
    mutationFn: async (numeroSerie: string) => {
      const { data, error } = await supabase.rpc('escanear_serial', { p_toma_id: tomaId, p_numero_serie: numeroSerie })
      if (error) throw error
      return data as unknown as SerialEscaneado
    },
    onSettled: invalidar,
  })
}

export function useQuitarSerial(tomaId: string) {
  const invalidar = useInvalidarToma(tomaId)
  return useMutation({
    mutationFn: async (unidadId: string) => {
      const { error } = await supabase.rpc('quitar_serial', { p_toma_id: tomaId, p_unidad_id: unidadId })
      if (error) throw error
    },
    onSettled: invalidar,
  })
}

export function useFinalizarToma(tomaId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('finalizar_toma', { p_toma_id: tomaId })
      if (error) throw error
      return data as { ajuste_entrada_id: string | null; ajuste_salida_id: string | null }
    },
    // Los ajustes cambian stock, unidades, kardex, dashboard y reportes
    onSuccess: () => queryClient.invalidateQueries(),
  })
}

export function useCancelarToma(tomaId: string) {
  const invalidar = useInvalidarToma(tomaId)
  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('cancelar_toma', { p_toma_id: tomaId })
      if (error) throw error
    },
    onSuccess: invalidar,
  })
}
