import { AlertTriangle, ArrowDownToLine, ArrowDownRight, ArrowUpFromLine, ArrowUpRight, ChevronRight } from 'lucide-react'
import { useMemo, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { LoadingBlock } from '@/components/ui/LoadingBlock'
import { PageHeader } from '@/components/ui/PageHeader'
import { usePermisos } from '@/features/auth/permisos'
import { mensajeError } from '@/lib/errores'
import { formatearPrecio, formatearPrecioCompacto } from '@/lib/format'
import { useMovimientos } from '@/features/movimientos/api'
import { MovimientosTabla } from '@/features/movimientos/components/MovimientosTabla'
import { useProductos, type Producto } from '@/features/productos/api'
import { StockBadge } from '@/features/productos/components/badges'
import { useResumenMensual } from './api'
import { MovimientosPorMesChart, ValorPorCategoriaChart, type ValorCategoria } from './components/graficas'

/** Categorías que se muestran por separado; el resto se agrupa en "Otras" */
const MAX_CATEGORIAS = 7

export function DashboardPage() {
  const productos = useProductos()
  const resumen = useResumenMensual(6)
  const recientes = useMovimientos({ limite: 6 })
  const { puedeOperar, verCostos } = usePermisos()

  const activos = useMemo(() => (productos.data ?? []).filter((p) => p.activo), [productos.data])
  const porReponer = useMemo(
    () => activos.filter((p) => p.stock <= p.stock_minimo).sort((a, b) => a.stock - a.stock_minimo - (b.stock - b.stock_minimo)),
    [activos],
  )
  const valorPorCategoria = useMemo(() => agruparPorCategoria(activos), [activos])

  const valorInventario = valorPorCategoria.reduce((total, c) => total + c.valor, 0)
  const unidadesEnStock = activos.reduce((total, p) => total + Math.max(p.stock, 0), 0)
  const meses = resumen.data ?? []
  const mesActual = meses.at(-1)
  const mesAnterior = meses.at(-2)

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Resumen del inventario"
        actions={
          puedeOperar && (
            <div className="flex gap-2">
              <Link to="/movimientos/nuevo/entrada" className="btn btn-secondary">
                <ArrowDownToLine className="size-4" />
                Nueva entrada
              </Link>
              <Link to="/movimientos/nuevo/salida" className="btn btn-primary">
                <ArrowUpFromLine className="size-4" />
                Nueva salida
              </Link>
            </div>
          )
        }
      />

      {productos.error && <ErrorBox error={productos.error} />}

      <div className={`mb-6 grid grid-cols-2 gap-4 ${verCostos ? 'lg:grid-cols-4' : 'lg:grid-cols-3'}`}>
        {verCostos && (
          <StatTile
            label="Valor del inventario"
            cargando={productos.isLoading}
            valor={formatearPrecioCompacto(valorInventario)}
            detalle={`${formatearPrecio(valorInventario)} a precio de costo`}
          />
        )}
        <StatTile
          label="Unidades en stock"
          cargando={productos.isLoading}
          valor={unidadesEnStock.toLocaleString('es-CO')}
          detalle={`${activos.filter((p) => p.stock > 0).length} de ${activos.length} productos con existencias`}
        />
        <StatTile
          label="Ventas del mes"
          cargando={resumen.isLoading}
          valor={formatearPrecioCompacto(mesActual?.ventas ?? 0)}
          detalle={
            mesActual && (
              <>
                {mesActual.numeroVentas} {mesActual.numeroVentas === 1 ? 'salida' : 'salidas'}
                {mesAnterior && <Variacion actual={mesActual.ventas} anterior={mesAnterior.ventas} />}
              </>
            )
          }
        />
        <StatTile
          label="Productos por reponer"
          cargando={productos.isLoading}
          valor={porReponer.length}
          alerta={porReponer.length > 0}
          detalle={porReponer.length > 0 ? 'En o por debajo del stock mínimo' : 'Todo por encima del mínimo'}
          to={porReponer.length > 0 ? '/productos?stock=bajo' : undefined}
        />
      </div>

      <div className="mb-6 grid gap-4 lg:grid-cols-5">
        {resumen.isLoading ? (
          <Tarjeta className="lg:col-span-3">
            <LoadingBlock />
          </Tarjeta>
        ) : resumen.error ? (
          <ErrorBox error={resumen.error} className="lg:col-span-3" />
        ) : (
          <MovimientosPorMesChart meses={meses} className={verCostos ? 'lg:col-span-3' : 'lg:col-span-5'} />
        )}
        {verCostos &&
          (productos.isLoading ? (
            <Tarjeta className="lg:col-span-2">
              <LoadingBlock />
            </Tarjeta>
          ) : (
            <ValorPorCategoriaChart datos={valorPorCategoria} className="lg:col-span-2" />
          ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <Tarjeta className="lg:col-span-2" titulo="Por reponer" enlace={porReponer.length > 0 ? '/productos?stock=bajo' : undefined}>
          {productos.isLoading ? (
            <LoadingBlock />
          ) : porReponer.length === 0 ? (
            <p className="px-5 pb-5 text-sm text-slate-500">Todos los productos activos están por encima de su stock mínimo.</p>
          ) : (
            <ul className="divide-y divide-brand-border">
              {porReponer.slice(0, 6).map((p) => (
                <li key={p.id}>
                  <Link to={`/productos/${p.id}`} className="flex items-center gap-3 px-5 py-3 transition hover:bg-white/[0.03]">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{p.nombre}</p>
                      <p className="font-mono text-xs text-slate-500">{p.sku}</p>
                    </div>
                    <span className="text-xs whitespace-nowrap text-slate-500">mín. {p.stock_minimo}</span>
                    <StockBadge stock={p.stock} minimo={p.stock_minimo} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Tarjeta>

        <Tarjeta className="lg:col-span-3" titulo="Últimos movimientos" enlace="/movimientos">
          {recientes.isLoading ? (
            <LoadingBlock />
          ) : recientes.error ? (
            <p className="px-5 pb-5 text-sm text-red-400">{mensajeError(recientes.error)}</p>
          ) : recientes.data?.movimientos.length ? (
            <MovimientosTabla movimientos={recientes.data.movimientos} />
          ) : (
            <p className="px-5 pb-5 text-sm text-slate-500">Todavía no hay movimientos registrados.</p>
          )}
        </Tarjeta>
      </div>
    </>
  )
}

function agruparPorCategoria(productos: Producto[]): ValorCategoria[] {
  const valores = new Map<string, number>()
  for (const p of productos) {
    if (p.stock <= 0 || p.precio_costo <= 0) continue
    const nombre = p.categoria?.nombre ?? 'Sin categoría'
    valores.set(nombre, (valores.get(nombre) ?? 0) + p.stock * p.precio_costo)
  }

  const ordenadas = [...valores].map(([nombre, valor]) => ({ nombre, valor })).sort((a, b) => b.valor - a.valor)
  if (ordenadas.length <= MAX_CATEGORIAS + 1) return ordenadas

  const otras = ordenadas.slice(MAX_CATEGORIAS).reduce((total, c) => total + c.valor, 0)
  return [...ordenadas.slice(0, MAX_CATEGORIAS), { nombre: 'Otras', valor: otras }]
}

// ---------------------------------------------------------------------
// Piezas de la página
// ---------------------------------------------------------------------

interface StatTileProps {
  label: string
  valor: ReactNode
  detalle?: ReactNode
  cargando?: boolean
  alerta?: boolean
  to?: string
}

function StatTile({ label, valor, detalle, cargando, alerta, to }: StatTileProps) {
  const contenido = (
    <>
      <p className="flex items-center gap-1.5 text-xs tracking-wide text-slate-400 uppercase">
        {alerta && <AlertTriangle className="size-3.5 text-amber-400" aria-label="Atención" />}
        {label}
      </p>
      {cargando ? (
        <div className="mt-3 h-8 w-24 animate-pulse rounded-md bg-white/5" />
      ) : (
        <p className="mt-2 font-display text-2xl font-semibold sm:text-3xl">{valor}</p>
      )}
      {detalle && !cargando && <p className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-slate-400">{detalle}</p>}
    </>
  )

  const clases = `rounded-2xl border bg-brand-card p-5 ${alerta ? 'border-amber-500/40' : 'border-brand-border'}`
  return to ? (
    <Link to={to} className={`${clases} block transition hover:bg-white/[0.03]`}>
      {contenido}
    </Link>
  ) : (
    <div className={clases}>{contenido}</div>
  )
}

/** Cambio porcentual frente al mes anterior; subir es bueno */
function Variacion({ actual, anterior }: { actual: number; anterior: number }) {
  if (anterior === 0) return <span>sin ventas el mes anterior</span>

  const cambio = (actual - anterior) / anterior
  const sube = cambio >= 0
  const Icono = sube ? ArrowUpRight : ArrowDownRight
  return (
    <span className={`inline-flex items-center gap-0.5 ${sube ? 'text-emerald-400' : 'text-red-400'}`}>
      <Icono className="size-3.5" />
      {sube ? '+' : '−'}
      {Math.abs(cambio * 100).toFixed(0)} % vs. mes anterior
    </span>
  )
}

interface TarjetaProps {
  titulo?: string
  enlace?: string
  className?: string
  children: ReactNode
}

function Tarjeta({ titulo, enlace, className = '', children }: TarjetaProps) {
  return (
    <section className={`overflow-hidden rounded-2xl border border-brand-border bg-brand-card ${className}`}>
      {titulo && (
        <div className="flex items-center justify-between px-5 py-4">
          <h2 className="font-semibold">{titulo}</h2>
          {enlace && (
            <Link to={enlace} className="flex items-center text-xs text-slate-400 hover:text-brand-cyan">
              Ver todos
              <ChevronRight className="size-3.5" />
            </Link>
          )}
        </div>
      )}
      {children}
    </section>
  )
}

function ErrorBox({ error, className = '' }: { error: unknown; className?: string }) {
  return (
    <div className={`mb-6 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400 ${className}`}>
      {mensajeError(error)}
    </div>
  )
}
