import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { traerTodo } from '@/lib/paginar'
import type { Database, Enums, Tables, TablesInsert, TablesUpdate } from '@/types/database'

// Contabilidad, fase 1 (migraciones 0021 y 0022): plan de cuentas, terceros, periodos, comprobantes
// manuales, balance de prueba y auxiliares. Admin y contador la llevan; lectura la consulta.

export type Cuenta = Tables<'cuentas'>
export type Tercero = Tables<'terceros'>
export type Periodo = Tables<'periodos'>
export type Parametro = Tables<'parametros_contables'>
export type ConfiguracionContable = Tables<'configuracion_contable'>
export type Naturaleza = Enums<'naturaleza_cuenta'>
export type FilaBalance = Database['public']['Functions']['balance_prueba']['Returns'][number]
export type FilaAuxiliar = Database['public']['Functions']['auxiliar_cuenta']['Returns'][number]

export const TIPOS_MANUALES = {
  CC: 'Comprobante contable',
  SI: 'Saldos iniciales',
} as const
export type TipoManual = keyof typeof TIPOS_MANUALES

export const NIVELES: Record<number, string> = {
  1: 'Clase',
  2: 'Grupo',
  3: 'Cuenta',
  4: 'Subcuenta',
  5: 'Auxiliar',
}

export const MESES = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
]

/** CC-000012 */
export const etiquetaComprobante = (c: { tipo: string; numero: number }) =>
  `${c.tipo}-${String(c.numero).padStart(6, '0')}`

const valorContable = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
})

/** Valores contables: con centavos solo cuando los hay */
export const formatearValor = (valor: number) => valorContable.format(valor)

/** Fecha sin hora (YYYY-MM-DD) en formato corto */
export const formatearDia = (iso: string) =>
  new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium' }).format(new Date(`${iso}T00:00:00`))

export const contabilidadKeys = {
  all: ['contabilidad'] as const,
  configuracion: () => [...contabilidadKeys.all, 'configuracion'] as const,
  cuentas: () => [...contabilidadKeys.all, 'cuentas'] as const,
  terceros: () => [...contabilidadKeys.all, 'terceros'] as const,
  parametros: () => [...contabilidadKeys.all, 'parametros'] as const,
  periodos: () => [...contabilidadKeys.all, 'periodos'] as const,
  comprobantes: (filtro: FiltroComprobantes) => [...contabilidadKeys.all, 'comprobantes', filtro] as const,
  comprobante: (id: string) => [...contabilidadKeys.all, 'comprobante', id] as const,
  balance: (desde: string, hasta: string) => [...contabilidadKeys.all, 'balance', desde, hasta] as const,
  auxiliar: (cuenta: string, desde: string, hasta: string) =>
    [...contabilidadKeys.all, 'auxiliar', cuenta, desde, hasta] as const,
}

function useInvalidar() {
  const queryClient = useQueryClient()
  return () => queryClient.invalidateQueries({ queryKey: contabilidadKeys.all })
}

// ---------------------------------------------------------------------
// Configuración y parámetros
// ---------------------------------------------------------------------
export function useConfiguracionContable() {
  return useQuery({
    queryKey: contabilidadKeys.configuracion(),
    queryFn: async () => {
      const { data, error } = await supabase.from('configuracion_contable').select('*').maybeSingle()
      if (error) throw error
      return data
    },
  })
}

export function useActualizarConfiguracion() {
  const invalidar = useInvalidar()
  return useMutation({
    mutationFn: async (cambios: TablesUpdate<'configuracion_contable'>) => {
      const { error } = await supabase.from('configuracion_contable').update(cambios).eq('id', true)
      if (error) throw error
    },
    onSuccess: invalidar,
  })
}

export function useParametros() {
  return useQuery({
    queryKey: contabilidadKeys.parametros(),
    queryFn: async () => {
      const { data, error } = await supabase.from('parametros_contables').select('*').order('cuenta')
      if (error) throw error
      return data
    },
  })
}

export function useActualizarParametro() {
  const invalidar = useInvalidar()
  return useMutation({
    mutationFn: async ({ clave, cuenta }: { clave: string; cuenta: string }) => {
      const { error } = await supabase.from('parametros_contables').update({ cuenta }).eq('clave', clave)
      if (error) throw error
    },
    onSuccess: invalidar,
  })
}

// ---------------------------------------------------------------------
// Plan de cuentas
// ---------------------------------------------------------------------
export function useCuentas() {
  return useQuery({
    queryKey: contabilidadKeys.cuentas(),
    staleTime: 60_000,
    queryFn: async () => {
      const { filas } = await traerTodo((desde, hasta) =>
        supabase.from('cuentas').select('*').order('codigo').range(desde, hasta),
      )
      return filas
    },
  })
}

