import { ArrowLeft, Loader2, PackageSearch, Plus, Save, Trash2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Combobox } from '@/components/ui/Combobox'
import { FormField } from '@/components/ui/FormField'
import { LoadingBlock } from '@/components/ui/LoadingBlock'
import { useProductos, type Producto } from '@/features/productos/api'
import { StockBadge } from '@/features/productos/components/badges'
import { useProveedores, type Proveedor } from '@/features/proveedores/api'
import { mensajeError } from '@/lib/errores'
import { formatearPrecio } from '@/lib/format'
import { formatearOrden, useGuardarOrden, useOrden, type OrdenDetalle } from './api'

interface LineaOrden {
  producto: Pick<Producto, 'id' | 'sku' | 'nombre'>
  cantidad: number
  costo: number
}

const buscarProducto = (p: Producto, t: string) =>
  [p.sku, p.nombre, p.marca, p.modelo, p.codigo_barras].some((v) => v?.toLowerCase().includes(t))
const buscarProveedor = (p: Proveedor, t: string) =>
  [p.nombre, p.nit, p.contacto].some((v) => v?.toLowerCase().includes(t))

/** Cantidad sugerida para reponer: hasta el doble del stock mínimo */
const sugerirCantidad = (p: Pick<Producto, 'stock' | 'stock_minimo'>) =>
  Math.max(p.stock_minimo * 2 - Math.max(p.stock, 0), 1)

/** /compras/nueva y /compras/:id/editar */
export function OrdenFormPage() {
  const { id = '' } = useParams()
  const orden = useOrden(id)
  if (id && orden.isLoading) return <LoadingBlock />
  if (id && !orden.data) {
    return (
      <p className="p-10 text-center text-slate-400">
        {orden.error ? mensajeError(orden.error) : 'La orden no existe.'}
      </p>
    )
  }
  return <Formulario key={id} orden={orden.data ?? null} />
}

