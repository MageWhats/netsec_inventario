import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2 } from 'lucide-react'
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { FormField } from '@/components/ui/FormField'
import { Modal } from '@/components/ui/Modal'
import { useCategorias, useGuardarProducto, useTieneMovimientos, type Producto } from '../api'
import { mensajeError } from '@/lib/errores'
import {
  formularioAProducto,
  productoAFormulario,
  productoSchema,
  productoVacio,
  type ProductoForm,
} from '../schema'

interface ProductoFormModalProps {
  open: boolean
  onClose: () => void
  /** Si se pasa, el formulario edita ese producto; si no, crea uno nuevo */
  producto?: Producto | null
  onSaved?: (id: string) => void
}

export function ProductoFormModal({ open, onClose, producto, onSaved }: ProductoFormModalProps) {
  const editando = Boolean(producto)
  const { data: categorias = [] } = useCategorias()
  const { data: tieneMovimientos = false } = useTieneMovimientos(producto?.id)
  const { mutateAsync: guardar, error: errorGuardar, reset: limpiarError } = useGuardarProducto()

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ProductoForm>({ resolver: zodResolver(productoSchema), defaultValues: productoVacio })

  useEffect(() => {
    if (!open) return
    reset(producto ? productoAFormulario(producto) : productoVacio)
    limpiarError()
  }, [open, producto, reset, limpiarError])

  async function onSubmit(valores: ProductoForm) {
    try {
      const id = await guardar({ id: producto?.id, valores: formularioAProducto(valores) })
      onSaved?.(id)
      onClose()
    } catch {
      // El error queda en errorGuardar y se muestra en el formulario
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={editando ? 'Editar producto' : 'Nuevo producto'} size="max-w-2xl">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="SKU *" error={errors.sku?.message} hint="Código interno único, p. ej. SW-TPL-8P">
            <input className="input uppercase" autoFocus {...register('sku')} />
          </FormField>
          <FormField label="Categoría" error={errors.categoria_id?.message}>
            <select className="input" {...register('categoria_id')}>
              <option value="">Sin categoría</option>
              {categorias.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
          </FormField>

          <FormField label="Nombre *" error={errors.nombre?.message} className="sm:col-span-2">
            <input className="input" {...register('nombre')} />
          </FormField>

          <FormField label="Marca" error={errors.marca?.message}>
            <input className="input" {...register('marca')} />
          </FormField>
          <FormField label="Modelo" error={errors.modelo?.message}>
            <input className="input" {...register('modelo')} />
          </FormField>

          <FormField label="Código de barras" error={errors.codigo_barras?.message} className="sm:col-span-2">
            <input className="input" inputMode="numeric" {...register('codigo_barras')} />
          </FormField>

          <FormField label="Descripción" error={errors.descripcion?.message} className="sm:col-span-2">
            <textarea className="input min-h-20" rows={3} {...register('descripcion')} />
          </FormField>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <FormField label="Precio de costo" error={errors.precio_costo?.message}>
            <input
              type="number"
              min={0}
              step="any"
              className="input"
              {...register('precio_costo', { valueAsNumber: true })}
            />
          </FormField>
          <FormField label="Precio de venta" error={errors.precio_venta?.message}>
            <input
              type="number"
              min={0}
              step="any"
              className="input"
              {...register('precio_venta', { valueAsNumber: true })}
            />
          </FormField>
          <FormField
            label="Stock mínimo"
            error={errors.stock_minimo?.message}
            hint="Alerta cuando el stock baje de aquí"
          >
            <input
              type="number"
              min={0}
              step={1}
              className="input"
              {...register('stock_minimo', { valueAsNumber: true })}
            />
          </FormField>
        </div>

        <label
          className={`flex items-start gap-3 rounded-lg border border-brand-border p-4 ${
            tieneMovimientos ? 'opacity-60' : 'cursor-pointer'
          }`}
        >
          {tieneMovimientos ? (
            // Solo lectura: el valor se conserva tal como lo cargó reset()
            <input
              type="checkbox"
              className="mt-0.5 size-4 accent-brand-accent"
              checked={producto?.es_serializado ?? false}
              disabled
              readOnly
            />
          ) : (
            <input type="checkbox" className="mt-0.5 size-4 accent-brand-accent" {...register('es_serializado')} />
          )}
          <span className="text-sm">
            <span className="font-medium">Controlar por número de serie</span>
            <span className="mt-0.5 block text-slate-400">
              {tieneMovimientos
                ? 'No se puede cambiar porque el producto ya tiene movimientos registrados.'
                : 'Cada unidad se registra con su serial (y MAC si aplica). Recomendado para equipos de red y cámaras.'}
            </span>
          </span>
        </label>

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
            {editando ? 'Guardar cambios' : 'Crear producto'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
