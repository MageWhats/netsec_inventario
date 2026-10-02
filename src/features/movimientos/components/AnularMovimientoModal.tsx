import { Ban, Loader2, ShieldAlert } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { FormField } from '@/components/ui/FormField'
import { Modal } from '@/components/ui/Modal'
import { PasswordInput } from '@/components/ui/PasswordInput'
import { mensajeError } from '@/lib/errores'
import { useAnularMovimiento, useHayClaveAnulacion } from '../api'
import { formatearNumero, type TipoMovimiento } from '../tipos'

interface AnularMovimientoModalProps {
  open: boolean
  movimiento: {
    id: string
    numero: number
    tipo: TipoMovimiento
    orden_compra_id: string | null
    cotizacion_id: string | null
  }
  onClose: () => void
}

/** Anular una entrada o una venta: pide el motivo y la clave de anulación */
export function AnularMovimientoModal({ open, movimiento, onClose }: AnularMovimientoModalProps) {
  return (
    <Modal open={open} onClose={onClose} title={`Anular ${formatearNumero(movimiento)}`}>
      {/* Se monta al abrir: cada vez empieza sin motivo ni clave escritos */}
      {open && <Formulario movimiento={movimiento} onClose={onClose} />}
    </Modal>
  )
}

function Formulario({ movimiento, onClose }: Omit<AnularMovimientoModalProps, 'open'>) {
  const { data: hayClave, isLoading } = useHayClaveAnulacion()
  const anular = useAnularMovimiento()
  const [motivo, setMotivo] = useState('')
  const [clave, setClave] = useState('')
  const [intento, setIntento] = useState(false)

  const esVenta = movimiento.tipo === 'salida'
  const errorMotivo = motivo.trim().length < 5 ? 'Explica por qué se anula (al menos 5 caracteres).' : undefined
  const errorClave = !clave ? 'Escribe la clave de anulación.' : undefined

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    setIntento(true)
    if (errorMotivo || errorClave) return
    anular.mutate(
      { p_id: movimiento.id, p_motivo: motivo, p_clave: clave },
      {
        onSuccess: onClose,
        // Tras un intento fallido la clave se vuelve a escribir
        onError: () => setClave(''),
      },
    )
  }

  if (isLoading) return <Loader2 className="mx-auto size-5 animate-spin text-slate-500" />

  if (!hayClave) {
    return (
      <div className="space-y-4 text-sm">
        <p className="flex gap-2 rounded-lg bg-amber-500/10 px-4 py-3 text-amber-400">
          <ShieldAlert className="mt-0.5 size-4 shrink-0" />
          Para anular movimientos primero hay que definir la clave de anulación.
        </p>
        <div className="flex justify-end gap-3">
          <button onClick={onClose} className="btn btn-secondary">
            Cerrar
          </button>
          <Link to="/configuracion?s=seguridad" className="btn btn-primary">
            Ir a Configuración → Seguridad
          </Link>
        </div>
      </div>
    )
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      <div className="rounded-lg bg-red-500/10 px-4 py-3 text-sm text-red-300">
        <p className="font-medium text-red-400">Es la última opción: no se puede deshacer.</p>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          {esVenta ? (
            <>
              <li>La mercancía vuelve a la bodega, a las mismas capas de costo (PEPS) de las que salió, y los seriales quedan disponibles.</li>
              <li>La venta deja de contar en reportes, en el dashboard y en la cartera.</li>
              {movimiento.cotizacion_id && <li>La cotización de la que salió vuelve a quedar abierta.</li>}
            </>
          ) : (
            <>
              <li>Sale de la bodega lo que entró, a su mismo costo. Solo se puede si nada de esta entrada ha salido (PEPS).</li>
              <li>Los seriales quedan de baja, con «-ANULADO» en el serial, para poder registrarlos de nuevo.</li>
              {movimiento.orden_compra_id && <li>La orden de compra vuelve a esperar esta mercancía.</li>}
            </>
          )}
          <li>El movimiento queda en el historial marcado como anulado, con el motivo y quién lo anuló.</li>
        </ul>
      </div>

      <FormField label="Motivo *" error={intento ? errorMotivo : undefined}>
        <textarea
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          rows={2}
          maxLength={500}
          placeholder={
            esVenta ? 'P. ej. se registró al cliente equivocado' : 'P. ej. cantidades y costos mal digitados'
          }
          className="input"
          autoFocus
        />
      </FormField>
      <FormField label="Clave de anulación *" error={intento ? errorClave : undefined}>
        <PasswordInput value={clave} onChange={(e) => setClave(e.target.value)} autoComplete="off" className="input" />
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
        <button type="submit" disabled={anular.isPending} className="btn btn-danger">
          {anular.isPending ? <Loader2 className="size-4 animate-spin" /> : <Ban className="size-4" />}
          Anular {esVenta ? 'venta' : 'entrada'}
        </button>
      </div>
    </form>
  )
}