function Formulario({ orden }: { orden: OrdenDetalle | null }) {
  const navigate = useNavigate()
  const guardar = useGuardarOrden()
  const { data: productos = [] } = useProductos()
  const { data: proveedores = [] } = useProveedores()

  const [proveedorId, setProveedorId] = useState(orden?.proveedor_id ?? '')
  const [fechaEsperada, setFechaEsperada] = useState(orden?.fecha_esperada ?? '')
  const [notas, setNotas] = useState(orden?.notas ?? '')
  const [lineas, setLineas] = useState<LineaOrden[]>(
    orden?.items.map((i) => ({ producto: i.producto, cantidad: i.cantidad, costo: i.costo_unitario })) ?? [],
  )
  const [intento, setIntento] = useState(false)

  const enUso = new Set(lineas.map((l) => l.producto.id))
  const disponibles = productos.filter((p) => p.activo && !enUso.has(p.id))
  const porReponer = disponibles.filter((p) => p.stock <= p.stock_minimo)
  const proveedoresActivos = proveedores.filter((p) => p.activo)

  const agregar = (p: Producto, cantidad = 1) =>
    setLineas((ls) => [...ls, { producto: p, cantidad, costo: p.precio_costo }])
  const cambiar = (id: string, cambios: Partial<LineaOrden>) =>
    setLineas((ls) => ls.map((l) => (l.producto.id === id ? { ...l, ...cambios } : l)))

  const errores: string[] = []
  if (!proveedorId) errores.push('Elige el proveedor.')
  if (lineas.length === 0) errores.push('Agrega al menos un producto.')
  if (lineas.some((l) => !Number.isInteger(l.cantidad) || l.cantidad <= 0))
    errores.push('Las cantidades deben ser enteros mayores que cero.')
  if (lineas.some((l) => !Number.isFinite(l.costo) || l.costo < 0))
    errores.push('Revisa los costos: no pueden estar vacíos ni ser negativos.')

  const total = lineas.reduce((s, l) => s + (l.cantidad || 0) * (l.costo || 0), 0)

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    setIntento(true)
    if (errores.length) return
    guardar.mutate(
      {
        p_id: orden?.id ?? null,
        p_proveedor_id: proveedorId,
        p_fecha_esperada: fechaEsperada || null,
        p_notas: notas,
        p_items: lineas.map((l) => ({ producto_id: l.producto.id, cantidad: l.cantidad, costo_unitario: l.costo })),
      },
      { onSuccess: (nuevoId) => navigate(`/compras/${nuevoId}`, { replace: true }) },
    )
  }

  return (
    <>
      <Link
        to={orden ? `/compras/${orden.id}` : '/compras'}
        className="mb-4 inline-flex items-center gap-1 text-sm text-slate-400 hover:text-slate-200"
      >
        <ArrowLeft className="size-4" />
        {orden ? formatearOrden(orden) : 'Órdenes de compra'}
      </Link>
      <h1 className="mb-6 text-2xl font-bold">{orden ? `Editar ${formatearOrden(orden)}` : 'Nueva orden de compra'}</h1>

      <form onSubmit={onSubmit} noValidate className="space-y-6">
        <section className="grid gap-4 rounded-2xl border border-brand-border bg-brand-card p-6 md:grid-cols-2">
          <FormField label="Proveedor *">
            <Combobox
              items={proveedoresActivos}
              getKey={(p) => p.id}
              getLabel={(p) => p.nombre}
              matches={buscarProveedor}
              value={proveedoresActivos.find((p) => p.id === proveedorId) ?? null}
              onChange={(p) => setProveedorId(p?.id ?? '')}
              placeholder="Buscar proveedor…"
              emptyText="No hay proveedores que coincidan"
            />
          </FormField>
          <FormField label="Llegada esperada">
            <input
              type="date"
              value={fechaEsperada}
              onChange={(e) => setFechaEsperada(e.target.value)}
              className="input"
            />
          </FormField>
          <FormField label="Notas" className="md:col-span-2" hint="Condiciones, forma de pago, contacto…">
            <textarea
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              rows={2}
              maxLength={1000}
              className="input"
            />
          </FormField>
        </section>

        <section className="rounded-2xl border border-brand-border bg-brand-card p-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-semibold">Productos</h2>
            {porReponer.length > 0 && (
              <button
                type="button"
                onClick={() => porReponer.forEach((p) => agregar(p, sugerirCantidad(p)))}
                className="btn btn-secondary"
                title="Agrega los productos en o por debajo del stock mínimo, con una cantidad para llegar al doble del mínimo"
              >
                <PackageSearch className="size-4" />
                Agregar los {porReponer.length} por reponer
              </button>
            )}
          </div>

          <Combobox
            items={disponibles}
            getKey={(p) => p.id}
            getLabel={(p) => p.nombre}
            matches={buscarProducto}
            renderItem={(p) => (
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate">{p.nombre}</div>
                  <div className="font-mono text-xs text-slate-500">{p.sku}</div>
                </div>
                <StockBadge stock={p.stock} minimo={p.stock_minimo} />
              </div>
            )}
            onChange={(p) => p && agregar(p)}
            clearOnSelect
            placeholder="Agregar producto: busca por nombre o SKU…"
            emptyText="Ningún producto coincide"
          />

          {lineas.length === 0 ? (
            <p className="mt-4 rounded-xl border border-dashed border-brand-border p-8 text-center text-sm text-slate-500">
              Aún no has agregado productos.
            </p>
          ) : (
            <ul className="mt-4 divide-y divide-brand-border rounded-xl border border-brand-border">
              {lineas.map((l) => (
                <li key={l.producto.id} className="flex flex-wrap items-end gap-3 p-3">
                  <div className="min-w-0 flex-1 basis-full sm:basis-auto">
                    <p className="truncate text-sm font-medium">{l.producto.nombre}</p>
                    <p className="font-mono text-xs text-slate-500">{l.producto.sku}</p>
                  </div>
                  <label className="text-xs text-slate-400">
                    Cantidad
                    <input
                      type="number"
                      min={1}
                      step={1}
                      inputMode="numeric"
                      value={Number.isFinite(l.cantidad) ? l.cantidad : ''}
                      onChange={(e) => cambiar(l.producto.id, { cantidad: e.target.valueAsNumber })}
                      className="input mt-1 w-24"
                    />
                  </label>
                  <label className="text-xs text-slate-400">
                    Costo unitario
                    <input
                      type="number"
                      min={0}
                      step="any"
                      inputMode="decimal"
                      value={Number.isFinite(l.costo) ? l.costo : ''}
                      onChange={(e) => cambiar(l.producto.id, { costo: e.target.valueAsNumber })}
                      className="input mt-1 w-36"
                    />
                  </label>
                  <p className="w-28 pb-2.5 text-right text-sm whitespace-nowrap text-slate-300">
                    {formatearPrecio((l.cantidad || 0) * (l.costo || 0))}
                  </p>
                  <button
                    type="button"
                    onClick={() => setLineas((ls) => ls.filter((x) => x.producto.id !== l.producto.id))}
                    className="mb-1 rounded-lg p-2 text-slate-400 hover:bg-tinte/5 hover:text-red-400"
                    aria-label={`Quitar ${l.producto.nombre}`}
                  >
                    <Trash2 className="size-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {intento && errores.length > 0 && (
          <ul role="alert" className="space-y-1 rounded-lg bg-red-500/10 px-4 py-3 text-sm text-red-400">
            {errores.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        )}
        {guardar.error && (
          <p role="alert" className="rounded-lg bg-red-500/10 px-4 py-3 text-sm text-red-400">
            {mensajeError(guardar.error)}
          </p>
        )}

        <div className="sticky bottom-0 z-20 -mx-4 flex flex-wrap items-center justify-between gap-4 border-t border-brand-border bg-brand-bg/95 px-4 py-4 backdrop-blur lg:-mx-8 lg:px-8">
          <div className="text-sm">
            <span className="block text-xs text-slate-400">Total de la orden</span>
            <span className="text-lg font-semibold">{formatearPrecio(total)}</span>
          </div>
          <div className="flex gap-3">
            <Link to={orden ? `/compras/${orden.id}` : '/compras'} className="btn btn-secondary">
              Cancelar
            </Link>
            <button type="submit" disabled={guardar.isPending} className="btn btn-primary">
              {guardar.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : orden ? (
                <Save className="size-4" />
              ) : (
                <Plus className="size-4" />
              )}
              {orden ? 'Guardar cambios' : 'Crear orden'}
            </button>
          </div>
        </div>
      </form>
    </>
  )
}
