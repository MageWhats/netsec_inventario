import { estadosOrden, type EstadoOrden } from '../api'

export function EstadoOrdenBadge({ estado }: { estado: EstadoOrden }) {
  const { label, clase } = estadosOrden[estado]
  return <span className={`inline-block rounded-full px-2 py-0.5 text-xs whitespace-nowrap ${clase}`}>{label}</span>
}

/** Barra de lo recibido frente a lo pedido */
export function AvanceOrden({ recibidas, unidades }: { recibidas: number; unidades: number }) {
  const porcentaje = unidades > 0 ? Math.min(100, Math.round((recibidas / unidades) * 100)) : 0
  return (
    <div className="flex min-w-32 items-center gap-2" title={`${recibidas} de ${unidades} unidades recibidas`}>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-tinte/10">
        <div
          className={`h-full rounded-full ${porcentaje === 100 ? 'bg-emerald-400' : 'bg-brand-cyan'}`}
          style={{ width: `${porcentaje}%` }}
        />
      </div>
      <span className="text-xs whitespace-nowrap text-slate-400 tabular-nums">
        {recibidas}/{unidades}
      </span>
    </div>
  )
}
