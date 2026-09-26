import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2 } from 'lucide-react'
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { FormField } from '@/components/ui/FormField'
import { Modal } from '@/components/ui/Modal'
import { mensajeError } from '@/lib/errores'
import { useGuardarBodega, type BodegaConUso } from '../api'
import { bodegaAFormulario, bodegaSchema, bodegaVacia, formularioABodega, type BodegaForm } from '../schema'

interface BodegaFormModalProps {
  open: boolean
  onClose: () => void
  bodega?: BodegaConUso | null
}

export function BodegaFormModal({ open, onClose, bodega }: BodegaFormModalProps) {
  const { mutateAsync: guardar, error: errorGuardar, reset: limpiarError } = useGuardarBodega()
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<BodegaForm>({ resolver: zodResolver(bodegaSchema), defaultValues: bodegaVacia })

  useEffect(() => {
    if (!open) return
    reset(bodega ? bodegaAFormulario(bodega) : bodegaVacia)
    limpiarError()
  }, [open, bodega, reset, limpiarError])

  async function onSubmit(valores: BodegaForm) {
    try {
      await guardar({ id: bodega?.id, valores: formularioABodega(valores) })
      onClose()
    } catch {
      // El error queda en errorGuardar y se muestra en el formulario
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={bodega ? 'Editar bodega' : 'Nueva bodega'}>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
        <FormField label="Nombre *" error={errors.nombre?.message}>
          <input className="input" autoFocus {...register('nombre')} />
        </FormField>
        <FormField label="Dirección" error={errors.direccion?.message}>
          <input className="input" {...register('direccion')} />
        </FormField>

        {errorGuardar && (
          <p role="alert" className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">
            {mensajeError(errorGuardar)}
          </p>
        )}

        <div className="flex justify-end gap-3">
          <button type="button" onClick={onClose} className="btn btn-secondary">
            Cancelar
          </button>
          <button type="submit" disabled={isSubmitting} className="btn btn-primary">
            {isSubmitting && <Loader2 className="size-4 animate-spin" />}
            {bodega ? 'Guardar cambios' : 'Crear bodega'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
