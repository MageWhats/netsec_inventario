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

const diasDelMes = (anio: number, mes: number) => new Date(anio, mes + 1, 0).getDate()

/**
 * Período con el que se compara un rango:
 * - Mes en curso (del 1 a una fecha) → los mismos días del mes anterior.
 * - Año en curso (del 1 de enero a una fecha) → las mismas fechas del año anterior.
 * - Cualquier otro → el mismo número de días justo antes.
 */
export function rangoAnterior({ desde, hasta }: Rango): Rango {
  const d = new Date(`${desde}T00:00:00`)
  const h = new Date(`${hasta}T00:00:00`)
  const mismoAnio = d.getFullYear() === h.getFullYear()
  if (d.getDate() === 1 && mismoAnio && d.getMonth() === h.getMonth()) {
    const anio = d.getMonth() === 0 ? d.getFullYear() - 1 : d.getFullYear()
    const mes = (d.getMonth() + 11) % 12
    return {
      desde: fechaIso(new Date(anio, mes, 1)),
      hasta: fechaIso(new Date(anio, mes, Math.min(h.getDate(), diasDelMes(anio, mes)))),
    }
  }
  if (d.getDate() === 1 && d.getMonth() === 0 && mismoAnio) {
    const anio = d.getFullYear() - 1
    return {
      desde: fechaIso(new Date(anio, 0, 1)),
      hasta: fechaIso(new Date(anio, h.getMonth(), Math.min(h.getDate(), diasDelMes(anio, h.getMonth())))),
    }
  }
  const dias = Math.round((h.getTime() - d.getTime()) / 86_400_000) + 1
  return {
    desde: fechaIso(new Date(d.getFullYear(), d.getMonth(), d.getDate() - dias)),
    hasta: fechaIso(new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1)),
  }
}
