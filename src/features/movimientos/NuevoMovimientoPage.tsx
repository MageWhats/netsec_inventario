import { ArrowLeft, Plus, Save } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, Navigate, useBlocker, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Combobox } from '@/components/ui/Combobox'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { BotonEscanear, type ResultadoEscaneo } from '@/components/ui/Escaner'
import { FormField } from '@/components/ui/FormField'
import { ClienteFormModal } from '@/features/clientes/components/ClienteFormModal'
import { useClientes, type Cliente } from '@/features/clientes/api'
import { etiquetaDocumento } from '@/features/clientes/schema'
import { useProductos, type Producto } from '@/features/productos/api'
import { StockBadge } from '@/features/productos/components/badges'
import { ProveedorFormModal } from '@/features/proveedores/components/ProveedorFormModal'
import { useProveedores, type Proveedor } from '@/features/proveedores/api'
import { mensajeError } from '@/lib/errores'
import { formatearFecha, formatearPrecio } from '@/lib/format'
import {
  useBodegas,
  useMovimiento,
  useRegistrarMovimiento,
  useSalidasParaDevolucion,
  type SalidaDevolucion,
} from './api'
import { LineaMovimiento } from './components/LineaMovimiento'
import { TipoMovimientoBadge } from './components/MovimientosTabla'
import {
  ahoraLocal,
  construirItems,
  destinoPorMotivo,
  nuevaLinea,
  subtotalLinea,
  unidadesLinea,
  validarLineas,
  type Linea,
} from './lineas'
import {
  esAjuste,
  esTipoMovimiento,
  formatearNumero,
  motivosAjuste,
  motivosPara,
  tiposMovimiento,
  type MotivoAjuste,
  type TipoMovimiento,
} from './tipos'

export function NuevoMovimientoPage() {
  const { tipo } = useParams()
  if (!esTipoMovimiento(tipo)) return <Navigate to="/movimientos" replace />
  // key: al cambiar de tipo el formulario empieza de cero
  return <NuevoMovimientoForm key={tipo} tipo={tipo} />
}

const buscarProducto = (p: Producto, t: string) =>
  [p.sku, p.nombre, p.marca, p.modelo, p.codigo_barras].some((v) => v?.toLowerCase().includes(t))
const productoExacto = (items: Producto[], texto: string) =>
  items.find((p) => p.codigo_barras === texto || p.sku.toLowerCase() === texto.toLowerCase())
const buscarCliente = (c: Cliente, t: string) =>
  [c.nombre, c.documento, c.telefono].some((v) => v?.toLowerCase().includes(t))
const buscarProveedor = (p: Proveedor, t: string) =>
  [p.nombre, p.nit, p.contacto].some((v) => v?.toLowerCase().includes(t))
const buscarSalida = (s: SalidaDevolucion, t: string) =>
  [formatearNumero(s), s.cliente_nombre, s.referencia].some((v) => v?.toLowerCase().includes(t))

