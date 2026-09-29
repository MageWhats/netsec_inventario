import { ArrowLeft, Loader2, Plus, Save, Trash2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Combobox } from '@/components/ui/Combobox'
import { FormField } from '@/components/ui/FormField'
import { LoadingBlock } from '@/components/ui/LoadingBlock'
import { usePermisos } from '@/features/auth/permisos'
import { ClienteFormModal } from '@/features/clientes/components/ClienteFormModal'
import { useClientes, type Cliente } from '@/features/clientes/api'
import { etiquetaDocumento } from '@/features/clientes/schema'
import { useProductos, type Producto } from '@/features/productos/api'
import { StockBadge } from '@/features/productos/components/badges'
import { mensajeError } from '@/lib/errores'
import { formatearPrecio } from '@/lib/format'
import {
  DIAS_VALIDEZ,
  formatearCotizacion,
  useCotizacion,
  useGuardarCotizacion,
  validezPorDefecto,
  type CotizacionDetalle,
} from './api'

interface LineaCotizacion {
  producto: Pick<Producto, 'id' | 'sku' | 'nombre'> & Partial<Pick<Producto, 'stock' | 'stock_minimo'>>
  cantidad: number
  precio: number
}

const buscarProducto = (p: Producto, t: string) =>
  [p.sku, p.nombre, p.marca, p.modelo, p.codigo_barras].some((v) => v?.toLowerCase().includes(t))
const buscarCliente = (c: Cliente, t: string) =>
  [c.nombre, c.documento, c.telefono].some((v) => v?.toLowerCase().includes(t))

/** /cotizaciones/nueva y /cotizaciones/:id/editar */
export function CotizacionFormPage() {
  const { id = '' } = useParams()
  const cotizacion = useCotizacion(id)
  if (id && cotizacion.isLoading) return <LoadingBlock />
  if (id && !cotizacion.data) {
    return (
      <p className="p-10 text-center text-slate-400">
        {cotizacion.error ? mensajeError(cotizacion.error) : 'La cotización no existe.'}
      </p>
    )
  }
  return <Formulario key={id} cotizacion={cotizacion.data ?? null} />
}

