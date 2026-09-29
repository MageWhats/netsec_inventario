import { estadosCotizacion, estadoVisible, type CotizacionResumen } from '../api'

export function EstadoCotizacionBadge({ cotizacion }: { cotizacion: Pick<CotizacionResumen, 'estado' | 'vencida'> }) {
  const { label, clase } = estadosCotizacion[estadoVisible(cotizacion)]
  return <span className={`inline-block rounded-full px-2 py-0.5 text-xs whitespace-nowrap ${clase}`}>{label}</span>
}
