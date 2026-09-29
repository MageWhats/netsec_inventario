import { Wallet } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { usePermisos } from '@/features/auth/permisos'
import { formatearNumero } from '@/features/movimientos/tipos'
import { formatearPrecio } from '@/lib/format'
import { formatearFechaCorta } from '@/lib/garantia'
import { estadoCobro, useCartera, type VentaCredito } from '../api'
import { EstadoCobroBadge } from './EstadoCobroBadge'
import { PagoModal } from './PagoModal'

/** Lo que debe un cliente: sus ventas a crédito con saldo (no se muestra si no tiene) */
export function SaldoCliente({ clienteId }: { clienteId: string }) {
  const { data: ventas = [] } = useCartera(clienteId)
  const { esAdmin } = usePermisos()
  const [abonando, setAbonando] = useState<VentaCredito | null>(null)

  const pendientes = ventas.filter((v) => v.saldo > 0)
  if (pendientes.length === 0) return null

  const saldo = pendientes.reduce((s, v) => s + v.saldo, 0)
  const vencido = pendientes.filter((v) => v.dias_vencida > 0).reduce((s, v) => s + v.saldo, 0)

  return (
    <section className="mb-6 overflow-hidden rounded-2xl border border-brand-border bg-brand-card">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-brand-border p-6">
        <div>
          <h2 className="font-semibold">Saldo por cobrar</h2>
          <p className="mt-1 text-sm text-slate-400">
            {pendientes.length} {pendientes.length === 1 ? 'venta a crédito pendiente' : 'ventas a crédito pendientes'}
          </p>
        </div>
        <div className="flex gap-6 text-right">
          {vencido > 0 && (
            <div>
              <p className="text-xs text-slate-400">Vencido</p>
              <p className="text-lg font-semibold text-red-400">{formatearPrecio(vencido)}</p>
            </div>
          )}
          <div>
            <p className="text-xs text-slate-400">Total</p>
            <p className="text-lg font-semibold">{formatearPrecio(saldo)}</p>
          </div>
        </div>
      </div>
      <ul className="divide-y divide-brand-border">
        {pendientes.map((v) => (
          <li key={v.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-6 py-3 text-sm">
            <Link to={`/movimientos/${v.id}`} className="font-mono font-medium hover:text-brand-cyan">
              {formatearNumero({ numero: v.numero, tipo: 'salida' })}
            </Link>
            <span className="text-slate-400">Vence {formatearFechaCorta(`${v.vence}T12:00:00`)}</span>
            <EstadoCobroBadge estado={estadoCobro(v)} />
            <span className="ml-auto font-medium tabular-nums">{formatearPrecio(v.saldo)}</span>
            {esAdmin && (
              <button onClick={() => setAbonando(v)} className="btn btn-secondary py-1.5 text-xs">
                <Wallet className="size-3.5" />
                Abonar
              </button>
            )}
          </li>
        ))}
      </ul>
      <PagoModal venta={abonando} onClose={() => setAbonando(null)} />
    </section>
  )
}
