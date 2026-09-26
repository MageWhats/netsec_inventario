import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2 } from 'lucide-react'
import { useEffect } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { FormField } from '@/components/ui/FormField'
import { Modal } from '@/components/ui/Modal'
import { ROLES, type Rol } from '@/features/auth/permisos'
import { mensajeError } from '@/lib/errores'
import { useAccionUsuario, useGuardarUsuario, type Usuario } from '../api'
import { usuarioAFormulario, usuarioSchema, usuarioVacio, type UsuarioForm } from '../schema'

interface UsuarioFormModalProps {
  open: boolean
  onClose: () => void
  /** null = invitar uno nuevo */
  usuario?: Usuario | null
  /** El propio usuario no puede cambiar su rol */
  esUnoMismo?: boolean
}

export function UsuarioFormModal({ open, onClose, usuario, esUnoMismo }: UsuarioFormModalProps) {
  const invitar = useAccionUsuario()
  const guardar = useGuardarUsuario()
  const error = usuario ? guardar.error : invitar.error
  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors, isSubmitting },
  } = useForm<UsuarioForm>({ resolver: zodResolver(usuarioSchema), defaultValues: usuarioVacio })

  const { reset: limpiarInvitar } = invitar
  const { reset: limpiarGuardar } = guardar
  useEffect(() => {
    if (!open) return
    reset(usuario ? usuarioAFormulario(usuario) : usuarioVacio)
    limpiarInvitar()
    limpiarGuardar()
  }, [open, usuario, reset, limpiarInvitar, limpiarGuardar])

  async function onSubmit(valores: UsuarioForm) {
    try {
      if (usuario) {
        await guardar.mutateAsync({ id: usuario.id, valores: { nombre: valores.nombre, rol: valores.rol } })
      } else {
        await invitar.mutateAsync({ accion: 'invitar', ...valores, email: valores.email.toLowerCase() })
      }
      onClose()
    } catch {
      // El error queda en la mutación y se muestra en el formulario
    }
  }

  const rol = useWatch({ control, name: 'rol' })

  return (
    <Modal open={open} onClose={onClose} title={usuario ? 'Editar usuario' : 'Invitar usuario'}>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
        <FormField label="Nombre *" error={errors.nombre?.message}>
          <input className="input" autoFocus {...register('nombre')} />
        </FormField>

        <FormField
          label="Email *"
          error={errors.email?.message}
          hint={usuario ? 'El correo no se puede cambiar' : 'Le llegará un enlace para crear su contraseña'}
        >
          <input className="input" type="email" readOnly={Boolean(usuario)} {...register('email')} />
        </FormField>

        <FormField
          label="Rol *"
          error={errors.rol?.message}
          hint={esUnoMismo ? 'No puedes cambiar tu propio rol' : ROLES[rol]?.descripcion}
        >
          {esUnoMismo ? (
            // Un select deshabilitado no envía su valor: se muestra como texto y se conserva el rol actual
            <input className="input" readOnly value={ROLES[rol]?.label ?? ''} />
          ) : (
            <select className="input" {...register('rol')}>
              {(Object.keys(ROLES) as Rol[]).map((r) => (
                <option key={r} value={r}>
                  {ROLES[r].label}
                </option>
              ))}
            </select>
          )}
        </FormField>

        {error && (
          <p role="alert" className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">
            {mensajeError(error)}
          </p>
        )}

        <div className="flex justify-end gap-3">
          <button type="button" onClick={onClose} className="btn btn-secondary">
            Cancelar
          </button>
          <button type="submit" disabled={isSubmitting} className="btn btn-primary">
            {isSubmitting && <Loader2 className="size-4 animate-spin" />}
            {usuario ? 'Guardar cambios' : 'Enviar invitación'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
