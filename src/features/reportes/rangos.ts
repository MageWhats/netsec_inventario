import { fechaIso } from '@/lib/exportar'

export interface Rango {
  /** Fechas en formato YYYY-MM-DD (hora local) */
  desde: string
  hasta: string
}

export function rangoEsteMes(): Rango {
  const hoy = new Date()
  return { desde: fechaIso(new Date(hoy.getFullYear(), hoy.getMonth(), 1)), hasta: fechaIso(hoy) }
}

export const PRESETS: { label: string; rango: () => Rango }[] = [
  { label: 'Este mes', rango: rangoEsteMes },
  {
    label: 'Mes anterior',
    rango: () => {
      const hoy = new Date()
      return {
        desde: fechaIso(new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1)),
        hasta: fechaIso(new Date(hoy.getFullYear(), hoy.getMonth(), 0)),
      }
    },
  },
  {
    label: 'Últimos 30 días',
    rango: () => {
      const hoy = new Date()
      return { desde: fechaIso(new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - 29)), hasta: fechaIso(hoy) }
    },
  },
  {
    label: 'Este año',
    rango: () => {
      const hoy = new Date()
      return { desde: fechaIso(new Date(hoy.getFullYear(), 0, 1)), hasta: fechaIso(hoy) }
    },
  },
]

const formatoFecha = new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium' })

export const describirRango = ({ desde, hasta }: Rango) =>
  `Del ${formatoFecha.format(new Date(`${desde}T00:00:00`))} al ${formatoFecha.format(new Date(`${hasta}T00:00:00`))}`
