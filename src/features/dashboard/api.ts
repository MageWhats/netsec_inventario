import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

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

      const { data, error } = await supabase
        .from('movimientos_resumen')
        .select('tipo, fecha, unidades, total_venta')
        .in('tipo', ['entrada', 'salida'])
        .gte('fecha', desde.toISOString())
        .limit(10_000)
      if (error) throw error

      for (const m of data) {
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
