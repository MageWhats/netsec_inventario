import { Loader2, Plus } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { FormField } from '@/components/ui/FormField'
import { Modal } from '@/components/ui/Modal'
import { mensajeError } from '@/lib/errores'
import { useAgregarColor, useProductos, type Producto } from '../api'
import { StockBadge } from './badges'

/** Colores del mismo producto: stock de cada uno y opción de agregar otro */
export function ColoresSection({ producto }: { producto: Producto }) {
  const { data: productos = [] } = useProductos()
  const [agregando, setAgregando] = useState(false)
  const familia = producto.familia
  if (!familia) return null

  const colores = productos.filter((p) => p.familia_id === familia.id)
  const total = colores.reduce((s, p) => s + p.stock, 0)

  return (
    <section className="mb-6 rounded-2xl border border-brand-border bg-brand-card p-6">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold">Colores de {familia.nombre}</h2>
          <p className="mt-1 text-sm text-slate-400">
            {colores.length} {colores.length === 1 ? 'color' : 'colores'} · {total} unidades en total
          </p>
        </div>
        <button onClick={() => setAgregando(true)} className="btn btn-secondary">
          <Plus className="size-4" />
          Agregar color
        </button>
      </div>

      <ul className="flex flex-wrap gap-2">
        {colores.map((c) => (
          <li key={c.id}>
            <Link
              to={`/productos/${c.id}`}
              className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-sm transition ${
                c.id === producto.id
                  ? 'border-brand-accent bg-brand-accent/10'
                  : 'border-brand-border hover:border-slate-500'
              } ${c.activo ? '' : 'opacity-50'}`}
            >
              <span className="font-medium">{c.color}</span>
              <StockBadge stock={c.stock} minimo={c.stock_minimo} />
            </Link>
          </li>
        ))}
      </ul>

      <AgregarColorModal open={agregando} onClose={() => setAgregando(false)} producto={producto} />
    </section>
  )
}

function AgregarColorModal({ open, onClose, producto }: { open: boolean; onClose: () => void; producto: Producto }) {
  const navigate = useNavigate()
  const agregar = useAgregarColor()
  const [color, setColor] = useState('')
  const [costo, setCosto] = useState(producto.precio_costo)
  const [minimo, setMinimo] = useState(producto.stock_minimo)
  const [intento, setIntento] = useState(false)

  // Cada vez que se abre, el formulario empieza de cero con los valores de este color como referencia
  const [abiertoAntes, setAbiertoAntes] = useState(open)
  if (open !== abiertoAntes) {
    setAbiertoAntes(open)
    if (open) {
      setColor('')
      setCosto(producto.precio_costo)
      setMinimo(producto.stock_minimo)
      setIntento(false)
    }
  }

  function cerrar() {
    agregar.reset()
    onClose()
  }

  const nombre = color.trim().replace(/\s+/g, ' ')
  const errorColor = intento && !nombre ? 'Escribe el color.' : undefined

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    setIntento(true)
    if (!nombre || !producto.familia) return
    agregar.mutate(
      {
        familiaId: producto.familia.id,
        color: nombre.charAt(0).toUpperCase() + nombre.slice(1),
        costoInicial: Number.isFinite(costo) ? costo : 0,
        stockMinimo: Number.isFinite(minimo) ? minimo : 0,
      },
      {
        onSuccess: (id) => {
          cerrar()
          navigate(`/productos/${id}`)
        },
      },
    )
  }

  return (
    <Modal open={open} onClose={cerrar} title={`Nuevo color de ${producto.familia?.nombre}`}>
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <FormField label="Color *" error={errorColor} hint="El SKU se crea solo, p. ej. REL-X-VER">
          <input
            value={color}
            onChange={(e) => setColor(e.target.value)}
            maxLength={25}
            placeholder="Verde"
            className="input"
            autoFocus
          />
        </FormField>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Costo inicial" hint="Referencia hasta la primera compra">
            <input
              type="number"
              min={0}
              step="any"
              value={Number.isFinite(costo) ? costo : ''}
              onChange={(e) => setCosto(e.target.valueAsNumber)}
              className="input"
            />
          </FormField>
          <FormField label="Stock mínimo">
            <input
              type="number"
              min={0}
              step={1}
              value={Number.isFinite(minimo) ? minimo : ''}
              onChange={(e) => setMinimo(e.target.valueAsNumber)}
              className="input"
            />
          </FormField>
        </div>
        <p className="text-xs text-slate-500">
          Nombre, categoría, marca, descripción y precio de venta se toman de {producto.familia?.nombre}.
        </p>

        {agregar.error && (
          <p role="alert" className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">
            {mensajeError(agregar.error)}
          </p>
        )}

        <div className="flex justify-end gap-3">
          <button type="button" onClick={cerrar} className="btn btn-secondary">
            Cancelar
          </button>
          <button type="submit" disabled={agregar.isPending} className="btn btn-primary">
            {agregar.isPending && <Loader2 className="size-4 animate-spin" />}
            Agregar color
          </button>
        </div>
      </form>
    </Modal>
  )
}
