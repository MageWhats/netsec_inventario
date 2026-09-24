import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2 } from 'lucide-react'
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { FormField } from '@/components/ui/FormField'
import { Modal } from '@/components/ui/Modal'
import { mensajeError } from '@/lib/errores'
import { useGuardarCliente, type Cliente } from '../api'
import {
  clienteAFormulario,
  clienteSchema,
  clienteVacio,
  formularioACliente,
  TIPOS_DOCUMENTO,
  type ClienteForm,
} from '../schema'

interface ClienteFormModalProps {
  open: boolean
  onClose: () => void
  cliente?: Cliente | null
  onSaved?: (id: string) => void
}

export function ClienteFormModal({ open, onClose, cliente, onSaved }: ClienteFormModalProps) {
  const { mutateAsync: guardar, error: errorGuardar, reset: limpiarError } = useGuardarCliente()
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ClienteForm>({ resolver: zodResolver(clienteSchema), defaultValues: clienteVacio })

  useEffect(() => {
    if (!open) return
    reset(cliente ? clienteAFormulario(cliente) : clienteVacio)
    limpiarError()
  }, [open, cliente, reset, limpiarError])

  async function onSubmit(valores: ClienteForm) {
    try {
      const id = await guardar({ id: cliente?.id, valores: formularioACliente(valores) })
      onSaved?.(id)
      onClose()
    } catch {
      // El error queda en errorGuardar y se muestra en el formulario
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={cliente ? 'Editar cliente' : 'Nuevo cliente'} size="max-w-2xl">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
        <div className="grid gap-4 sm:grid-cols-[14rem_1fr]">
          <FormField label="Tipo de documento" error={errors.tipo_documento?.message}>
            <select className="input" {...register('tipo_documento')}>
              {TIPOS_DOCUMENTO.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Número de documento *" error={errors.documento?.message} hint="NIT con dígito de verificación: 900123456-7">
            <input className="input" autoFocus {...register('documento')} />
          </FormField>
        </div>

        <FormField label="Nombre o razón social *" error={errors.nombre?.message}>
          <input className="input" {...register('nombre')} />
        </FormField>

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Teléfono" error={errors.telefono?.message}>
            <input className="input" type="tel" {...register('telefono')} />
          </FormField>
          <FormField label="Email" error={errors.email?.message}>
            <input className="input" type="email" {...register('email')} />
          </FormField>
          <FormField label="Dirección" error={errors.direccion?.message}>
            <input className="input" {...register('direccion')} />
          </FormField>
          <FormField label="Ciudad" error={errors.ciudad?.message}>
            <input className="input" {...register('ciudad')} />
          </FormField>
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
            {cliente ? 'Guardar cambios' : 'Crear cliente'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
