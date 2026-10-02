import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2 } from 'lucide-react'
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { FormField } from '@/components/ui/FormField'
import { Modal } from '@/components/ui/Modal'
import { mensajeError } from '@/lib/errores'
import { useGuardarProveedor, type Proveedor } from '../api'
import {
  formularioAProveedor,
  proveedorAFormulario,
  proveedorSchema,
  proveedorVacio,
  type ProveedorForm,
} from '../schema'

interface ProveedorFormModalProps {
  open: boolean
  onClose: () => void
  proveedor?: Proveedor | null
  onSaved?: (id: string) => void
}

export function ProveedorFormModal({ open, onClose, proveedor, onSaved }: ProveedorFormModalProps) {
  const { mutateAsync: guardar, error: errorGuardar, reset: limpiarError } = useGuardarProveedor()
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ProveedorForm>({ resolver: zodResolver(proveedorSchema), defaultValues: proveedorVacio })

  useEffect(() => {
    if (!open) return
    reset(proveedor ? proveedorAFormulario(proveedor) : proveedorVacio)
    limpiarError()
  }, [open, proveedor, reset, limpiarError])

  async function onSubmit(valores: ProveedorForm) {
    try {
      const id = await guardar({ id: proveedor?.id, valores: formularioAProveedor(valores) })
      onSaved?.(id)
      onClose()
    } catch {
      // El error queda en errorGuardar y se muestra en el formulario
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={proveedor ? 'Editar proveedor' : 'Nuevo proveedor'} size="max-w-2xl">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
        <div className="grid gap-4 sm:grid-cols-[1fr_14rem]">
          <FormField label="Nombre o razón social *" error={errors.nombre?.message}>
            <input className="input" autoFocus {...register('nombre')} />
          </FormField>
          <FormField label="NIT" error={errors.nit?.message} hint="Con dígito de verificación: 900123456-7">
            <input className="input" {...register('nit')} />
          </FormField>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Persona de contacto" error={errors.contacto?.message}>
            <input className="input" {...register('contacto')} />
          </FormField>
          <FormField label="Teléfono" error={errors.telefono?.message}>
            <input className="input" type="tel" {...register('telefono')} />
          </FormField>
          <FormField label="Email" error={errors.email?.message}>
            <input className="input" type="email" {...register('email')} />
          </FormField>
          <FormField label="Dirección" error={errors.direccion?.message}>
            <input className="input" {...register('direccion')} />
          </FormField>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Plazo de pago (días)" error={errors.dias_credito?.message}>
            <input className="input" inputMode="numeric" placeholder="30" {...register('dias_credito')} />
          </FormField>
          <label className="flex items-center gap-2 self-center text-sm text-slate-300">
            <input type="checkbox" {...register('responsable_iva')} />
            Responsable de IVA (sus facturas traen IVA)
          </label>
        </div>

        <FormField label="Notas" error={errors.notas?.message}>
          <textarea className="input min-h-20" rows={3} {...register('notas')} />
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
            {proveedor ? 'Guardar cambios' : 'Crear proveedor'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
