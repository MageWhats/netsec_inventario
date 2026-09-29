import { Ban, CalendarClock, Loader2, Wallet } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { FormField } from '@/components/ui/FormField'
import { Modal } from '@/components/ui/Modal'
import { usePermisos } from '@/features/auth/permisos'
import { mensajeError } from '@/lib/errores'
import { fechaIso } from '@/lib/exportar'
import { formatearFecha, formatearPrecio } from '@/lib/format'
import { formatearFechaCorta } from '@/lib/garantia'
import { estadoCobro, metodosPago, useAnularPago, useCambiarFormaPago, usePagosVenta, type Pago } from '../api'
import { EstadoCobroBadge } from './EstadoCobroBadge'
import { PagoModal } from './PagoModal'

interface PagosVentaProps {
  venta: {
    id: string
    numero: number
    fecha: string
    credito: boolean
    vence: string | null
    cliente_id: string | null
  }
}

/** Forma de pago de una venta y, si es a crédito, sus abonos y saldo (admin y lectura) */
export function PagosVenta({ venta }: PagosVentaProps) {
  const { esAdmin } = usePermisos()
  const { data, isLoading, error } = usePagosVenta(venta.id, venta.credito)
  const [abonando, setAbonando] = useState(false)
  const [anulando, setAnulando] = useState<Pago | null>(null)
  const [cambiando, setCambiando] = useState(false)

  if (!venta.credito) {
    return (
      <section className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-brand-border bg-brand-card px-6 py-4 text-sm print:hidden">
        <p>
          <span className="text-slate-400">Forma de pago:</span> <span className="font-medium">Contado</span>
        </p>
        {esAdmin && venta.cliente_id && (
          <button onClick={() => setCambiando(true)} className="btn btn-secondary">
            <CalendarClock className="size-4" />
            Pasar a crédito
          </button>
        )}
        <FormaPagoModal open={cambiando} venta={venta} onClose={() => setCambiando(false)} />
      </section>
    )
  }

  const cartera = data?.venta
  const pagos = data?.pagos ?? []
  const activos = pagos.filter((p) => !p.anulado_at)
  const pct =
    cartera && cartera.total > 0 ? Math.min(((cartera.pagado + cartera.devuelto) / cartera.total) * 100, 100) : 0

  return (
    <section className="mb-6 rounded-2xl border border-brand-border bg-brand-card p-6 print:hidden">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="font-semibold">Venta a crédito</h2>
            {cartera && <EstadoCobroBadge estado={estadoCobro(cartera)} />}
          </div>
          {venta.vence && (
            <p className="mt-1 text-sm text-slate-400">
              Fecha límite de pago {formatearFechaCorta(`${venta.vence}T12:00:00`)}
              {cartera && cartera.saldo > 0 && cartera.dias_vencida > 0 && (
                <span className="ml-1 text-red-400">
                  · vencida hace {cartera.dias_vencida} {cartera.dias_vencida === 1 ? 'día' : 'días'}
                </span>
              )}
            </p>
          )}
        </div>
        {esAdmin && (
          <div className="flex flex-wrap gap-2">
            {activos.length === 0 && (
              <button onClick={() => setCambiando(true)} className="btn btn-secondary">
                <CalendarClock className="size-4" />
                Cambiar forma de pago
              </button>
            )}
            {cartera && cartera.saldo > 0 && (
              <button onClick={() => setAbonando(true)} className="btn btn-primary">
                <Wallet className="size-4" />
                Registrar abono
              </button>
            )}
          </div>
        )}
      </div>

      {isLoading ? (
        <Loader2 className="size-5 animate-spin text-slate-500" />
      ) : error ? (
        <p className="text-sm text-red-400">{mensajeError(error)}</p>
      ) : (
        cartera && (
          <>
            <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
              <Cifra label="Total" valor={cartera.total} />
              <Cifra label="Devuelto" valor={cartera.devuelto} />
              <Cifra label="Abonado" valor={cartera.pagado} />
              <Cifra
                label="Saldo"
                valor={cartera.saldo}
                clase={
                  cartera.saldo > 0
                    ? cartera.dias_vencida > 0
                      ? 'text-red-400'
                      : 'text-amber-400'
                    : 'text-emerald-400'
                }
              />
            </dl>
            <div
              className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-500/20"
              title={`${pct.toFixed(0)} % cubierto`}
            >
              <div className="h-full rounded-full bg-emerald-500" style={{ width: `${pct}%` }} />
            </div>

            {pagos.length > 0 && (
              <ul className="mt-5 divide-y divide-brand-border rounded-xl border border-brand-border">
                {pagos.map((p) => (
                  <li
                    key={p.id}
                    className={`flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-sm ${p.anulado_at ? 'opacity-60' : ''}`}
                  >
                    <span className="text-slate-400">{formatearFecha(p.fecha)}</span>
                    <span>{metodosPago[p.metodo]}</span>
                    {p.referencia && <span className="text-slate-500">Ref. {p.referencia}</span>}
                    {p.notas && <span className="text-slate-500">{p.notas}</span>}
                    <span className={`ml-auto font-medium tabular-nums ${p.anulado_at ? 'line-through' : ''}`}>
                      {formatearPrecio(p.valor)}
                    </span>
                    {p.anulado_at ? (
                      <span className="basis-full text-xs text-red-400">
                        Anulado el {formatearFecha(p.anulado_at)}: {p.motivo_anulacion}
                      </span>
                    ) : (
                      esAdmin && (
                        <button
                          onClick={() => setAnulando(p)}
                          className="rounded-lg p-1.5 text-slate-400 hover:bg-tinte/5 hover:text-red-400"
                          title="Anular abono"
                          aria-label="Anular abono"
                        >
                          <Ban className="size-4" />
                        </button>
                      )
                    )}
                  </li>
                ))}
              </ul>
            )}
          </>
        )
      )}

      <PagoModal venta={abonando && cartera ? cartera : null} onClose={() => setAbonando(false)} />
      <AnularPagoModal pago={anulando} onClose={() => setAnulando(null)} />
      <FormaPagoModal open={cambiando} venta={venta} onClose={() => setCambiando(false)} />
    </section>
  )
}