function Formulario({ cotizacion }: { cotizacion: CotizacionDetalle | null }) {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const guardar = useGuardarCotizacion()
  const { esAdmin } = usePermisos()
  const { data: productos = [] } = useProductos()
  const { data: clientes = [] } = useClientes()

  const [registrado, setRegistrado] = useState(!cotizacion || Boolean(cotizacion.cliente_id))
  const [clienteId, setClienteId] = useState(cotizacion?.cliente_id ?? params.get('cliente') ?? '')
  const [nombre, setNombre] = useState(cotizacion && !cotizacion.cliente_id ? cotizacion.cliente_nombre : '')
  const [validaHasta, setValidaHasta] = useState(cotizacion?.valida_hasta ?? validezPorDefecto)
  const [notas, setNotas] = useState(cotizacion?.notas ?? '')
  const [lineas, setLineas] = useState<LineaCotizacion[]>(
    cotizacion?.items.map((i) => ({
      producto: i.producto,
      cantidad: i.cantidad,
      precio: i.precio_unitario,
    })) ?? [],
  )
  const [intento, setIntento] = useState(false)
  const [modalCliente, setModalCliente] = useState(false)

  const enUso = new Set(lineas.map((l) => l.producto.id))
  const disponibles = productos.filter((p) => p.activo && !enUso.has(p.id))
  const clientesActivos = clientes.filter((c) => c.activo)
  const stockDe = new Map(productos.map((p) => [p.id, p]))

  const agregar = (p: Producto) => setLineas((ls) => [...ls, { producto: p, cantidad: 1, precio: p.precio_venta }])
  const cambiar = (id: string, cambios: Partial<LineaCotizacion>) =>
    setLineas((ls) => ls.map((l) => (l.producto.id === id ? { ...l, ...cambios } : l)))

  const errores: string[] = []
  if (registrado && !clienteId) errores.push('Elige el cliente.')
  if (!registrado && !nombre.trim()) errores.push('Escribe el nombre del cliente.')
  if (!validaHasta) errores.push('Indica hasta cuándo es válida.')
  if (lineas.length === 0) errores.push('Agrega al menos un producto.')
  if (lineas.some((l) => !Number.isInteger(l.cantidad) || l.cantidad <= 0))
    errores.push('Las cantidades deben ser enteros mayores que cero.')
  if (lineas.some((l) => !Number.isFinite(l.precio) || l.precio < 0))
    errores.push('Revisa los precios: no pueden estar vacíos ni ser negativos.')

  const total = lineas.reduce((s, l) => s + (l.cantidad || 0) * (l.precio || 0), 0)
  const volver = cotizacion ? `/cotizaciones/${cotizacion.id}` : '/cotizaciones'

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    setIntento(true)
    if (errores.length) return
    guardar.mutate(
      {
        p_id: cotizacion?.id ?? null,
        p_cliente_id: registrado ? clienteId : null,
        p_cliente_nombre: registrado ? null : nombre,
        p_valida_hasta: validaHasta,
        p_notas: notas,
        p_items: lineas.map((l) => ({
          producto_id: l.producto.id,
          cantidad: l.cantidad,
          precio_unitario: l.precio,
        })),
      },
      {
        onSuccess: (nuevoId) => navigate(`/cotizaciones/${nuevoId}`, { replace: true }),
      },
    )
  }

  return (
    <>
      <Link to={volver} className="mb-4 inline-flex items-center gap-1 text-sm text-slate-400 hover:text-slate-200">
        <ArrowLeft className="size-4" />
        {cotizacion ? formatearCotizacion(cotizacion) : 'Cotizaciones'}
      </Link>
      <h1 className="mb-6 text-2xl font-bold">
        {cotizacion ? `Editar ${formatearCotizacion(cotizacion)}` : 'Nueva cotización'}
      </h1>

      <form onSubmit={onSubmit} noValidate className="space-y-6">
        <section className="grid gap-4 rounded-2xl border border-brand-border bg-brand-card p-6 md:grid-cols-2">
          {/* No es un FormField (<label>): tiene botones y un clic en el título los activaría */}
          <div>
            <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm text-slate-300">Cliente *</span>
              <div className="flex gap-1 text-xs">
                {[
                  { valor: true, label: 'Cliente registrado' },
                  { valor: false, label: 'Otro (no registrado)' },
                ].map((o) => (
                  <button
                    key={o.label}
                    type="button"
                    onClick={() => setRegistrado(o.valor)}
                    className={`rounded-full px-2.5 py-1 transition ${
                      registrado === o.valor
                        ? 'bg-brand-accent/15 text-brand-accent'
                        : 'text-slate-400 hover:bg-tinte/5 hover:text-slate-200'
                    }`}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
            {registrado ? (
              <div className="flex gap-2">
                <div className="flex-1">
                  <Combobox
                    items={clientesActivos}
                    getKey={(c) => c.id}
                    getLabel={(c) => `${c.nombre} (${etiquetaDocumento(c)})`}
                    matches={buscarCliente}
                    renderItem={(c) => (
                      <>
                        {c.nombre}
                        <span className="ml-2 text-xs text-slate-500">{etiquetaDocumento(c)}</span>
                      </>
                    )}
                    value={clientesActivos.find((c) => c.id === clienteId) ?? null}
                    onChange={(c) => setClienteId(c?.id ?? '')}
                    placeholder="Buscar por nombre o documento…"
                    emptyText="No hay clientes que coincidan"
                  />
                </div>
                {esAdmin && (
                  <button
                    type="button"
                    onClick={() => setModalCliente(true)}
                    className="btn btn-secondary"
                    title="Nuevo cliente"
                  >
                    <Plus className="size-4" />
                  </button>
                )}
              </div>
            ) : (
              <input
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                maxLength={200}
                placeholder="Nombre o empresa"
                className="input"
                aria-label="Nombre del cliente"
              />
            )}
            {!registrado && (
              <span className="mt-1 block text-xs text-slate-500">
                Si compra, se elige o se crea el cliente al convertir la cotización en venta
              </span>
            )}
          </div>
          <FormField label="Válida hasta *" hint={cotizacion ? undefined : `Por defecto, ${DIAS_VALIDEZ} días`}>
            <input type="date" value={validaHasta} onChange={(e) => setValidaHasta(e.target.value)} className="input" />
          </FormField>
          <FormField
            label="Condiciones"
            className="md:col-span-2"
            hint="Forma de pago, tiempo de entrega, garantía… Salen en el PDF."
          >
            <textarea
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              rows={3}
              maxLength={1000}
              className="input"
            />
          </FormField>
        </section>

        <section className="rounded-2xl border border-brand-border bg-brand-card p-6">
          <h2 className="mb-4 font-semibold">Productos</h2>
          <Combobox
            items={disponibles}
            getKey={(p) => p.id}
            getLabel={(p) => p.nombre}
            matches={buscarProducto}
            renderItem={(p) => (
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate">{p.nombre}</div>
                  <div className="text-xs text-slate-500">
                    <span className="font-mono">{p.sku}</span> · {formatearPrecio(p.precio_venta)}
                  </div>
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
              {lineas.map((l) => {
                const p = stockDe.get(l.producto.id)
                const sinStock = p && Number.isFinite(l.cantidad) && l.cantidad > p.stock
                return (
                  <li key={l.producto.id} className="flex flex-wrap items-end gap-3 p-3">
                    <div className="min-w-0 flex-1 basis-full sm:basis-auto">
                      <p className="truncate text-sm font-medium">{l.producto.nombre}</p>
                      <p className="text-xs text-slate-500">
                        <span className="font-mono">{l.producto.sku}</span>
                        {p && (
                          <span className={sinStock ? 'text-amber-400' : ''}>
                            {' '}
                            · {p.stock} en bodega
                            {sinStock && ': no alcanza hoy'}
                          </span>
                        )}
                      </p>
                    </div>
                    <label className="text-xs text-slate-400">
                      Cantidad
                      <input
                        type="number"
                        min={1}
                        step={1}
                        inputMode="numeric"
                        value={Number.isFinite(l.cantidad) ? l.cantidad : ''}
                        onChange={(e) =>
                          cambiar(l.producto.id, {
                            cantidad: e.target.valueAsNumber,
                          })
                        }
                        className="input mt-1 w-24"
                      />
                    </label>
                    <label className="text-xs text-slate-400">
                      Precio unitario
                      <input
                        type="number"
                        min={0}
                        step="any"
                        inputMode="decimal"
                        value={Number.isFinite(l.precio) ? l.precio : ''}
                        onChange={(e) =>
                          cambiar(l.producto.id, {
                            precio: e.target.valueAsNumber,
                          })
                        }
                        className="input mt-1 w-36"
                      />
                    </label>
                    <p className="w-28 pb-2.5 text-right text-sm whitespace-nowrap text-slate-300">
                      {formatearPrecio((l.cantidad || 0) * (l.precio || 0))}
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
                )
              })}
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
            <span className="block text-xs text-slate-400">Total de la cotización</span>
            <span className="text-lg font-semibold">{formatearPrecio(total)}</span>
          </div>
          <div className="flex gap-3">
            <Link to={volver} className="btn btn-secondary">
              Cancelar
            </Link>
            <button type="submit" disabled={guardar.isPending} className="btn btn-primary">
              {guardar.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : cotizacion ? (
                <Save className="size-4" />
              ) : (
                <Plus className="size-4" />
              )}
              {cotizacion ? 'Guardar cambios' : 'Crear cotización'}
            </button>
          </div>
        </div>
      </form>

      <ClienteFormModal
        open={modalCliente}
        onClose={() => setModalCliente(false)}
        onSaved={(id) => {
          setRegistrado(true)
          setClienteId(id)
        }}
      />
    </>
  )
}
