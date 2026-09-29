import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { traerTodo } from '@/lib/paginar'
import { traerCostosLineas, traerCostosProductos } from '@/lib/costos'
import type { TipoMovimiento } from '@/features/movimientos/tipos'

export interface FiltrosLineas {
  /** Fechas en formato YYYY-MM-DD (hora local) */
  desde: string
  hasta: string
  tipo?: TipoMovimiento | ''
}

const SELECT_LINEA = `
  id, cantidad, precio_unitario,
  producto:productos(id, sku, nombre, es_serializado, categoria:categorias(nombre)),
  unidad:unidades(id, numero_serie),
  movimiento:movimientos!inner(
    id, numero, tipo, fecha, referencia, notas, motivo,
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
      const inicio = new Date(`${filtros.desde}T00:00:00`).toISOString()
      const fin = new Date(`${filtros.hasta}T23:59:59.999`).toISOString()
      const [{ filas: datos }, costosLineas, costosProductos] = await Promise.all([
        traerTodo((desde, hasta) => {
          let query = supabase
            .from('movimiento_items')
            .select(SELECT_LINEA)
            .gte('movimiento.fecha', inicio)
            .lte('movimiento.fecha', fin)
            // Lo anulado y los ajustes que lo anulan se cancelan entre sí: no cuentan en los reportes
            .is('movimiento.anulado_at', null)
            .is('movimiento.anula_id', null)
            .order('id')
          if (filtros.tipo) query = query.eq('movimiento.tipo', filtros.tipo)
          return query.range(desde, hasta)
        }, LIMITE_LINEAS),
        traerCostosLineas({ desde: inicio, hasta: fin }),
        traerCostosProductos(),
      ])
      // Los costos llegan aparte: solo para quien ve costos (migración 0015)
      const filas = datos.map((l) => ({
        ...l,
        costo_unitario: costosLineas.get(l.id) ?? null,
        producto: { ...l.producto, precio_costo: costosProductos.get(l.producto.id) ?? 0 },
      }))
      return filas.sort(
        (a, b) => a.movimiento.fecha.localeCompare(b.movimiento.fecha) || a.movimiento.numero - b.movimiento.numero,
      )
    },
  })
}

export type LineaMovimiento = NonNullable<ReturnType<typeof useLineasMovimiento>['data']>[number]

/** Precio de venta en salidas, costo en el resto (igual que en el historial de movimientos) */
export const valorUnitario = (l: LineaMovimiento) =>
  (l.movimiento.tipo === 'salida' ? l.precio_unitario : l.costo_unitario) ?? null

export interface FiltrosAuditoria {
  desde: string
  hasta: string
  tabla?: string
}

/** Historial de cambios (lo llenan los triggers de la migración 0005) */
export function useAuditoria(filtros: FiltrosAuditoria) {
  return useQuery({
    queryKey: ['reportes', 'auditoria', filtros],
    placeholderData: (anterior) => anterior,
    queryFn: async () => {
      const { filas } = await traerTodo((desde, hasta) => {
        let query = supabase
          .from('auditoria')
          .select('*')
          .gte('fecha', new Date(`${filtros.desde}T00:00:00`).toISOString())
          .lte('fecha', new Date(`${filtros.hasta}T23:59:59.999`).toISOString())
          .order('fecha', { ascending: false })
          .order('id', { ascending: false })
        if (filtros.tabla) query = query.eq('tabla', filtros.tabla)
        return query.range(desde, hasta)
      }, LIMITE_LINEAS)
      return filas
    },
  })
}

export type RegistroAuditoria = NonNullable<ReturnType<typeof useAuditoria>['data']>[number]
