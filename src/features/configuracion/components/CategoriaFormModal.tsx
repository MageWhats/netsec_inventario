import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2 } from 'lucide-react'
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { FormField } from '@/components/ui/FormField'
import { Modal } from '@/components/ui/Modal'
import { mensajeError } from '@/lib/errores'
import { useGuardarCategoria, type CategoriaConUso } from '../api'
import { categoriaAFormulario, categoriaSchema, categoriaVacia, type CategoriaForm } from '../schema'

interface CategoriaFormModalProps {
  open: boolean
  onClose: () => void
  categoria?: CategoriaConUso | null
}

export function CategoriaFormModal({ open, onClose, categoria }: CategoriaFormModalProps) {
  const { mutateAsync: guardar, error: errorGuardar, reset: limpiarError } = useGuardarCategoria()
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CategoriaForm>({ resolver: zodResolver(categoriaSchema), defaultValues: categoriaVacia })

  useEffect(() => {
    if (!open) return
    reset(categoria ? categoriaAFormulario(categoria) : categoriaVacia)
    limpiarError()
  }, [open, categoria, reset, limpiarError])

  async function onSubmit(valores: CategoriaForm) {
    try {
      await guardar({ id: categoria?.id, valores })
      onClose()
    } catch {
      // El error queda en errorGuardar y se muestra en el formulario
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={categoria ? 'Editar categoría' : 'Nueva categoría'}>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
        <FormField
          label="Nombre *"
          error={errors.nombre?.message}
          hint={categoria && categoria.productos > 0 ? `El cambio se verá en sus ${categoria.productos} productos` : undefined}
        >
          <input className="input" autoFocus {...register('nombre')} />
        </FormField>
        <FormField
          label="Prefijo del SKU *"
          error={errors.prefijo?.message}
          hint={
            categoria && categoria.ultimo_sku > 0
              ? 'Solo aplica a los productos nuevos: los que ya existen conservan su SKU'
              : 'Sus productos serán NS-PREFIJO-0001, NS-PREFIJO-0002…'
          }
        >
          <input className="input w-32 font-mono uppercase" maxLength={5} placeholder="SW" {...register('prefijo')} />
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
            {categoria ? 'Guardar cambios' : 'Crear categoría'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
