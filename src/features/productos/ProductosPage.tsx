import { Barcode, ChevronRight, Loader2, Pencil, Plus, Power, PowerOff, Search } from 'lucide-react'
import { useDeferredValue, useMemo, useState, type ReactNode } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { BotonEscanear, type ResultadoEscaneo } from '@/components/ui/Escaner'
import { PageHeader } from '@/components/ui/PageHeader'
import { usePermisos } from '@/features/auth/permisos'
import { formatearPrecio } from '@/lib/format'
import { useBusquedaSerie, useCategorias, useProductos, type Producto } from './api'
import { ConfirmarActivoModal } from './components/ConfirmarActivoModal'
import { ProductoFormModal } from './components/ProductoFormModal'
import { StockBadge, TipoControlBadge } from './components/badges'
import { MiniaturaProducto } from './components/FotoProducto'

type FiltroEstado = 'activos' | 'inactivos' | 'todos'

/** Una fila de la lista: un producto suelto o un producto con colores (sus colores van debajo) */
type Fila =
  | { tipo: 'producto'; producto: Producto }
  | { tipo: 'familia'; familia: NonNullable<Producto['familia']>; colores: [Producto, ...Producto[]] }

/** Agrupa los colores de un mismo producto en la posición del primero (la lista viene ordenada por nombre) */
function agrupar(productos: Producto[]): Fila[] {
  const filas: Fila[] = []
  const familias = new Map<string, Extract<Fila, { tipo: 'familia' }>>()
  for (const p of productos) {
    if (!p.familia) {
      filas.push({ tipo: 'producto', producto: p })
      continue
    }
    const existente = familias.get(p.familia.id)
    if (existente) {
      existente.colores.push(p)
    } else {
      const fila: Extract<Fila, { tipo: 'familia' }> = { tipo: 'familia', familia: p.familia, colores: [p] }
      familias.set(p.familia.id, fila)
      filas.push(fila)
    }
  }
  return filas
}

