import { ArrowDownToLine, ArrowLeft, ArrowUpFromLine, Pencil, Power, PowerOff } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Dato } from '@/components/ui/Dato'
import { LoadingBlock } from '@/components/ui/LoadingBlock'
import { usePermisos } from '@/features/auth/permisos'
import { formatearFecha, formatearPrecio } from '@/lib/format'
import { useProducto } from './api'
import { ColoresSection } from './components/ColoresSection'
import { ConfirmarActivoModal } from './components/ConfirmarActivoModal'
import { FotoProducto } from './components/FotoProducto'
import { KardexSection } from './components/KardexSection'
import { ProductoFormModal } from './components/ProductoFormModal'
import { StockBadge, TipoControlBadge } from './components/badges'
import { UnidadesSection } from './components/UnidadesSection'

export function ProductoDetallePage() {
  const { id = '' } = useParams()
  const { data: producto, isLoading, error } = useProducto(id)
  const { esAdmin, puedeOperar, verCostos } = usePermisos()
  const [editando, setEditando] = useState(false)
  const [cambiandoActivo, setCambiandoActivo] = useState(false)

  if (isLoading) return <LoadingBlock />

  if (error || !producto) {
    return (
      <div className="p-10 text-center">
        <p className="text-slate-400">{error ? `Error al cargar el producto: ${error.message}` : 'El producto no existe.'}</p>
        <Link to="/productos" className="mt-4 inline-block text-brand-cyan hover:underline">
          Volver a productos
        </Link>
      </div>
    )
  }

  const margen = producto.precio_venta > 0 ? (producto.precio_venta - producto.precio_costo) / producto.precio_venta : null

  return (
    <>
      <Link to="/productos" className="mb-4 inline-flex items-center gap-1 text-sm text-slate-400 hover:text-slate-200">
        <ArrowLeft className="size-4" />
        Productos
      </Link>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold">{producto.nombre}</h1>
            <TipoControlBadge serializado={producto.es_serializado} />
            {!producto.activo && (
              <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs text-amber-400">Inactivo</span>
            )}
          </div>
          <p className="mt-1 font-mono text-sm text-slate-400">{producto.sku}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {producto.activo && puedeOperar && (
            <>
              <Link to={`/movimientos/nuevo/entrada?producto=${producto.id}`} className="btn btn-secondary">
                <ArrowDownToLine className="size-4" />
                Entrada
              </Link>
              {producto.stock > 0 && (
                <Link to={`/movimientos/nuevo/salida?producto=${producto.id}`} className="btn btn-secondary">
                  <ArrowUpFromLine className="size-4" />
                  Salida
                </Link>
              )}
            </>
          )}
          {esAdmin && (
            <>
              <button onClick={() => setCambiandoActivo(true)} className="btn btn-secondary">
                {producto.activo ? <PowerOff className="size-4" /> : <Power className="size-4" />}
                {producto.activo ? 'Desactivar' : 'Reactivar'}
              </button>
              <button onClick={() => setEditando(true)} className="btn btn-primary">
                <Pencil className="size-4" />
                Editar
              </button>
            </>
          )}
        </div>
      </div>

      <div className={`mb-6 grid gap-4 sm:grid-cols-2 ${verCostos ? 'lg:grid-cols-4' : ''}`}>
        <Kpi label="Stock actual">
          <StockBadge stock={producto.stock} minimo={producto.stock_minimo} />
          <span className="ml-2 text-xs text-slate-500">mínimo {producto.stock_minimo}</span>
        </Kpi>
        {verCostos && <Kpi label="Costo medio (PEPS)">{formatearPrecio(producto.precio_costo)}</Kpi>}
        <Kpi label="Precio de venta">{formatearPrecio(producto.precio_venta)}</Kpi>
        {verCostos && <Kpi label="Margen">{margen === null ? '—' : `${(margen * 100).toFixed(1)} %`}</Kpi>}
      </div>

      <section className="mb-6 grid gap-6 rounded-2xl border border-brand-border bg-brand-card p-6 md:grid-cols-[14rem_1fr]">
        <div className="mx-auto w-full max-w-56">
          <FotoProducto producto={producto} />
        </div>
        <div>
          <h2 className="mb-4 font-semibold">Detalles</h2>
          <dl className="grid gap-x-6 gap-y-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
            {producto.color && <Dato label="Color">{producto.color}</Dato>}
            <Dato label="Categoría">{producto.categoria?.nombre}</Dato>
            <Dato label="Marca">{producto.marca}</Dato>
            <Dato label="Modelo">{producto.modelo}</Dato>
            <Dato label="Código de barras">
              {producto.codigo_barras && <span className="font-mono">{producto.codigo_barras}</span>}
            </Dato>
            <Dato label="Creado">{formatearFecha(producto.created_at)}</Dato>
            <Dato label="Última modificación">{formatearFecha(producto.updated_at)}</Dato>
            <Dato label="Descripción" className="sm:col-span-2 lg:col-span-3">
              {producto.descripcion && <span className="whitespace-pre-line">{producto.descripcion}</span>}
            </Dato>
          </dl>
        </div>
      </section>

      <ColoresSection producto={producto} />

      <KardexSection producto={producto} />

      {producto.es_serializado && <UnidadesSection productoId={producto.id} />}

      <ProductoFormModal open={editando} onClose={() => setEditando(false)} producto={producto} />
      <ConfirmarActivoModal producto={cambiandoActivo ? producto : null} onClose={() => setCambiandoActivo(false)} />
    </>
  )
}

function Kpi({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-brand-border bg-brand-card p-5">
      <p className="text-xs tracking-wide text-slate-400 uppercase">{label}</p>
      <div className="mt-2 flex items-center text-xl font-semibold">{children}</div>
    </div>
  )
}
