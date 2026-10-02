import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { traerTodo } from '@/lib/paginar'
import type { Database } from '@/types/database'

// Tesorería (migración 0025): cajas y bancos, egresos, traslados, anticipos y edades.
// Admin y la contadora registran; lectura consulta.

type Fn = Database['public']['Functions']
export type CuentaTesoreria = Fn['saldos_tesoreria']['Returns'][number]
export type FilaEdades = Fn['edades_por_tercero']['Returns'][number]
export type ArgsEgreso = Fn['registrar_egreso']['Args']
export type ArgsTraslado = Fn['registrar_traslado']['Args']
export type ArgsAnticipo = Fn['registrar_anticipo']['Args']
export type DocumentoTesoreria = Fn['anular_tesoreria']['Args']['p_tabla']

export const tesoreriaKeys = {
  all: ['tesoreria'] as const,
  cuentas: () => [...tesoreriaKeys.all, 'cuentas'] as const,
  documentos: (tabla: DocumentoTesoreria, desde: string, hasta: string) =>
    [...tesoreriaKeys.all, tabla, desde, hasta] as const,
  edades: (cuenta: string) => [...tesoreriaKeys.all, 'edades', cuenta] as const,
}

/** CE-000001, TR-000001, RA-000001 */
export const etiquetaDocumento = (prefijo: 'CE' | 'TR' | 'RA', numero: number) =>
  `${prefijo}-${String(numero).padStart(6, '0')}`

function useInvalidar() {
  const queryClient = useQueryClient()
  return () =>
    Promise.all(
      ['tesoreria', 'contabilidad', 'cartera', 'movimientos'].map((clave) =>
        queryClient.invalidateQueries({ queryKey: [clave] }),
      ),
    )
}

/** Cajas y bancos con su saldo de hoy */
export function useCuentasTesoreria() {
  return useQuery({
    queryKey: tesoreriaKeys.cuentas(),
    queryFn: async () => {
      const { data, error } = await supabase.rpc('saldos_tesoreria')
      if (error) throw error
      return data
    },
  })
}

export function useCrearCuentaTesoreria() {
  const invalidar = useInvalidar()
  return useMutation({
    mutationFn: async (args: Fn['crear_cuenta_tesoreria']['Args']) => {
      const { data, error } = await supabase.rpc('crear_cuenta_tesoreria', args)
      if (error) throw error
      return data
    },
    onSuccess: invalidar,
  })
}

export function useActualizarCuentaTesoreria() {
  const invalidar = useInvalidar()
  return useMutation({
    mutationFn: async ({
      id,
      ...cambios
    }: { id: string } & Database['public']['Tables']['cuentas_tesoreria']['Update']) => {
      const { error } = await supabase.from('cuentas_tesoreria').update(cambios).eq('id', id)
      if (error) throw error
    },
    onSuccess: invalidar,
  })
}

// ---------------------------------------------------------------------
// Documentos
// ---------------------------------------------------------------------
export function useEgresos(desde: string, hasta: string) {
  return useQuery({
    queryKey: tesoreriaKeys.documentos('egresos', desde, hasta),
    placeholderData: (previo) => previo,
    queryFn: async () => {
      const { filas } = await traerTodo((d, h) =>
        supabase
          .from('egresos')
          .select(
            '*, caja:cuentas_tesoreria(nombre), proveedor:proveedores(nombre), cliente:clientes(nombre), tercero:terceros(nombre)',
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

export function useTraslados(desde: string, hasta: string) {
  return useQuery({
    queryKey: tesoreriaKeys.documentos('traslados', desde, hasta),
    placeholderData: (previo) => previo,
    queryFn: async () => {
      const { filas } = await traerTodo((d, h) =>
        supabase
          .from('traslados')
          .select(
            '*, origen:cuentas_tesoreria!traslados_origen_id_fkey(nombre), destino:cuentas_tesoreria!traslados_destino_id_fkey(nombre)',
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

/** Anticipos con lo aplicado (abonos vigentes que salieron de cada uno) */
export function useAnticipos(desde: string, hasta: string) {
  return useQuery({
    queryKey: tesoreriaKeys.documentos('anticipos', desde, hasta),
    placeholderData: (previo) => previo,
    queryFn: async () => {
      const { filas } = await traerTodo((d, h) =>
        supabase
          .from('anticipos')
          .select('*, cliente:clientes(nombre), caja:cuentas_tesoreria(nombre)')
          .gte('fecha', desde)
          .lte('fecha', hasta)
          .order('numero', { ascending: false })
          .range(d, h),
      )
      const ids = filas.map((a) => a.id)
      const aplicado = new Map<string, number>()
      if (ids.length) {
        const { data, error } = await supabase
          .from('pagos')
          .select('anticipo_id, valor')
          .in('anticipo_id', ids)
          .is('anulado_at', null)
        if (error) throw error
        for (const p of data) if (p.anticipo_id) aplicado.set(p.anticipo_id, (aplicado.get(p.anticipo_id) ?? 0) + p.valor)
      }
      return filas.map((a) => ({ ...a, aplicado: aplicado.get(a.id) ?? 0 }))
    },
  })
}

export type Egreso = NonNullable<ReturnType<typeof useEgresos>['data']>[number]
export type Traslado = NonNullable<ReturnType<typeof useTraslados>['data']>[number]
export type Anticipo = NonNullable<ReturnType<typeof useAnticipos>['data']>[number]

export function useRegistrarEgreso() {
  const invalidar = useInvalidar()
  return useMutation({
    mutationFn: async (args: ArgsEgreso) => {
      const { data, error } = await supabase.rpc('registrar_egreso', args)
      if (error) throw error
      return data
    },
    onSuccess: invalidar,
  })
}

export function useRegistrarTraslado() {
  const invalidar = useInvalidar()
  return useMutation({
    mutationFn: async (args: ArgsTraslado) => {
      const { data, error } = await supabase.rpc('registrar_traslado', args)
      if (error) throw error
      return data
    },
    onSuccess: invalidar,
  })
}

export function useRegistrarAnticipo() {
  const invalidar = useInvalidar()
  return useMutation({
    mutationFn: async (args: ArgsAnticipo) => {
      const { data, error } = await supabase.rpc('registrar_anticipo', args)
      if (error) throw error
      return data
    },
    onSuccess: invalidar,
  })
}

export function useAplicarAnticipo() {
  const invalidar = useInvalidar()
  return useMutation({
    mutationFn: async (args: Fn['aplicar_anticipo']['Args']) => {
      const { data, error } = await supabase.rpc('aplicar_anticipo', args)
      if (error) throw error
      return data
    },
    onSuccess: invalidar,
  })
}

export function useAnularTesoreria() {
  const invalidar = useInvalidar()
  return useMutation({
    mutationFn: async (args: Fn['anular_tesoreria']['Args']) => {
      const { error } = await supabase.rpc('anular_tesoreria', args)
      if (error) throw error
    },
    onSuccess: invalidar,
  })
}

/** Lo pendiente de cada tercero por antigüedad: clientes (1305) o proveedores (2205) */
export function useEdades(cuenta: string) {
  return useQuery({
    queryKey: tesoreriaKeys.edades(cuenta),
    queryFn: async () => {
      const { filas } = await traerTodo((d, h) => supabase.rpc('edades_por_tercero', { p_cuenta: cuenta }).range(d, h))
      return filas
    },
  })
}