/** Códigos de las cuentas que tienen subcuentas (no reciben movimientos) */
export function codigosConHijas(cuentas: Cuenta[]): Set<string> {
  return new Set(cuentas.map((c) => c.padre).filter((p): p is string => p !== null))
}

export function useCrearCuenta() {
  const invalidar = useInvalidar()
  return useMutation({
    mutationFn: async (cuenta: TablesInsert<'cuentas'>) => {
      const { error } = await supabase.from('cuentas').insert(cuenta)
      if (error) throw error
    },
    onSuccess: invalidar,
  })
}

export function useActualizarCuenta() {
  const invalidar = useInvalidar()
  return useMutation({
    mutationFn: async ({ codigo, ...cambios }: TablesUpdate<'cuentas'> & { codigo: string }) => {
      const { error } = await supabase.from('cuentas').update(cambios).eq('codigo', codigo)
      if (error) throw error
    },
    onSuccess: invalidar,
  })
}

// ---------------------------------------------------------------------
// Terceros: clientes, proveedores y otros (comerciantes, DIAN, bancos...)
// ---------------------------------------------------------------------
export function useTerceros() {
  return useQuery({
    queryKey: contabilidadKeys.terceros(),
    queryFn: async () => {
      const { data, error } = await supabase.from('terceros').select('*').order('nombre')
      if (error) throw error
      return data
    },
  })
}

export function useGuardarTercero() {
  const invalidar = useInvalidar()
  return useMutation({
    mutationFn: async ({ id, ...datos }: TablesInsert<'terceros'>) => {
      const { error } = id
        ? await supabase.from('terceros').update(datos).eq('id', id)
        : await supabase.from('terceros').insert(datos)
      if (error) throw error
    },
    onSuccess: invalidar,
  })
}

export type ClaseTercero = 'cliente' | 'proveedor' | 'tercero'

/** Cualquiera de los tres tipos de tercero, para elegirlo en una línea del comprobante */
export interface OpcionTercero {
  clase: ClaseTercero
  id: string
  nombre: string
  documento: string | null
  activo: boolean
}

export const CLASES_TERCERO: Record<ClaseTercero, string> = {
  cliente: 'Cliente',
  proveedor: 'Proveedor',
  tercero: 'Otro tercero',
}

export function useOpcionesTercero(enabled = true) {
  return useQuery({
    queryKey: [...contabilidadKeys.terceros(), 'opciones'],
    enabled,
    queryFn: async (): Promise<OpcionTercero[]> => {
      const [clientes, proveedores, terceros] = await Promise.all([
        traerTodo((desde, hasta) =>
          supabase.from('clientes').select('id, nombre, documento, activo').order('nombre').order('id').range(desde, hasta),
        ),
        traerTodo((desde, hasta) =>
          supabase.from('proveedores').select('id, nombre, nit, activo').order('nombre').order('id').range(desde, hasta),
        ),
        traerTodo((desde, hasta) =>
          supabase.from('terceros').select('id, nombre, documento, activo').order('nombre').order('id').range(desde, hasta),
        ),
      ])
      return [
        ...clientes.filas.map((c) => ({ clase: 'cliente' as const, ...c })),
        ...proveedores.filas.map(({ nit, ...p }) => ({ clase: 'proveedor' as const, documento: nit, ...p })),
        ...terceros.filas.map((t) => ({ clase: 'tercero' as const, ...t })),
      ].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
    },
  })
}

// ---------------------------------------------------------------------
// Periodos
// ---------------------------------------------------------------------
export function usePeriodos() {
  return useQuery({
    queryKey: contabilidadKeys.periodos(),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('periodos')
        .select('*')
        .order('anio', { ascending: false })
        .order('mes', { ascending: false })
      if (error) throw error
      return data
    },
  })
}

export function useCerrarPeriodo() {
  const invalidar = useInvalidar()
  return useMutation({
    mutationFn: async (args: { p_anio: number; p_mes: number }) => {
      const { error } = await supabase.rpc('cerrar_periodo', args)
      if (error) throw error
    },
    onSuccess: invalidar,
  })
}

export function useReabrirPeriodo() {
  const invalidar = useInvalidar()
  return useMutation({
    mutationFn: async (args: { p_anio: number; p_mes: number; p_motivo: string }) => {
      const { error } = await supabase.rpc('reabrir_periodo', args)
      if (error) throw error
    },
    onSuccess: invalidar,
  })
}

// ---------------------------------------------------------------------
// Comprobantes
// ---------------------------------------------------------------------
export interface FiltroComprobantes {
  desde: string
  hasta: string
  tipo: string
}