export function ProductosPage() {
  const navigate = useNavigate()
  const { data: productos = [], isLoading, error } = useProductos()
  const { data: categorias = [] } = useCategorias()

  const [busqueda, setBusqueda] = useState('')
  const [categoriaId, setCategoriaId] = useState('')
  const [estado, setEstado] = useState<FiltroEstado>('activos')
  const [searchParams] = useSearchParams()
  // El dashboard enlaza aquí con ?stock=bajo para ver los productos por reponer
  const [soloStockBajo, setSoloStockBajo] = useState(() => searchParams.get('stock') === 'bajo')

  const [formAbierto, setFormAbierto] = useState(false)
  const [editando, setEditando] = useState<Producto | null>(null)
  const [cambiandoActivo, setCambiandoActivo] = useState<Producto | null>(null)
  const [abiertas, setAbiertas] = useState<Set<string>>(new Set())

  const termino = useDeferredValue(busqueda.trim().toLowerCase())
  const { data: coincidenSerie } = useBusquedaSerie(termino)

  const filtrados = useMemo(
    () =>
      productos.filter((p) => {
        if (estado === 'activos' && !p.activo) return false
        if (estado === 'inactivos' && p.activo) return false
        if (categoriaId && p.categoria_id !== categoriaId) return false
        if (soloStockBajo && p.stock > p.stock_minimo) return false
        if (!termino) return true
        const campos = [p.sku, p.nombre, p.marca, p.modelo, p.codigo_barras]
        return campos.some((c) => c?.toLowerCase().includes(termino)) || Boolean(coincidenSerie?.has(p.id))
      }),
    [productos, estado, categoriaId, soloStockBajo, termino, coincidenSerie],
  )
  const filas = useMemo(() => agrupar(filtrados), [filtrados])

  /** Con una búsqueda o el filtro de stock bajo, los colores se ven sin tener que abrir el grupo */
  const estaAbierta = (familiaId: string) => abiertas.has(familiaId) || Boolean(termino) || soloStockBajo
  function alternar(familiaId: string) {
    setAbiertas((a) => {
      const nuevas = new Set(a)
      if (nuevas.has(familiaId)) nuevas.delete(familiaId)
      else nuevas.add(familiaId)
      return nuevas
    })
  }

  /** Cámara: abre el producto si el código coincide con su código de barras o SKU; si no, lo busca (p. ej. un serial) */
  function onEscaneado(codigo: string): ResultadoEscaneo {
    const exacto = productos.find((p) => p.codigo_barras === codigo || p.sku.toLowerCase() === codigo.toLowerCase())
    if (exacto) navigate('/productos/' + exacto.id)
    else setBusqueda(codigo)
    return { ok: true }
  }

  function abrirNuevo() {
    setEditando(null)
    setFormAbierto(true)
  }

  const { esAdmin } = usePermisos()

  function abrirEdicion(producto: Producto) {
    setEditando(producto)
    setFormAbierto(true)
  }

  return (
    <>
      <PageHeader
        title="Productos"
        description="Catálogo de productos de consumo y de redes y seguridad"
        actions={
          esAdmin && (
            <button onClick={abrirNuevo} className="btn btn-primary">
              <Plus className="size-4" />
              Nuevo producto
            </button>
          )
        }
      />

      <div className="mb-4 grid gap-3 md:grid-cols-[1fr_auto_auto_auto] md:items-center">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-500" />
            <input
              type="search"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar por SKU, nombre, marca, modelo, código de barras o serial…"
              className="input pl-9"
            />
          </div>
          <BotonEscanear titulo="Escanear producto o serial" onDetectado={onEscaneado} />
        </div>
        <select value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)} className="input md:w-48">
          <option value="">Todas las categorías</option>
          {categorias.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre}
            </option>
          ))}
        </select>
        <select
          value={estado}
          onChange={(e) => setEstado(e.target.value as FiltroEstado)}
          className="input md:w-36"
        >
          <option value="activos">Activos</option>
          <option value="inactivos">Inactivos</option>
          <option value="todos">Todos</option>
        </select>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-300">
          <input
            type="checkbox"
            checked={soloStockBajo}
            onChange={(e) => setSoloStockBajo(e.target.checked)}
            className="size-4 accent-brand-accent"
          />
          Stock bajo
        </label>
      </div>

      <div className="overflow-hidden rounded-2xl border border-brand-border bg-brand-card">
        {isLoading ? (
          <div className="flex justify-center p-10">
            <Loader2 className="size-6 animate-spin text-brand-accent" aria-label="Cargando" />
          </div>
        ) : error ? (
          <p className="p-6 text-sm text-red-400">No se pudieron cargar los productos: {error.message}</p>
        ) : filtrados.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500">
            {productos.length === 0 ? (
              <>
                Aún no hay productos.
                {esAdmin && (
                  <>
                    {' '}
                    <button onClick={abrirNuevo} className="text-brand-cyan hover:underline">
                      Crea el primero
                    </button>
                  </>
                )}
              </>
            ) : (
              'Ningún producto coincide con los filtros.'
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-brand-border text-left text-xs tracking-wide text-slate-400 uppercase">
                <tr>
                  <th className="px-4 py-3 font-medium">Producto</th>
                  <th className="px-4 py-3 font-medium">Categoría</th>
                  <th className="px-4 py-3 font-medium">Control</th>
                  <th className="px-4 py-3 text-right font-medium">Stock</th>
                  <th className="px-4 py-3 text-right font-medium">Precio venta</th>
                  <th className="px-4 py-3">
                    <span className="sr-only">Acciones</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-border">
                {filas.map((fila) =>
                  fila.tipo === 'producto' ? (
                    <FilaProducto
                      key={fila.producto.id}
                      producto={fila.producto}
                      serialCoincide={Boolean(termino && coincidenSerie?.has(fila.producto.id))}
                      onAbrir={() => navigate(`/productos/${fila.producto.id}`)}
                      onEditar={esAdmin ? () => abrirEdicion(fila.producto) : undefined}
                      onCambiarActivo={esAdmin ? () => setCambiandoActivo(fila.producto) : undefined}
                    />
                  ) : (
                    <FilaFamilia
                      key={fila.familia.id}
                      fila={fila}
                      abierta={estaAbierta(fila.familia.id)}
                      onAlternar={() => alternar(fila.familia.id)}
                    >
                      {fila.colores.map((p) => (
                        <FilaProducto
                          key={p.id}
                          producto={p}
                          esColor
                          serialCoincide={Boolean(termino && coincidenSerie?.has(p.id))}
                          onAbrir={() => navigate(`/productos/${p.id}`)}
                          onEditar={esAdmin ? () => abrirEdicion(p) : undefined}
                          onCambiarActivo={esAdmin ? () => setCambiandoActivo(p) : undefined}
                        />
                      ))}
                    </FilaFamilia>
                  ),
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {!isLoading && productos.length > 0 && (
        <p className="mt-3 text-xs text-slate-500">
          Mostrando {filtrados.length} de {productos.length} productos
        </p>
      )}

      <ProductoFormModal open={formAbierto} onClose={() => setFormAbierto(false)} producto={editando} />
      <ConfirmarActivoModal producto={cambiandoActivo} onClose={() => setCambiandoActivo(null)} />
    </>
  )
}

interface FilaProductoProps {
  producto: Producto
  /** Color dentro de un producto con colores: se muestra solo el color, con sangría */
  esColor?: boolean
  serialCoincide: boolean
  onAbrir: () => void
  /** Sin ellas (usuarios que no son admin) no se muestran los botones */
  onEditar?: () => void
  onCambiarActivo?: () => void
}

function FilaProducto({ producto: p, esColor, serialCoincide, onAbrir, onEditar, onCambiarActivo }: FilaProductoProps) {
  return (
    <tr
      onClick={onAbrir}
      className={`cursor-pointer transition hover:bg-white/[0.03] ${p.activo ? '' : 'opacity-50'} ${esColor ? 'bg-white/[0.015]' : ''}`}
    >
      <td className={`py-3 pr-4 ${esColor ? 'pl-12' : 'pl-4'}`}>
        <div className="flex items-center gap-3">
          <MiniaturaProducto url={p.imagen_url} nombre={p.nombre} />
          <div className="min-w-0">
            <Link
              to={`/productos/${p.id}`}
              onClick={(e) => e.stopPropagation()}
              className="font-medium hover:text-brand-cyan"
            >
              {esColor ? p.color : p.nombre}
            </Link>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-slate-500">
              <span className="font-mono">{p.sku}</span>
              {!esColor && (p.marca || p.modelo) && <span>· {[p.marca, p.modelo].filter(Boolean).join(' ')}</span>}
              {!p.activo && <span className="text-amber-400">· Inactivo</span>}
              {serialCoincide && (
                <span className="inline-flex items-center gap-1 text-brand-cyan">
                  · <Barcode className="size-3" /> serial coincide
                </span>
              )}
            </div>
          </div>
        </div>
      </td>
      <td className="px-4 py-3 text-slate-300">{esColor ? '' : (p.categoria?.nombre ?? '—')}</td>
      <td className="px-4 py-3">{!esColor && <TipoControlBadge serializado={p.es_serializado} />}</td>
      <td className="px-4 py-3 text-right">
        <StockBadge stock={p.stock} minimo={p.stock_minimo} />
      </td>
      <td className="px-4 py-3 text-right whitespace-nowrap text-slate-300">
        {esColor ? '' : formatearPrecio(p.precio_venta)}
      </td>
      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-end gap-1">
          {onEditar && (
            <button
              onClick={onEditar}
              className="rounded-lg p-2 text-slate-400 hover:bg-white/5 hover:text-slate-200"
              title="Editar"
              aria-label={`Editar ${p.nombre}`}
            >
              <Pencil className="size-4" />
            </button>
          )}
          {onCambiarActivo && (
            <button
              onClick={onCambiarActivo}
              className={`rounded-lg p-2 hover:bg-white/5 ${
                p.activo ? 'text-slate-400 hover:text-red-400' : 'text-slate-400 hover:text-emerald-400'
              }`}
              title={p.activo ? 'Desactivar' : 'Reactivar'}
              aria-label={`${p.activo ? 'Desactivar' : 'Reactivar'} ${p.nombre}`}
            >
              {p.activo ? <PowerOff className="size-4" /> : <Power className="size-4" />}
            </button>
          )}
        </div>
      </td>
    </tr>
  )
}

interface FilaFamiliaProps {
  fila: Extract<Fila, { tipo: 'familia' }>
  abierta: boolean
  onAlternar: () => void
  children: ReactNode
}

/** Fila del producto con colores: stock total y, al abrirla, una fila por color */
function FilaFamilia({ fila, abierta, onAlternar, children }: FilaFamiliaProps) {
  const { familia, colores } = fila
  const primero = colores[0]
  const total = colores.reduce((s, p) => s + p.stock, 0)
  const sinStock = colores.filter((p) => p.stock <= 0).length
  const bajos = colores.filter((p) => p.stock > 0 && p.stock <= p.stock_minimo).length
  const claseStock = total <= 0 ? 'bg-red-500/15 text-red-400' : bajos + sinStock > 0 ? 'bg-amber-500/15 text-amber-400' : 'text-slate-200'

  return (
    <>
      <tr onClick={onAlternar} className="cursor-pointer transition hover:bg-white/[0.03]">
        <td className="px-4 py-3">
          <div className="flex items-center gap-3">
            <MiniaturaProducto url={primero.imagen_url} nombre={familia.nombre} />
            <div className="min-w-0">
              <span className="flex items-center gap-1 font-medium">
                <ChevronRight className={`size-4 shrink-0 text-slate-400 transition-transform ${abierta ? 'rotate-90' : ''}`} />
                {familia.nombre}
              </span>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-slate-500">
                <span className="font-mono">{familia.sku_base}</span>
                <span>
                  · {colores.length} {colores.length === 1 ? 'color' : 'colores'}
                </span>
                {(primero.marca || primero.modelo) && (
                  <span>· {[primero.marca, primero.modelo].filter(Boolean).join(' ')}</span>
                )}
              </div>
            </div>
          </div>
        </td>
        <td className="px-4 py-3 text-slate-300">{primero.categoria?.nombre ?? '—'}</td>
        <td className="px-4 py-3">
          <TipoControlBadge serializado={primero.es_serializado} />
        </td>
        <td className="px-4 py-3 text-right">
          <span
            className={`inline-block min-w-8 rounded-full px-2 py-0.5 text-center font-semibold ${claseStock}`}
            title={
              sinStock + bajos > 0
                ? `${sinStock} color(es) sin stock y ${bajos} en o por debajo del mínimo`
                : 'Stock total de todos los colores'
            }
          >
            {total}
          </span>
        </td>
        <td className="px-4 py-3 text-right whitespace-nowrap text-slate-300">{formatearPrecio(primero.precio_venta)}</td>
        <td className="px-4 py-3" />
      </tr>
      {abierta && children}
    </>
  )
}
