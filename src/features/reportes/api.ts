import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { TipoMovimiento } from '@/features/movimientos/tipos'

export interface FiltrosLineas {
  /** Fechas en formato YYYY-MM-DD (hora local) */
  desde: string
  hasta: string
  tipo?: TipoMovimiento | ''
}

const SELECT_LINEA = `
  id, cantidad, costo_unitario, precio_unitario,
  producto:productos(id, sku, nombre, precio_costo, categoria:categorias(nombre)),
  unidad:unidades(numero_serie),
  movimiento:movimientos!inner(
    id, numero, tipo, fecha, referencia, notas,
    cliente:clientes(id, nombre, tipo_documento, documento),
    proveedor:proveedores(id, nombre)
  )
`

/** Máximo de líneas por consulta; si se alcanza, el reporte avisa que puede estar incompleto */
export const LIMITE_LINEAS = 10_000

/** Líneas de movimiento (una por producto o serial) dentro de un rango de fechas */
export function useLineasMovimiento(filtros: FiltrosLineas) {
  return useQuery({
    queryKey: ['reportes', 'lineas', filtros],
    placeholderData: (anterior) => anterior,
    enabled: Boolean(filtros.desde && filtros.hasta),
    queryFn: async () => {
      let query = supabase
        .from('movimiento_items')
        .select(SELECT_LINEA)
        .gte('movimiento.fecha', new Date(`${filtros.desde}T00:00:00`).toISOString())
        .lte('movimiento.fecha', new Date(`${filtros.hasta}T23:59:59.999`).toISOString())
        .limit(LIMITE_LINEAS)
      if (filtros.tipo) query = query.eq('movimiento.tipo', filtros.tipo)

      const { data, error } = await query
      if (error) throw error
      return data.sort(
        (a, b) => a.movimiento.fecha.localeCompare(b.movimiento.fecha) || a.movimiento.numero - b.movimiento.numero,
      )
    },
  })
}

export type LineaMovimiento = NonNullable<ReturnType<typeof useLineasMovimiento>['data']>[number]
