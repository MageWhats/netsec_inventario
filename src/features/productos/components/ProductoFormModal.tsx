import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2, X } from 'lucide-react'
import { useEffect, useState, type KeyboardEvent } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { BotonEscanear } from '@/components/ui/Escaner'
import { FormField } from '@/components/ui/FormField'
import { Modal } from '@/components/ui/Modal'
import {
  useCategorias,
  useCrearFamilia,
  useGuardarColor,
  useGuardarProducto,
  useTieneMovimientos,
  type Producto,
} from '../api'
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
  const crearFamilia = useCrearFamilia()
  const guardarColor = useGuardarColor()
  /** Editando un color: los datos comunes se guardan en su producto con colores */
  const esColor = Boolean(producto?.familia)
  const [conColores, setConColores] = useState(false)
  const [colores, setColores] = useState<string[]>([])
  const [errorColores, setErrorColores] = useState<string | null>(null)
  const error = errorGuardar ?? crearFamilia.error ?? guardarColor.error

  // Cada vez que se abre, los colores empiezan de cero
  const [abiertoAntes, setAbiertoAntes] = useState(open)
  if (open !== abiertoAntes) {
    setAbiertoAntes(open)
    if (open) {
      setConColores(false)
      setColores([])
      setErrorColores(null)
    }
  }

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    control,
    formState: { errors, isSubmitting },
  } = useForm<ProductoForm>({ resolver: zodResolver(productoSchema), defaultValues: productoVacio })

  useEffect(() => {
    if (!open) return
    const inicial = producto ? productoAFormulario(producto) : productoVacio
    // Un color se edita con el nombre de su producto con colores ("Reloj X", no "Reloj X · Negro")
    reset(producto?.familia ? { ...inicial, nombre: producto.familia.nombre } : inicial)
    limpiarError()
    crearFamilia.reset()
    guardarColor.reset()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset de las mutaciones: solo al abrir
  }, [open, producto, reset, limpiarError])

  // Vista previa del SKU: lo asigna la base de datos al guardar con el consecutivo de la categoría
  const categoriaId = useWatch({ control, name: 'categoria_id' })
  const categoria = categorias.find((c) => c.id === categoriaId)
  const skuMostrado = producto
    ? producto.sku
    : categoria
      ? `NS-${categoria.prefijo}-${String(categoria.ultimo_sku + 1).padStart(4, '0')}${conColores ? '-…' : ''}`
      : 'Elige una categoría'

  async function onSubmit(valores: ProductoForm) {
    const datos = formularioAProducto(valores)
    const comunes = {
      nombre: datos.nombre,
      categoria_id: datos.categoria_id ?? null,
      marca: datos.marca ?? null,
      modelo: datos.modelo ?? null,
      descripcion: datos.descripcion ?? null,
      es_serializado: datos.es_serializado ?? false,
      precio_venta: datos.precio_venta ?? 0,
    }
    try {
      let id: string
      if (!editando && conColores) {
        if (colores.length === 0) {
          setErrorColores('Agrega al menos un color.')
          return
        }
        id = await crearFamilia.mutateAsync({
          familia: comunes,
          colores,
          costoInicial: datos.precio_costo ?? 0,
          stockMinimo: datos.stock_minimo ?? 0,
        })
      } else if (producto?.familia) {
        id = await guardarColor.mutateAsync({
          id: producto.id,
          familiaId: producto.familia.id,
          comunes,
          propios: { codigo_barras: datos.codigo_barras, stock_minimo: datos.stock_minimo },
        })
      } else {
        id = await guardar({ id: producto?.id, valores: datos })
      }
      onSaved?.(id)
      onClose()
    } catch {
      // El error queda en la mutación y se muestra en el formulario
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={esColor ? `Editar ${producto?.nombre}` : editando ? 'Editar producto' : 'Nuevo producto'}
      size="max-w-2xl"
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
        {esColor && (
          <p className="rounded-lg bg-brand-accent/10 px-3 py-2 text-sm text-slate-300">
            Nombre, categoría, marca, modelo, descripción, precio de venta y control por serial se aplican a{' '}
            <strong>todos los colores</strong> de {producto?.familia?.nombre}. Código de barras y stock mínimo son solo
            de este color ({producto?.color}).
          </p>
        )}

        {!editando && (
          <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-brand-border p-4">
            <input
              type="checkbox"
              checked={conColores}
              onChange={(e) => setConColores(e.target.checked)}
              className="mt-0.5 size-4 accent-brand-accent"
            />
            <span className="text-sm">
              <span className="font-medium">Viene en varios colores</span>
              <span className="mt-0.5 block text-slate-400">
                Se crea un producto por color, con su propio stock y SKU. El precio y los demás datos son los mismos.
              </span>
            </span>
          </label>
        )}

        {conColores && (
          <ColoresInput
            colores={colores}
            onChange={(c) => {
              setColores(c)
              setErrorColores(null)
            }}
            error={errorColores}
          />
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Categoría *" error={errors.categoria_id?.message}>
            <select className="input" autoFocus={!editando} {...register('categoria_id')}>
              <option value="" disabled>
                Elige una categoría…
              </option>
              {categorias.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
          </FormField>
          <FormField
            label="SKU"
            hint={
              editando
                ? 'Se generó al crearlo y no cambia, aunque cambies la categoría'
                : conColores
                  ? 'Se asigna al guardar; cada color le agrega su código (-NEG, -AZU…)'
                  : 'Se asigna al guardar, según la categoría'
            }
          >
            <input className="input cursor-not-allowed font-mono opacity-70" readOnly tabIndex={-1} value={skuMostrado} />
          </FormField>

          <FormField
            label="Nombre *"
            error={errors.nombre?.message}
            className="sm:col-span-2"
            hint={conColores || esColor ? 'Sin el color: la app lo agrega, p. ej. "Reloj X · Negro"' : undefined}
          >
            <input className="input" {...register('nombre')} />
          </FormField>

          <FormField label="Marca" error={errors.marca?.message}>
            <input className="input" {...register('marca')} />
          </FormField>
          <FormField label="Modelo" error={errors.modelo?.message}>
            <input className="input" {...register('modelo')} />
          </FormField>

          {!conColores && (
            <FormField label="Código de barras" error={errors.codigo_barras?.message} className="sm:col-span-2">
              <div className="flex gap-2">
                <input className="input" inputMode="numeric" {...register('codigo_barras')} />
                <BotonEscanear
                  titulo="Escanear código de barras"
                  onDetectado={(codigo) => {
                    setValue('codigo_barras', codigo, { shouldDirty: true, shouldValidate: true })
                    return { ok: true }
                  }}
                />
              </div>
            </FormField>
          )}

          <FormField label="Descripción" error={errors.descripcion?.message} className="sm:col-span-2">
            <textarea className="input min-h-20" rows={3} {...register('descripcion')} />
          </FormField>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <FormField
            label={editando ? 'Costo promedio' : 'Costo inicial'}
            error={errors.precio_costo?.message}
            hint={
              editando
                ? 'Se calcula solo con cada entrada'
                : 'Referencia hasta la primera compra; después se promedia solo'
            }
          >
            <input
              type="number"
              min={0}
              step="any"
              readOnly={editando}
              className={`input ${editando ? 'cursor-not-allowed opacity-60' : ''}`}
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
            {editando ? 'Guardar cambios' : conColores ? `Crear ${colores.length || ''} colores` : 'Crear producto'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

/** Lista de colores: se escribe uno y se agrega con Enter o con el botón */
function ColoresInput({
  colores,
  onChange,
  error,
}: {
  colores: string[]
  onChange: (colores: string[]) => void
  error: string | null
}) {
  const [texto, setTexto] = useState('')
  const [aviso, setAviso] = useState<string | null>(null)

  function agregar() {
    const color = texto.trim().replace(/\s+/g, ' ')
    if (!color) return
    const nombre = color.charAt(0).toUpperCase() + color.slice(1)
    if (colores.some((c) => c.toLowerCase() === nombre.toLowerCase())) {
      setAviso(`${nombre} ya está en la lista.`)
      return
    }
    onChange([...colores, nombre])
    setTexto('')
    setAviso(null)
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault()
      agregar()
    }
  }

  return (
    <FormField label="Colores *" error={error ?? aviso ?? undefined} hint="Escribe un color y pulsa Enter">
      <div className="flex gap-2">
        <input
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={onKeyDown}
          maxLength={25}
          placeholder="Negro, Rojo, Azul…"
          className="input"
        />
        <button type="button" onClick={agregar} className="btn btn-secondary">
          Agregar
        </button>
      </div>
      {colores.length > 0 && (
        <span className="mt-2 flex flex-wrap gap-2">
          {colores.map((c) => (
            <span key={c} className="inline-flex items-center gap-1 rounded-full bg-brand-accent/15 px-3 py-1 text-sm">
              {c}
              <button
                type="button"
                onClick={() => onChange(colores.filter((x) => x !== c))}
                aria-label={`Quitar ${c}`}
                className="text-slate-400 hover:text-slate-100"
              >
                <X className="size-3.5" />
              </button>
            </span>
          ))}
        </span>
      )}
    </FormField>
  )
}
