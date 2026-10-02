import { Ban, FileMinus, FilePlus, Loader2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { FormField } from '@/components/ui/FormField'
import { Modal } from '@/components/ui/Modal'
import { usePermisos } from '@/features/auth/permisos'
import { mensajeError } from '@/lib/errores'
import { fechaIso } from '@/lib/exportar'
import { formatearPrecio } from '@/lib/format'
import { formatearFechaCorta } from '@/lib/garantia'
import { etiquetaNota, useAnularNota, useRegistrarNota, type NotaVenta } from '../api'

type TipoNota = NotaVenta['tipo']

const TIPOS: Record<TipoNota, { titulo: string; ayuda: string }> = {
  credito: {
    titulo: 'Nota crédito',
    ayuda: 'Baja el saldo de la venta sin que vuelva mercancía: descuentos posteriores o errores de precio a favor del cliente.',
  },
  debito: {
    titulo: 'Nota débito',
    ayuda: 'Sube el saldo de la venta: un cobro adicional o un error de precio a favor de Net&Sec.',
  },
}

/**
 * Notas crédito y débito por valor de una venta a crédito (migración 0024). Las registra un administrador o la
 * contadora; la factura electrónica de la nota se emite por fuera y aquí se guarda su CUDE.
 */
export function NotasVenta({ ventaId, notas, saldo }: { ventaId: string; notas: NotaVenta[]; saldo: number }) {
  const { llevaContabilidad } = usePermisos()
  const [nueva, setNueva] = useState<TipoNota | null>(null)
  const [anulando, setAnulando] = useState<NotaVenta | null>(null)

  if (notas.length === 0 && !llevaContabilidad) return null

  return (
    <div className="mt-5">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-medium text-slate-300">Notas crédito y débito</h3>
        {llevaContabilidad && (
          <div className="flex gap-2">
            <button onClick={() => setNueva('credito')} className="btn btn-secondary" disabled={saldo <= 0}>
              <FileMinus className="size-4" />
              Nota crédito
            </button>
            <button onClick={() => setNueva('debito')} className="btn btn-secondary">
              <FilePlus className="size-4" />
              Nota débito
            </button>
          </div>
        )}
      </div>
      {notas.length > 0 && (
        <ul className="divide-y divide-brand-border rounded-xl border border-brand-border">
          {notas.map((n) => (
            <li
              key={n.id}
              className={`flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-sm ${n.anulado_at ? 'opacity-60' : ''}`}
            >
              <span className="font-mono">{etiquetaNota(n)}</span>
              <span className="text-slate-400">{formatearFechaCorta(`${n.fecha}T12:00:00`)}</span>
              <span className="text-slate-300">{n.motivo}</span>
              <span className={`ml-auto font-medium tabular-nums ${n.anulado_at ? 'line-through' : ''}`}>
                {n.tipo === 'credito' ? '−' : '+'}
                {formatearPrecio(n.valor)}
              </span>
              {n.anulado_at ? (
                <span className="basis-full text-xs text-red-400">Anulada: {n.motivo_anulacion}</span>
              ) : (
                llevaContabilidad && (
                  <button
                    onClick={() => setAnulando(n)}
                    className="rounded-lg p-1.5 text-slate-400 hover:bg-tinte/5 hover:text-red-400"
                    title="Anular nota"
                    aria-label={`Anular ${etiquetaNota(n)}`}
                  >
                    <Ban className="size-4" />
                  </button>
                )
              )}
            </li>
          ))}
        </ul>
      )}

      <Modal open={nueva !== null} onClose={() => setNueva(null)} title={nueva ? TIPOS[nueva].titulo : ''}>
        {nueva && <NotaForm key={nueva} tipo={nueva} ventaId={ventaId} saldo={saldo} onClose={() => setNueva(null)} />}
      </Modal>
      <Modal open={anulando !== null} onClose={() => setAnulando(null)} title={`Anular ${anulando ? etiquetaNota(anulando) : ''}`}>
        {anulando && <AnularNotaForm key={anulando.id} nota={anulando} onClose={() => setAnulando(null)} />}
      </Modal>
    </div>
  )
}

function NotaForm({ tipo, ventaId, saldo, onClose }: { tipo: TipoNota; ventaId: string; saldo: number; onClose: () => void }) {
  const registrar = useRegistrarNota()
  const [valor, setValor] = useState(Number.NaN)
  const [motivo, setMotivo] = useState('')
  const [fecha, setFecha] = useState(() => fechaIso(new Date()))
  const [cufe, setCufe] = useState('')
  const [intento, setIntento] = useState(false)

  const errorValor =
    !Number.isFinite(valor) || valor <= 0
      ? 'Escribe un valor mayor que cero.'
      : tipo === 'credito' && valor > saldo
        ? `No puede superar el saldo (${formatearPrecio(saldo)}).`
        : undefined
  const errorMotivo = motivo.trim().length < 5 ? 'Explica el motivo (mínimo 5 caracteres).' : undefined
  const errorCufe = cufe.trim() && !/^[0-9a-fA-F]{96}$/.test(cufe.trim()) ? 'El CUDE tiene 96 caracteres.' : undefined

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    setIntento(true)
    if (errorValor || errorMotivo || errorCufe) return
    registrar.mutate(
      { p_movimiento_id: ventaId, p_tipo: tipo, p_valor: valor, p_motivo: motivo.trim(), p_fecha: fecha, p_cufe: cufe.trim() || null },
      { onSuccess: onClose },
    )
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      <p className="text-sm text-slate-400">{TIPOS[tipo].ayuda}</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Valor *" error={intento ? errorValor : undefined}>
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
        </FormField>
        <FormField label="Fecha *">
          <input type="date" value={fecha} max={fechaIso(new Date())} onChange={(e) => setFecha(e.target.value)} className="input" />
        </FormField>
        <FormField label="Motivo *" error={intento ? errorMotivo : undefined} className="sm:col-span-2">
          <input value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={300} className="input" />
        </FormField>
        <FormField
          label="CUDE de la nota electrónica"
          error={intento ? errorCufe : undefined}
          hint="Si ya se emitió; se puede dejar vacío"
          className="sm:col-span-2"
        >
          <input value={cufe} onChange={(e) => setCufe(e.target.value)} maxLength={96} className="input font-mono text-xs" />
        </FormField>
      </div>
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
          {registrar.isPending && <Loader2 className="size-4 animate-spin" />}
          Registrar {TIPOS[tipo].titulo.toLowerCase()}
        </button>
      </div>
    </form>
  )
}

function AnularNotaForm({ nota, onClose }: { nota: NotaVenta; onClose: () => void }) {
  const anular = useAnularNota()
  const [motivo, setMotivo] = useState('')
  const valido = motivo.trim().length >= 5

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!valido) return
    anular.mutate({ p_id: nota.id, p_motivo: motivo.trim() }, { onSuccess: onClose })
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <p className="text-sm text-slate-300">
        La nota de <strong>{formatearPrecio(nota.valor)}</strong> deja de contar en el saldo y su comprobante contable se
        reversa. Queda en el historial como anulada.
      </p>
      <FormField label="Motivo *">
        <textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={2} maxLength={300} className="input" autoFocus />
      </FormField>
      {anular.error && (
        <p role="alert" className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">
          {mensajeError(anular.error)}
        </p>
      )}
      <div className="flex justify-end gap-3">
        <button type="button" onClick={onClose} className="btn btn-secondary">
          Cancelar
        </button>
        <button type="submit" disabled={anular.isPending || !valido} className="btn btn-danger">
          {anular.isPending && <Loader2 className="size-4 animate-spin" />}
          Anular nota
        </button>
      </div>
    </form>
  )
}