const SELECT_COMPROBANTE = `
  *,
  usuario:perfiles!comprobantes_usuario_id_fkey(nombre),
  asientos(
    id, linea, cuenta, descripcion, debito, credito, cliente_id, proveedor_id, tercero_id,
    cuenta_info:cuentas(nombre),
    cliente:clientes(nombre, documento),
    proveedor:proveedores(nombre, nit),
    tercero:terceros(nombre, documento)
  )
` as const

/** Libro diario: los comprobantes de un período con sus líneas */
export function useComprobantes(filtro: FiltroComprobantes) {
  return useQuery({
    queryKey: contabilidadKeys.comprobantes(filtro),
    placeholderData: (previo) => previo,
    queryFn: async () => {
      const { filas, truncado } = await traerTodo((desde, hasta) => {
        let query = supabase
          .from('comprobantes')
          .select(SELECT_COMPROBANTE)
          .gte('fecha', filtro.desde)
          .lte('fecha', filtro.hasta)
          .order('fecha')
          .order('tipo')
          .order('numero')
          .order('linea', { referencedTable: 'asientos' })
        if (filtro.tipo) query = query.eq('tipo', filtro.tipo)
        return query.range(desde, hasta)
      }, 5_000)
      return { comprobantes: filas, truncado }
    },
  })
}

export type ComprobanteConLineas = NonNullable<ReturnType<typeof useComprobante>['data']>

export function useComprobante(id: string) {
  return useQuery({
    queryKey: contabilidadKeys.comprobante(id),
    enabled: Boolean(id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('comprobantes')
        .select(SELECT_COMPROBANTE)
        .eq('id', id)
        .order('linea', { referencedTable: 'asientos' })
        .maybeSingle()
      if (error) throw error
      if (!data) return null
      // El comprobante que lo anula, o el que este anula
      const [anulacion, original] = await Promise.all([
        supabase.from('comprobantes').select('id, tipo, numero').eq('anula_id', id).maybeSingle(),
        data.anula_id
          ? supabase.from('comprobantes').select('id, tipo, numero').eq('id', data.anula_id).maybeSingle()
          : Promise.resolve({ data: null, error: null }),
      ])
      if (anulacion.error) throw anulacion.error
      if (original.error) throw original.error
      return { ...data, anulacion: anulacion.data, original: original.data }
    },
  })
}

export interface LineaComprobante {
  cuenta: string
  debito: number
  credito: number
  descripcion?: string
  cliente_id?: string
  proveedor_id?: string
  tercero_id?: string
}

export function useRegistrarComprobante() {
  const invalidar = useInvalidar()
  return useMutation({
    mutationFn: async (args: { tipo: TipoManual; fecha: string; descripcion: string; lineas: LineaComprobante[] }) => {
      const { data, error } = await supabase.rpc('registrar_comprobante', {
        p_tipo: args.tipo,
        p_fecha: args.fecha,
        p_descripcion: args.descripcion,
        p_lineas: args.lineas as unknown as Database['public']['Functions']['registrar_comprobante']['Args']['p_lineas'],
      })
      if (error) throw error
      return data
    },
    onSuccess: invalidar,
  })
}

export function useAnularComprobante() {
  const invalidar = useInvalidar()
  return useMutation({
    mutationFn: async (args: { p_id: string; p_motivo: string }) => {
      const { data, error } = await supabase.rpc('anular_comprobante', args)
      if (error) throw error
      return data
    },
    onSuccess: invalidar,
  })
}

// ---------------------------------------------------------------------
// Informes
// ---------------------------------------------------------------------
export function useBalancePrueba(desde: string, hasta: string) {
  return useQuery({
    queryKey: contabilidadKeys.balance(desde, hasta),
    placeholderData: (previo) => previo,
    queryFn: async () => {
      const { filas } = await traerTodo((d, h) =>
        supabase.rpc('balance_prueba', { p_desde: desde, p_hasta: hasta }).range(d, h),
      )
      return filas
    },
  })
}

export function useAuxiliar(cuenta: string, desde: string, hasta: string) {
  return useQuery({
    queryKey: contabilidadKeys.auxiliar(cuenta, desde, hasta),
    enabled: Boolean(cuenta),
    placeholderData: (previo) => previo,
    queryFn: async () => {
      const { filas, truncado } = await traerTodo(
        (d, h) => supabase.rpc('auxiliar_cuenta', { p_cuenta: cuenta, p_desde: desde, p_hasta: hasta }).range(d, h),
        10_000,
      )
      return { filas, truncado }
    },
  })
}
