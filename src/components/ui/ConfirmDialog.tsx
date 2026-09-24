import { Loader2 } from 'lucide-react'
import type { ReactNode } from 'react'
import { Modal } from './Modal'

interface ConfirmDialogProps {
  open: boolean
  title: string
  children: ReactNode
  confirmLabel: string
  danger?: boolean
  pending?: boolean
  error?: string | null
  onConfirm: () => void
  onClose: () => void
}

export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  danger,
  pending,
  error,
  onConfirm,
  onClose,
}: ConfirmDialogProps) {
  return (
    <Modal open={open} onClose={onClose} title={title}>
      <div className="text-sm text-slate-300">{children}</div>
      {error && (
        <p role="alert" className="mt-3 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">
          {error}
        </p>
      )}
      <div className="mt-6 flex justify-end gap-3">
        <button onClick={onClose} className="btn btn-secondary">
          Cancelar
        </button>
        <button onClick={onConfirm} disabled={pending} className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`}>
          {pending && <Loader2 className="size-4 animate-spin" />}
          {confirmLabel}
        </button>
      </div>
    </Modal>
  )
}