function NuevoMovimientoForm({ tipo }: { tipo: TipoMovimiento }) {
  const info = tiposMovimiento[tipo]
  const navigate = useNavigate()
  const [params] = useSearchParams()

  const { data: productos = [] } = useProductos()
  const { data: clientes = [] } = useClientes()
  const { data: proveedores = [] } = useProveedores()
  const { data: bodegas = [] } = useBodegas()
  const registrar = useRegistrarMovimiento()

  const [fecha, setFecha] = useState(ahoraLocal)
  const [bodegaId, setBodegaId] = useState('')
  const [clienteId, setClienteId] = useState(params.get('cliente') ?? '')
  const [proveedorId, setProveedorId] = useState(params.get('proveedor') ?? '')
  const [referencia, setReferencia] = useState('')
  /** Salidas: la referencia solo se usa para el número de la factura electrónica, si la hay */
  const [conFactura, setConFactura] = useState(false)
  const [notas, setNotas] = useState('')
  // Ajustes: motivo de la lista y, en una devolución, la venta de origen (se pueden precargar con ?motivo=&origen=)
  const [motivo, setMotivo] = useState<MotivoAjuste | ''>(() => {
    const m = params.get('motivo')
    return motivosPara(tipo).find((x) => x === m) ?? ''
  })
  const [origenId, setOrigenId] = useState(params.get('origen') ?? '')
  const [lineas, setLineas] = useState<Linea[]>([])

  const esDevolucion = tipo === 'ajuste_entrada' && motivo === 'devolucion_cliente'
  const salidas = useSalidasParaDevolucion(esDevolucion)
  const { data: venta } = useMovimiento(origenId, esDevolucion)
  const ventaOrigen = esDevolucion && origenId ? venta : null
  const productosVenta = new Set(ventaOrigen?.items.map((i) => i.producto.id))
  const unidadesVenta = new Set(ventaOrigen?.items.flatMap((i) => (i.unidad ? [i.unidad.id] : [])))

  const [intentoGuardar, setIntentoGuardar] = useState(false)
  const [fechaFutura, setFechaFutura] = useState(false)
  const [confirmando, setConfirmando] = useState(false)
  const [modalTercero, setModalTercero] = useState(false)

  // Producto precargado desde ?producto= (p. ej. desde el detalle de un producto)
  const [productoInicial, setProductoInicial] = useState(params.get('producto'))
  if (productoInicial && productos.length > 0) {
    const p = productos.find((x) => x.id === productoInicial && x.activo)
    setProductoInicial(null)
    if (p) setLineas([nuevaLinea(p, tipo)])
  }

  // ---- Cambios sin guardar: avisar antes de salir
  const guardado = useRef(false)
  const hayCambios = lineas.length > 0
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      hayCambios && !guardado.current && currentLocation.pathname !== nextLocation.pathname,
  )
  useEffect(() => {
    if (!hayCambios) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [hayCambios])

  // ---- Líneas
  const idsEnUso = new Set(lineas.map((l) => l.producto.id))
  // En una devolución solo se pueden agregar productos de la venta de origen
  const productosSeleccionables = productos.filter(
    (p) => p.activo && !idsEnUso.has(p.id) && (!esDevolucion || productosVenta.has(p.id)),
  )

  function agregarProducto(p: Producto | null) {
    if (!p) return
    const linea = nuevaLinea(p, tipo)
    if (tipo === 'ajuste_salida') linea.estadoDestino = destinoPorMotivo(motivo)
    setLineas((ls) => [...ls, linea])
  }
  function cambiarMotivo(nuevo: MotivoAjuste | '') {
    // Entrar o salir de "devolución" cambia qué productos se pueden agregar: la lista empieza de cero
    if ((nuevo === 'devolucion_cliente') !== (motivo === 'devolucion_cliente')) {
      setLineas([])
      setOrigenId('')
    }
    if (tipo === 'ajuste_salida') setLineas((ls) => ls.map((l) => ({ ...l, estadoDestino: destinoPorMotivo(nuevo) })))
    setMotivo(nuevo)
  }
  function cambiarOrigen(id: string) {
    setOrigenId(id)
    setLineas([])
  }
  /** Cámara: agrega el producto cuyo código de barras o SKU coincide exactamente */
  function onProductoEscaneado(codigo: string): ResultadoEscaneo {
    const p = productoExacto(productos, codigo)
    if (!p) return { ok: false, mensaje: 'Ningún producto tiene ese código de barras o SKU.' }
    if (!p.activo) return { ok: false, mensaje: `${p.nombre} está inactivo.` }
    if (idsEnUso.has(p.id)) return { ok: false, mensaje: `${p.nombre} ya está en la lista.` }
    if (esDevolucion && !productosVenta.has(p.id)) return { ok: false, mensaje: `${p.nombre} no salió en esa venta.` }
    if (!info.esEntrada && p.stock <= 0) return { ok: false, mensaje: `${p.nombre} no tiene stock.` }
    agregarProducto(p)
    return { ok: true, mensaje: p.nombre }
  }
  function actualizarLinea(key: string, cambios: Partial<Linea>) {
    setLineas((ls) => ls.map((l) => (l.key === key ? { ...l, ...cambios } : l)))
  }
  function quitarLinea(key: string) {
    setLineas((ls) => ls.filter((l) => l.key !== key))
  }

  // ---- Validación (se muestra después del primer intento de guardar)
  const erroresLineas = validarLineas(tipo, lineas)
  const erroresCabecera: Record<string, string> = {}
  if (!fecha) erroresCabecera.fecha = 'La fecha es obligatoria.'
  else if (fechaFutura) erroresCabecera.fecha = 'La fecha no puede ser futura.'
  if (esAjuste(tipo) && !motivo) erroresCabecera.motivo = 'Elige el motivo del ajuste.'
  if (motivo === 'otro' && !notas.trim()) erroresCabecera.notas = 'Describe el motivo del ajuste.'
  if (esDevolucion && !origenId) erroresCabecera.origen = 'Elige la venta que el cliente devuelve.'
  if (tipo === 'salida' && conFactura && !referencia.trim()) {
    erroresCabecera.referencia = 'Escribe el número de la factura electrónica o desmarca la casilla.'
  }
  if (lineas.length === 0) erroresCabecera.lineas = 'Agrega al menos un producto.'
  const esValido = erroresLineas.size === 0 && Object.keys(erroresCabecera).length === 0
  const mostrarErrores = intentoGuardar

  const totalUnidades = lineas.reduce((s, l) => s + unidadesLinea(l), 0)
  const totalValor = lineas.reduce((s, l) => s + subtotalLinea(l), 0)

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    setIntentoGuardar(true)
    const esFutura = new Date(fecha).getTime() > Date.now() + 5 * 60_000
    setFechaFutura(esFutura)
    if (esValido && !esFutura) setConfirmando(true)
  }

  function guardar() {
    registrar.mutate(
      {
        p_tipo: tipo,
        p_items: construirItems(tipo, lineas),
        p_bodega_id: bodegaId || null,
        p_proveedor_id: tipo === 'entrada' ? proveedorId || null : null,
        p_cliente_id: tipo === 'salida' ? clienteId || null : null,
        // Devolución: la base de datos toma la factura electrónica de la venta de origen
        p_referencia: esDevolucion || (tipo === 'salida' && !conFactura) ? null : referencia,
        p_notas: notas,
        // Solo se envían cuando aplican (undefined no viaja): entradas y salidas no dependen de la migración 0010
        p_motivo: esAjuste(tipo) ? motivo || null : undefined,
        p_movimiento_origen_id: esDevolucion ? origenId || null : undefined,
        p_fecha: new Date(fecha).toISOString(),
      },
      {
        onSuccess: (id) => {
          guardado.current = true
          navigate(`/movimientos/${id}`, { replace: true, state: { creado: true } })
        },
      },
    )
  }

  const clientesActivos = clientes.filter((c) => c.activo)
  const proveedoresActivos = proveedores.filter((p) => p.activo)

  return (
    <>
      <Link to="/movimientos" className="mb-4 inline-flex items-center gap-1 text-sm text-slate-400 hover:text-slate-200">
        <ArrowLeft className="size-4" />
        Movimientos
      </Link>

      <div className="mb-6">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">Nuevo movimiento</h1>
          <TipoMovimientoBadge tipo={tipo} />
        </div>
        <p className="mt-1 text-sm text-slate-400">{info.descripcion}</p>
      </div>

      <form onSubmit={onSubmit} noValidate className="space-y-6">
        {/* ---------- Datos generales ---------- */}
        <section className="rounded-2xl border border-brand-border bg-brand-card p-6">
          <h2 className="mb-4 font-semibold">Datos generales</h2>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <FormField label="Fecha y hora *" error={mostrarErrores ? erroresCabecera.fecha : undefined}>
              <input
                type="datetime-local"
                value={fecha}
                onChange={(e) => {
                  setFecha(e.target.value)
                  setFechaFutura(false)
                }}
                className="input"
              />
            </FormField>

            {esAjuste(tipo) && (
              <FormField label="Motivo *" error={mostrarErrores ? erroresCabecera.motivo : undefined}>
                <select
                  value={motivo}
                  onChange={(e) => cambiarMotivo(e.target.value as MotivoAjuste | '')}
                  className="input"
                >
                  <option value="">Elige el motivo…</option>
                  {motivosPara(tipo).map((m) => (
                    <option key={m} value={m}>
                      {motivosAjuste[m].label}
                    </option>
                  ))}
                </select>
              </FormField>
            )}

            {esDevolucion && (
              <FormField
                label="Venta que se devuelve *"
                error={mostrarErrores ? erroresCabecera.origen : undefined}
                hint={
                  ventaOrigen
                    ? ventaOrigen.referencia
                      ? `Factura electrónica ${ventaOrigen.referencia}: queda como referencia de la devolución`
                      : 'Esa venta no tiene factura electrónica'
                    : 'Solo se pueden devolver productos de esa venta'
                }
              >
                <Combobox
                  items={salidas.data ?? []}
                  getKey={(s) => s.id}
                  getLabel={(s) => `${formatearNumero(s)} · ${s.cliente_nombre ?? 'Consumidor final'}`}
                  matches={buscarSalida}
                  renderItem={(s) => (
                    <div className="min-w-0">
                      <div className="truncate">
                        <span className="font-mono">{formatearNumero(s)}</span> · {s.cliente_nombre ?? 'Consumidor final'}
                      </div>
                      <div className="text-xs text-slate-500">
                        {formatearFecha(s.fecha)} · {s.unidades} und.{s.referencia && ` · Factura ${s.referencia}`}
                      </div>
                    </div>
                  )}
                  value={(salidas.data ?? []).find((s) => s.id === origenId) ?? null}
                  onChange={(s) => cambiarOrigen(s?.id ?? '')}
                  placeholder="Buscar por número, cliente o factura…"
                  emptyText={salidas.isLoading ? 'Cargando ventas…' : 'Ninguna venta coincide'}
                />
              </FormField>
            )}

            {tipo === 'entrada' && (
              <FormField label="Proveedor">
                <div className="flex gap-2">
                  <div className="flex-1">
                    <Combobox
                      items={proveedoresActivos}
                      getKey={(p) => p.id}
                      getLabel={(p) => p.nombre}
                      matches={buscarProveedor}
                      renderItem={(p) => (
                        <>
                          {p.nombre}
                          {p.nit && <span className="ml-2 text-xs text-slate-500">NIT {p.nit}</span>}
                        </>
                      )}
                      value={proveedoresActivos.find((p) => p.id === proveedorId) ?? null}
                      onChange={(p) => setProveedorId(p?.id ?? '')}
                      placeholder="Buscar proveedor…"
                      emptyText="No hay proveedores que coincidan"
                    />
                  </div>
                  <button type="button" onClick={() => setModalTercero(true)} className="btn btn-secondary" title="Nuevo proveedor">
                    <Plus className="size-4" />
                  </button>
                </div>
              </FormField>
            )}

            {tipo === 'salida' && (
              <FormField label="Cliente" hint="Déjalo vacío para una venta a consumidor final">
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
                  <button type="button" onClick={() => setModalTercero(true)} className="btn btn-secondary" title="Nuevo cliente">
                    <Plus className="size-4" />
                  </button>
                </div>
              </FormField>
            )}

            {tipo === 'salida' ? (
              <FormField
                label="Factura electrónica"
                error={mostrarErrores ? erroresCabecera.referencia : undefined}
                hint="El número de la salida (NetS-…) lo pone la app"
              >
                <label className="flex items-center gap-2 py-2 text-sm text-slate-300">
                  <input
                    type="checkbox"
                    checked={conFactura}
                    onChange={(e) => setConFactura(e.target.checked)}
                    className="size-4 accent-brand-accent"
                  />
                  Esta venta tiene factura electrónica
                </label>
                {conFactura && (
                  <input
                    value={referencia}
                    onChange={(e) => setReferencia(e.target.value)}
                    maxLength={100}
                    placeholder="N.º de factura, p. ej. FE-1024"
                    className="input"
                    autoFocus
                  />
                )}
              </FormField>
            ) : (
              !esDevolucion && (
                <FormField
                  label="Referencia"
                  hint={tipo === 'entrada' ? 'Nº de factura o remisión del proveedor' : 'Nº de documento de soporte, si lo hay'}
                >
                  <input value={referencia} onChange={(e) => setReferencia(e.target.value)} maxLength={100} className="input" />
                </FormField>
              )
            )}

            {bodegas.length > 1 && (
              <FormField label="Bodega">
                <select
                  value={bodegaId || bodegas[0]?.id}
                  onChange={(e) => setBodegaId(e.target.value)}
                  className="input"
                >
                  {bodegas.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.nombre}
                    </option>
                  ))}
                </select>
              </FormField>
            )}

            <FormField
              label={motivo === 'otro' ? 'Describe el motivo *' : esAjuste(tipo) ? 'Notas (opcional)' : 'Notas'}
              error={mostrarErrores ? erroresCabecera.notas : undefined}
              className="md:col-span-2 lg:col-span-3"
            >
              <textarea
                value={notas}
                onChange={(e) => setNotas(e.target.value)}
                rows={2}
                maxLength={1000}
                className="input"
              />
            </FormField>
          </div>
        </section>

        {/* ---------- Productos ---------- */}
        <section className="rounded-2xl border border-brand-border bg-brand-card p-6">
          <h2 className="mb-4 font-semibold">Productos</h2>

          <div className="flex gap-2">
            <div className="min-w-0 flex-1">
              <Combobox
                items={productosSeleccionables}
                getKey={(p) => p.id}
                getLabel={(p) => p.nombre}
                matches={buscarProducto}
                exactMatch={productoExacto}
                isDisabled={(p) => !info.esEntrada && p.stock <= 0}
                renderItem={(p) => (
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate">{p.nombre}</div>
                      <div className="text-xs text-slate-500">
                        <span className="font-mono">{p.sku}</span>
                        {p.es_serializado && ' · con serial'}
                      </div>
                    </div>
                    <StockBadge stock={p.stock} minimo={p.stock_minimo} />
                  </div>
                )}
                onChange={agregarProducto}
                clearOnSelect
                autoFocus={!params.get('producto')}
                placeholder="Agregar producto: busca por nombre, SKU o escanea el código de barras…"
                emptyText={
                  esDevolucion && !origenId
                    ? 'Primero elige la venta que se devuelve'
                    : productos.length === 0
                      ? 'No hay productos creados'
                      : 'Ningún producto coincide'
                }
              />
            </div>
            <BotonEscanear titulo="Escanear productos" continuo onDetectado={onProductoEscaneado} />
          </div>

          {lineas.length === 0 ? (
            <p
              className={`mt-4 rounded-xl border border-dashed p-8 text-center text-sm ${
                mostrarErrores && erroresCabecera.lineas
                  ? 'border-red-500/60 text-red-400'
                  : 'border-brand-border text-slate-500'
              }`}
            >
              Aún no has agregado productos.
            </p>
          ) : (
            <ul className="mt-4 space-y-3">
              {lineas.map((l) => (
                <LineaMovimiento
                  key={l.key}
                  tipo={tipo}
                  linea={l}
                  error={mostrarErrores ? erroresLineas.get(l.key) : undefined}
                  onChange={(cambios) => actualizarLinea(l.key, cambios)}
                  onRemove={() => quitarLinea(l.key)}
                  devolucion={esDevolucion ? { unidadIds: unidadesVenta } : undefined}
                />
              ))}
            </ul>
          )}
        </section>

        {/* ---------- Totales y guardar ---------- */}
        <div className="sticky bottom-0 z-20 -mx-4 flex flex-wrap items-center justify-between gap-4 border-t border-brand-border bg-brand-bg/95 px-4 py-4 backdrop-blur lg:-mx-8 lg:px-8">
          <div className="flex gap-8 text-sm">
            <div>
              <span className="block text-xs text-slate-400">Unidades</span>
              <span className="text-lg font-semibold">{totalUnidades}</span>
            </div>
            <div>
              <span className="block text-xs text-slate-400">{tipo === 'salida' ? 'Total venta' : 'Total costo'}</span>
              <span className="text-lg font-semibold">{formatearPrecio(totalValor)}</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {mostrarErrores && !esValido && (
              <span className="text-sm text-red-400">Revisa los campos marcados.</span>
            )}
            <Link to="/movimientos" className="btn btn-secondary">
              Cancelar
            </Link>
            <button type="submit" className="btn btn-primary">
              <Save className="size-4" />
              Registrar {info.label.toLowerCase()}
            </button>
          </div>
        </div>
      </form>

      {/* Confirmación: los movimientos no se pueden editar ni borrar */}
      <ConfirmDialog
        open={confirmando}
        title={`Registrar ${info.label.toLowerCase()}`}
        confirmLabel="Confirmar y registrar"
        pending={registrar.isPending}
        error={registrar.error && mensajeError(registrar.error)}
        onConfirm={guardar}
        onClose={() => {
          registrar.reset()
          setConfirmando(false)
        }}
      >
        <p>
          Se registrarán <strong>{totalUnidades}</strong> unidad(es) de <strong>{lineas.length}</strong> producto(s) por{' '}
          <strong>{formatearPrecio(totalValor)}</strong>.
        </p>
        <p className="mt-3 text-slate-400">
          Los movimientos no se pueden editar ni eliminar. Si te equivocas, deberás corregirlo con un ajuste.
        </p>
      </ConfirmDialog>

      {/* Salir con cambios sin guardar */}
      <ConfirmDialog
        open={blocker.state === 'blocked'}
        title="¿Descartar el movimiento?"
        confirmLabel="Descartar"
        danger
        onConfirm={() => blocker.proceed?.()}
        onClose={() => blocker.reset?.()}
      >
        Tienes productos agregados que no se han registrado. Si sales, se perderán.
      </ConfirmDialog>

      {tipo === 'salida' && (
        <ClienteFormModal open={modalTercero} onClose={() => setModalTercero(false)} onSaved={setClienteId} />
      )}
      {tipo === 'entrada' && (
        <ProveedorFormModal open={modalTercero} onClose={() => setModalTercero(false)} onSaved={setProveedorId} />
      )}
    </>
  )
}
