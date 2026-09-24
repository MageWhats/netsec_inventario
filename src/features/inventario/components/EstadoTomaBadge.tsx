import type { EstadoToma } from '../api'
import { estadosToma } from '../diferencias'

export function EstadoTomaBadge({ estado }: { estado: EstadoToma }) {
  const { label, clase } = estadosToma[estado]
  return <span className={`inline-block rounded-full px-2 py-0.5 text-xs whitespace-nowrap ${clase}`}>{label}</span>
}
