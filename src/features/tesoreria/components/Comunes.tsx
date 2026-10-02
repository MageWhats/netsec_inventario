import { Loader2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { FormField } from '@/components/ui/FormField'
import { Modal } from '@/components/ui/Modal'
import { mensajeError } from '@/lib/errores'
import { useAnularTesoreria, useCuentasTesoreria, type DocumentoTesoreria } from '../api'

/** Caja o banco activo */
export function SelectorCaja({
  value,
  onChange,
  excluir,
  id,
  vacio = 'Elige la caja o el banco…',
}: {
  value: string
  onChange: (id: string) => void
  excluir?: string
  id?: string
  /** Texto de la opción vacía */
  vacio?: string
}) {
  const { data: cuentas = [] } = useCuentasTesoreria()
  return (
    <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className="input">
      <option value="">{vacio}</option>
      {cuentas
        .filter((c) => c.activa && c.id !== excluir)
        .map((c) => (
          <option key={c.id} value={c.id}>
            {c.nombre}
            {c.banco ? ` · ${c.banco}` : ''}
          </option>
        ))}
    </select>
  )
}

/** Anular un egreso, traslado o anticipo: se registra el comprobante inverso con fecha de hoy */
export function AnularDocumentoModal({
  documento,
  onClose,
}: {
  documento: { tabla: DocumentoTesoreria; id: string; etiqueta: string } | null
  onClose: () => void
}) {
  return (
    <Modal open={documento !== null} onClose={onClose} title={`Anular ${documento?.etiqueta ?? ''}`}>
      {documento && <Formulario key={documento.id} documento={documento} onClose={onClose} />}
    </Modal>
  )
}

function Formulario({
  documento,
  onClose,
}: {
  documento: { tabla: DocumentoTesoreria; id: string }
  onClose: () => void
}) {
  const anular = useAnularTesoreria()
  const [motivo, setMotivo] = useState('')
  const valido = motivo.trim().length >= 5

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!valido) return
    anular.mutate({ p_tabla: documento.tabla, p_id: documento.id, p_motivo: motivo.trim() }, { onSuccess: onClose })
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <p className="text-sm text-slate-400">
        Se registra el comprobante inverso con fecha de hoy y el documento queda marcado como anulado. Nada se borra.
      </p>
      <FormField label="Motivo *" hint="Mínimo 5 caracteres">
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
          Anular
        </button>
      </div>
    </form>
  )
}

export function BadgeAnulado() {
  return <span className="rounded-full bg-red-500/15 px-2 py-0.5 text-xs text-red-400">Anulado</span>
}
