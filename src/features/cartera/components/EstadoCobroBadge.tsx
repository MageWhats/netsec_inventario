import { estadosCobro, type EstadoCobro } from '../api'

export function EstadoCobroBadge({ estado }: { estado: EstadoCobro }) {
  const { label, clase } = estadosCobro[estado]
  return <span className={`inline-block rounded-full px-2 py-0.5 text-xs whitespace-nowrap ${clase}`}>{label}</span>
}
