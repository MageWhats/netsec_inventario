import { Link, useNavigate } from 'react-router-dom'
import { formatearFecha, formatearPrecio } from '@/lib/format'
import type { MovimientoResumen } from '../api'
import { formatearNumero, tiposMovimiento, type TipoMovimiento } from '../tipos'

export function TipoMovimientoBadge({ tipo }: { tipo: TipoMovimiento }) {
  const { label, icono: Icono, clase } = tiposMovimiento[tipo]
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs whitespace-nowrap ${clase}`}>
      <Icono className="size-3" />
      {label}
    </span>
  )
}

/** Valor del movimiento: precio de venta en salidas, costo en el resto */
function valorMovimiento(m: MovimientoResumen) {
  return m.tipo === 'salida' ? m.total_venta : m.total_costo
}

export function MovimientosTabla({ movimientos }: { movimientos: MovimientoResumen[] }) {
  const navigate = useNavigate()

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="border-b border-brand-border text-left text-xs tracking-wide text-slate-400 uppercase">
          <tr>
            <th className="px-4 py-3 font-medium">Movimiento</th>
            <th className="px-4 py-3 font-medium">Fecha</th>
            <th className="px-4 py-3 font-medium">Tipo</th>
            <th className="px-4 py-3 font-medium">Tercero / motivo</th>
            <th className="px-4 py-3 font-medium">Referencia</th>
            <th className="px-4 py-3 text-right font-medium">Unidades</th>
            <th className="px-4 py-3 text-right font-medium">Valor</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-brand-border">
          {movimientos.map((m) => (
            <tr
              key={m.id}
              onClick={() => navigate(`/movimientos/${m.id}`)}
              className="cursor-pointer transition hover:bg-white/[0.03]"
            >
              <td className="px-4 py-3">
                <Link
                  to={`/movimientos/${m.id}`}
                  onClick={(e) => e.stopPropagation()}
                  className="font-mono font-medium hover:text-brand-cyan"
                >
                  {formatearNumero(m.numero)}
                </Link>
              </td>
              <td className="px-4 py-3 whitespace-nowrap text-slate-300">{formatearFecha(m.fecha)}</td>
              <td className="px-4 py-3">
                <TipoMovimientoBadge tipo={m.tipo} />
              </td>
              <td className="max-w-xs truncate px-4 py-3 text-slate-300">
                {m.proveedor_nombre ?? m.cliente_nombre ?? (
                  <span className="text-slate-500">{m.tipo === 'salida' ? 'Consumidor final' : (m.notas ?? '—')}</span>
                )}
              </td>
              <td className="px-4 py-3 text-slate-400">{m.referencia ?? '—'}</td>
              <td className="px-4 py-3 text-right text-slate-300">{m.unidades}</td>
              <td className="px-4 py-3 text-right whitespace-nowrap text-slate-300">
                {valorMovimiento(m) > 0 ? formatearPrecio(valorMovimiento(m)) : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
