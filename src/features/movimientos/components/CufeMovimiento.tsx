import { Loader2, Pencil } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Dato } from '@/components/ui/Dato'
import { FormField } from '@/components/ui/FormField'
import { Modal } from '@/components/ui/Modal'
import { usePermisos } from '@/features/auth/permisos'
import { mensajeError } from '@/lib/errores'
import { useDefinirCufe } from '../api'

/**
 * CUFE de la factura electrónica de una venta (o CUDE de la factura del proveedor en una entrada). Bodega lo
 * registra una vez; corregirlo es de admin. La base de datos aplica la misma regla.
 */
export function CufeMovimiento({ movimiento }: { movimiento: { id: string; tipo: string; cufe: string | null } }) {
  const { puedeOperar, esAdmin } = usePermisos()
  const [editando, setEditando] = useState(false)
  const puedeEditar = puedeOperar && (!movimiento.cufe || esAdmin)
  const etiqueta = movimiento.tipo === 'salida' ? 'CUFE' : 'CUFE de la factura del proveedor'

  if (!movimiento.cufe && !puedeEditar) return null

  return (
    <Dato label={etiqueta} className="sm:col-span-2">
      <span className="flex items-start gap-2">
        {movimiento.cufe ? (
          <span className="font-mono text-xs break-all text-slate-300">{movimiento.cufe}</span>
        ) : (
          <span className="text-slate-500">Sin registrar</span>
        )}
        {puedeEditar && (
          <button
            onClick={() => setEditando(true)}
            className="shrink-0 rounded-lg p-1 text-slate-400 hover:bg-tinte/5 hover:text-slate-200 print:hidden"
            aria-label={`${movimiento.cufe ? 'Corregir' : 'Registrar'} ${etiqueta}`}
          >
            <Pencil className="size-3.5" />
          </button>
        )}
      </span>
      <Modal open={editando} onClose={() => setEditando(false)} title={etiqueta}>
        {editando && <Formulario movimiento={movimiento} onClose={() => setEditando(false)} />}
      </Modal>
    </Dato>
  )
}

function Formulario({ movimiento, onClose }: { movimiento: { id: string; cufe: string | null }; onClose: () => void }) {
  const definir = useDefinirCufe()
  const [cufe, setCufe] = useState(movimiento.cufe ?? '')
  const [intento, setIntento] = useState(false)
  const limpio = cufe.trim()
  const error = limpio && !/^[0-9a-fA-F]{96}$/.test(limpio) ? `Tiene 96 caracteres (lleva ${limpio.length}).` : undefined

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    setIntento(true)
    if (error) return
    definir.mutate({ p_movimiento_id: movimiento.id, p_cufe: limpio || null }, { onSuccess: onClose })
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      <FormField
        label="Código único de la factura electrónica"
        error={intento ? error : undefined}
        hint="Cópialo de la factura emitida: 96 caracteres, números y letras de la a a la f"
      >
        <textarea
          value={cufe}
          onChange={(e) => setCufe(e.target.value.replace(/\s/g, ''))}
          rows={3}
          maxLength={96}
          className="input font-mono text-xs"
          autoFocus
        />
      </FormField>
      {definir.error && (
        <p role="alert" className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">
          {mensajeError(definir.error)}
        </p>
      )}
      <div className="flex justify-end gap-3">
        <button type="button" onClick={onClose} className="btn btn-secondary">
          Cancelar
        </button>
        <button type="submit" disabled={definir.isPending} className="btn btn-primary">
          {definir.isPending && <Loader2 className="size-4 animate-spin" />}
          Guardar
        </button>
      </div>
    </form>
  )
}
