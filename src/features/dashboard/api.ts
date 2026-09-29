import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { traerTodo } from '@/lib/paginar'

export interface ResumenMes {
  /** Primer día del mes, YYYY-MM */
  clave: string
  etiqueta: string
  /** Unidades recibidas de proveedores (movimientos de entrada, sin ajustes) */
  entradas: number
  /** Unidades despachadas a clientes (movimientos de salida, sin ajustes) */
  salidas: number
  ventas: number
  numeroVentas: number
}

const etiquetaMes = new Intl.DateTimeFormat('es-CO', { month: 'short', year: '2-digit' })

const claveMes = (fecha: Date) => `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}`

/** Entradas, salidas y ventas de los últimos `meses` meses (incluido el actual), en hora local */
export function useResumenMensual(meses = 6) {
  return useQuery({
    queryKey: ['dashboard', 'resumen-mensual', meses],
    queryFn: async (): Promise<ResumenMes[]> => {
      const hoy = new Date()
      const desde = new Date(hoy.getFullYear(), hoy.getMonth() - (meses - 1), 1)

      const resumen = new Map<string, ResumenMes>()
      for (let i = 0; i < meses; i++) {
        const mes = new Date(desde.getFullYear(), desde.getMonth() + i, 1)
        resumen.set(claveMes(mes), {
          clave: claveMes(mes),
          etiqueta: etiquetaMes.format(mes),
          entradas: 0,
          salidas: 0,
          ventas: 0,
          numeroVentas: 0,
        })
      }

      const { filas } = await traerTodo((inicio, fin) =>
        supabase
          .from('movimientos_resumen')
          .select('tipo, fecha, unidades, total_venta')
          .in('tipo', ['entrada', 'salida'])
          .gte('fecha', desde.toISOString())
          .order('id')
          .range(inicio, fin),
      )

      for (const m of filas) {
        const mes = resumen.get(claveMes(new Date(m.fecha)))
        if (!mes) continue
        if (m.tipo === 'entrada') {
          mes.entradas += m.unidades
        } else {
          mes.salidas += m.unidades
          mes.ventas += m.total_venta
          mes.numeroVentas += 1
        }
      }
      return [...resumen.values()]
    },
  })
}

export interface ProductoVendido {
  id: string
  nombre: string
  sku: string
  unidades: number
  total: number
}

/** Productos más vendidos (por unidades) desde el primer día del mes actual */
export function useMasVendidosDelMes(limite = 5) {
  return useQuery({
    queryKey: ['dashboard', 'mas-vendidos', limite],
    queryFn: async (): Promise<ProductoVendido[]> => {
      const hoy = new Date()
      const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1)
      const { filas } = await traerTodo((inicio, fin) =>
        supabase
          .from('movimiento_items')
          .select(
            'id, cantidad, precio_unitario, producto:productos(id, nombre, sku), movimiento:movimientos!inner(tipo, fecha)',
          )
          .eq('movimiento.tipo', 'salida')
          .gte('movimiento.fecha', inicioMes.toISOString())
          .order('id')
          .range(inicio, fin),
      )

      const porProducto = new Map<string, ProductoVendido>()
      for (const l of filas) {
        const p = porProducto.get(l.producto.id) ?? { ...l.producto, unidades: 0, total: 0 }
        p.unidades += l.cantidad
        p.total += l.cantidad * (l.precio_unitario ?? 0)
        porProducto.set(p.id, p)
      }
      return [...porProducto.values()].sort((a, b) => b.unidades - a.unidades || b.total - a.total).slice(0, limite)
    },
  })
}

/** Unidades enviadas a garantía (con el proveedor o en revisión) que aún no regresan */
export function useUnidadesEnGarantia() {
  return useQuery({
    queryKey: ['dashboard', 'unidades-en-garantia'],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('unidades')
        .select('id', { count: 'exact', head: true })
        .eq('estado', 'en_garantia')
      if (error) throw error
      return count ?? 0
    },
  })
}
