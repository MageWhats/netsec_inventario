import { Barcode, Loader2, Pencil, Plus, Power, PowerOff, Search } from 'lucide-react'
import { useDeferredValue, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { BotonEscanear, type ResultadoEscaneo } from '@/components/ui/Escaner'
import { PageHeader } from '@/components/ui/PageHeader'
import { formatearPrecio } from '@/lib/format'
import { useBusquedaSerie, useCategorias, useProductos, type Producto } from './api'
import { ConfirmarActivoModal } from './components/ConfirmarActivoModal'
import { ProductoFormModal } from './components/ProductoFormModal'
import { StockBadge, TipoControlBadge } from './components/badges'
import { MiniaturaProducto } from './components/FotoProducto'

type FiltroEstado = 'activos' | 'inactivos' | 'todos'

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
          <button onClick={abrirNuevo} className="btn btn-primary">
            <Plus className="size-4" />
            Nuevo producto
          </button>
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
                Aún no hay productos.{' '}
                <button onClick={abrirNuevo} className="text-brand-cyan hover:underline">
                  Crea el primero
                </button>
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
                {filtrados.map((p) => (
                  <tr
                    key={p.id}
                    onClick={() => navigate(`/productos/${p.id}`)}
                    className={`cursor-pointer transition hover:bg-white/[0.03] ${p.activo ? '' : 'opacity-50'}`}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <MiniaturaProducto url={p.imagen_url} nombre={p.nombre} />
                        <div className="min-w-0">
                          <Link
                            to={`/productos/${p.id}`}
                            onClick={(e) => e.stopPropagation()}
                            className="font-medium hover:text-brand-cyan"
                          >
                            {p.nombre}
                          </Link>
                          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-slate-500">
                            <span className="font-mono">{p.sku}</span>
                            {(p.marca || p.modelo) && <span>· {[p.marca, p.modelo].filter(Boolean).join(' ')}</span>}
                            {!p.activo && <span className="text-amber-400">· Inactivo</span>}
                            {termino && coincidenSerie?.has(p.id) && (
                              <span className="inline-flex items-center gap-1 text-brand-cyan">
                                · <Barcode className="size-3" /> serial coincide
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-300">{p.categoria?.nombre ?? '—'}</td>
                    <td className="px-4 py-3">
                      <TipoControlBadge serializado={p.es_serializado} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <StockBadge stock={p.stock} minimo={p.stock_minimo} />
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap text-slate-300">
                      {formatearPrecio(p.precio_venta)}
                    </td>
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <div className="flex justify-end gap-1">
                        <button
                          onClick={() => abrirEdicion(p)}
                          className="rounded-lg p-2 text-slate-400 hover:bg-white/5 hover:text-slate-200"
                          title="Editar"
                          aria-label={`Editar ${p.nombre}`}
                        >
                          <Pencil className="size-4" />
                        </button>
                        <button
                          onClick={() => setCambiandoActivo(p)}
                          className={`rounded-lg p-2 hover:bg-white/5 ${
                            p.activo ? 'text-slate-400 hover:text-red-400' : 'text-slate-400 hover:text-emerald-400'
                          }`}
                          title={p.activo ? 'Desactivar' : 'Reactivar'}
                          aria-label={`${p.activo ? 'Desactivar' : 'Reactivar'} ${p.nombre}`}
                        >
                          {p.activo ? <PowerOff className="size-4" /> : <Power className="size-4" />}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
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