function Cifra({ label, valor, clase = '' }: { label: string; valor: number; clase?: string }) {
  return (
    <div>
      <dt className="text-slate-400">{label}</dt>
      <dd className={`mt-0.5 text-base font-semibold ${clase}`}>{formatearPrecio(valor)}</dd>
    </div>
  )
}

function AnularPagoModal({ pago, onClose }: { pago: Pago | null; onClose: () => void }) {
  const anular = useAnularPago()
  const [motivo, setMotivo] = useState('')

  function cerrar() {
    anular.reset()
    setMotivo('')
    onClose()
  }
  function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!pago || !motivo.trim()) return
    anular.mutate({ p_id: pago.id, p_motivo: motivo }, { onSuccess: cerrar })
  }

  return (
    <Modal open={Boolean(pago)} onClose={cerrar} title="Anular abono">
      {pago && (
        <form onSubmit={onSubmit} className="space-y-4">
          <p className="text-sm text-slate-300">
            El abono de <strong>{formatearPrecio(pago.valor)}</strong> del {formatearFecha(pago.fecha)} dejará de contar
            y el saldo volverá a subir. Queda en el historial como anulado.
          </p>
          <FormField label="Motivo *">
            <textarea
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              rows={2}
              maxLength={500}
              placeholder="P. ej. transferencia rechazada, valor mal digitado…"
              className="input"
              autoFocus
            />
          </FormField>
          {anular.error && (
            <p role="alert" className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">
              {mensajeError(anular.error)}
            </p>
          )}
          <div className="flex justify-end gap-3">
            <button type="button" onClick={cerrar} className="btn btn-secondary">
              Cancelar
            </button>
            <button type="submit" disabled={anular.isPending || !motivo.trim()} className="btn btn-danger">
              {anular.isPending && <Loader2 className="size-4 animate-spin" />}
              Anular abono
            </button>
          </div>
        </form>
      )}
    </Modal>
  )
}

/** Pasar una venta a crédito (con su fecha límite), cambiar la fecha o devolverla a contado */
function FormaPagoModal({
  open,
  venta,
  onClose,
}: {
  open: boolean
  venta: PagosVentaProps['venta']
  onClose: () => void
}) {
  const cambiar = useCambiarFormaPago()
  const sugerida = () => {
    const d = new Date(venta.fecha)
    d.setDate(d.getDate() + 30)
    return fechaIso(d)
  }
  const [vence, setVence] = useState(venta.vence ?? sugerida)

  function cerrar() {
    cambiar.reset()
    onClose()
  }
  const guardar = (credito: boolean) =>
    cambiar.mutate(
      { p_movimiento_id: venta.id, p_credito: credito, p_vence: credito ? vence : null },
      { onSuccess: cerrar },
    )

  return (
    <Modal open={open} onClose={cerrar} title={venta.credito ? 'Forma de pago' : 'Pasar a crédito'}>
      <div className="space-y-4">
        <p className="text-sm text-slate-300">
          {venta.credito
            ? 'Cambia la fecha límite de pago, o pasa la venta a contado si fue un error (solo mientras no tenga abonos).'
            : 'Útil para las ventas a crédito registradas antes de que existiera la cartera: la venta entra a la cartera con todo su valor como saldo.'}
        </p>
        <FormField label="Fecha límite de pago">
          <input type="date" value={vence} onChange={(e) => setVence(e.target.value)} className="input" />
        </FormField>
        {cambiar.error && (
          <p role="alert" className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">
            {mensajeError(cambiar.error)}
          </p>
        )}
        <div className="flex flex-wrap justify-end gap-3">
          <button type="button" onClick={cerrar} className="btn btn-secondary">
            Cancelar
          </button>
          {venta.credito && (
            <button
              type="button"
              onClick={() => guardar(false)}
              disabled={cambiar.isPending}
              className="btn btn-secondary"
            >
              Pasar a contado
            </button>
          )}
          <button
            type="button"
            onClick={() => guardar(true)}
            disabled={cambiar.isPending || !vence}
            className="btn btn-primary"
          >
            {cambiar.isPending && <Loader2 className="size-4 animate-spin" />}
            {venta.credito ? 'Guardar fecha' : 'Pasar a crédito'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
