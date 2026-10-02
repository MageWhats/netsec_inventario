import { Loader2, Wallet } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { FormField } from '@/components/ui/FormField'
import { Modal } from '@/components/ui/Modal'
import { ahoraLocal } from '@/features/movimientos/lineas'
import { formatearNumero } from '@/features/movimientos/tipos'
import { mensajeError } from '@/lib/errores'
import { formatearPrecio } from '@/lib/format'
import { metodosPago, useRegistrarPago, type MetodoPago, type VentaCredito } from '../api'

interface PagoModalProps {
  /** Venta a la que se abona; null cierra el modal */
  venta: Pick<VentaCredito, 'id' | 'numero' | 'saldo' | 'cliente_nombre'> | null
  onClose: () => void
}

/** Registrar un abono a una venta a crédito */
export function PagoModal({ venta, onClose }: PagoModalProps) {
  return (
    <Modal open={Boolean(venta)} onClose={onClose} title="Registrar abono">
      {/* key: cada venta empieza con el formulario limpio */}
      {venta && <Formulario key={venta.id} venta={venta} onClose={onClose} />}
    </Modal>
  )
}

function Formulario({ venta, onClose }: { venta: NonNullable<PagoModalProps['venta']>; onClose: () => void }) {
  const registrar = useRegistrarPago()
  const [valor, setValor] = useState(venta.saldo)
  const [metodo, setMetodo] = useState<MetodoPago>('transferencia')
  const [fecha, setFecha] = useState(ahoraLocal)
  const [referencia, setReferencia] = useState('')
  const [notas, setNotas] = useState('')
  // Retención en la fuente que practica el cliente (agentes de retención): reduce lo que paga
  const [retencion, setRetencion] = useState(Number.NaN)
  const [intento, setIntento] = useState(false)
  const valorRetencion = Number.isFinite(retencion) ? retencion : 0

  const errorValor =
    !Number.isFinite(valor) || valor <= 0
      ? 'Escribe un valor mayor que cero.'
      : valorRetencion < 0
        ? 'La retención no puede ser negativa.'
        : valor + valorRetencion > venta.saldo
          ? `Con la retención no puede superar el saldo (${formatearPrecio(venta.saldo)}).`
          : undefined
  const errorFecha = !fecha ? 'La fecha es obligatoria.' : undefined

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    setIntento(true)
    if (errorValor || errorFecha) return
    registrar.mutate(
      {
        p_movimiento_id: venta.id,
        p_valor: valor,
        p_metodo: metodo,
        p_fecha: new Date(fecha).toISOString(),
        p_referencia: referencia,
        p_notas: notas,
        p_retencion: valorRetencion,
      },
      { onSuccess: onClose },
    )
  }

  const restante = (Number.isFinite(valor) ? venta.saldo - valor : venta.saldo) - valorRetencion

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      <div className="rounded-lg bg-tinte/5 px-4 py-3 text-sm">
        <p className="text-slate-400">
          Venta{' '}
          <span className="font-mono text-slate-200">{formatearNumero({ numero: venta.numero, tipo: 'salida' })}</span>{' '}
          · {venta.cliente_nombre}
        </p>
        <p className="mt-1">
          Saldo pendiente <strong>{formatearPrecio(venta.saldo)}</strong>
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Valor del abono *" error={intento ? errorValor : undefined}>
          <div className="flex gap-2">
            <input
              type="number"
              min={0}
              step="any"
              inputMode="decimal"
              value={Number.isFinite(valor) ? valor : ''}
              onChange={(e) => setValor(e.target.valueAsNumber)}
              className="input"
              autoFocus
            />
            {valor !== venta.saldo && (
              <button
                type="button"
                onClick={() => setValor(venta.saldo)}
                className="btn btn-secondary whitespace-nowrap"
              >
                Todo
              </button>
            )}
          </div>
        </FormField>
        <FormField label="Forma de pago *">
          <select value={metodo} onChange={(e) => setMetodo(e.target.value as MetodoPago)} className="input">
            {Object.entries(metodosPago).map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label="Fecha *" error={intento ? errorFecha : undefined}>
          <input type="datetime-local" value={fecha} onChange={(e) => setFecha(e.target.value)} className="input" />
        </FormField>
        <FormField
          label="Retención que practicó el cliente"
          hint="Solo si es agente de retención: lo que descontó del pago (va a la 135515)"
        >
          <input
            type="number"
            min={0}
            step="any"
            inputMode="decimal"
            value={Number.isFinite(retencion) ? retencion : ''}
            onChange={(e) => {
              const r = e.target.valueAsNumber
              setRetencion(r)
              // Si el valor cubría todo el saldo, el efectivo recibido baja en lo retenido
              if (valor === venta.saldo && Number.isFinite(r)) setValor(Math.max(venta.saldo - r, 0))
            }}
            className="input"
          />
        </FormField>
        <FormField label="Referencia" hint="N.º de transferencia, recibo o cheque">
          <input value={referencia} onChange={(e) => setReferencia(e.target.value)} maxLength={100} className="input" />
        </FormField>
        <FormField label="Notas" className="sm:col-span-2">
          <textarea
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            rows={2}
            maxLength={500}
            className="input"
          />
        </FormField>
      </div>

      {!errorValor && (
        <p className="text-sm text-slate-400">
          {restante <= 0 ? (
            <span className="text-emerald-400">Con este abono la venta queda pagada.</span>
          ) : (
            <>Quedará un saldo de {formatearPrecio(restante)}.</>
          )}
        </p>
      )}

      {registrar.error && (
        <p role="alert" className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">
          {mensajeError(registrar.error)}
        </p>
      )}

      <div className="flex justify-end gap-3">
        <button type="button" onClick={onClose} className="btn btn-secondary">
          Cancelar
        </button>
        <button type="submit" disabled={registrar.isPending} className="btn btn-primary">
          {registrar.isPending ? <Loader2 className="size-4 animate-spin" /> : <Wallet className="size-4" />}
          Registrar abono
        </button>
      </div>
    </form>
  )
}
