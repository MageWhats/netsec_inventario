import {
  AlertTriangle,
  ArrowDownRight,
  ArrowDownToLine,
  ArrowLeftRight,
  ArrowUpFromLine,
  ArrowUpRight,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  PackageCheck,
  PackageX,
  ShieldAlert,
  ShoppingCart,
  TrendingUp,
  type LucideIcon,
} from 'lucide-react'
import { useMemo, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { EstadoVacio } from '@/components/ui/EstadoVacio'
import { LoadingBlock } from '@/components/ui/LoadingBlock'
import { PageHeader } from '@/components/ui/PageHeader'
import { usePerfil, usePermisos } from '@/features/auth/permisos'
import { estaAtrasada, formatearOrden, useOrdenes } from '@/features/compras/api'
import { useTomas } from '@/features/inventario/api'
import { fechaIso } from '@/lib/exportar'
import { mensajeError } from '@/lib/errores'
import { formatearPrecio, formatearPrecioCompacto } from '@/lib/format'
import { useMovimientos } from '@/features/movimientos/api'
import { MovimientosTabla } from '@/features/movimientos/components/MovimientosTabla'
import { useProductos, type Producto } from '@/features/productos/api'
import { StockBadge } from '@/features/productos/components/badges'
import { formatearValor, useConfiguracionContable, useEstadoResultados } from '@/features/contabilidad/api'
import { useCuentasTesoreria, useEdades } from '@/features/tesoreria/api'
import { useMasVendidosDelMes, useResumenMensual, useUnidadesEnGarantia } from './api'
import { MovimientosPorMesChart, ValorPorCategoriaChart, type ValorCategoria } from './components/graficas'

/** Categorías que se muestran por separado; el resto se agrupa en "Otras" */
const MAX_CATEGORIAS = 7

export function DashboardPage() {
  const productos = useProductos()
  const resumen = useResumenMensual(6)
  const recientes = useMovimientos({ limite: 6 })
  const { puedeOperar, verCostos, verContabilidad } = usePermisos()
  const { data: perfil } = usePerfil()
  const tomas = useTomas()
  const ordenesAbiertas = useOrdenes('abierta', verCostos)
  const enGarantia = useUnidadesEnGarantia()
  const masVendidos = useMasVendidosDelMes()

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
  const hoy = new Date()
  const inicioMes = fechaIso(new Date(hoy.getFullYear(), hoy.getMonth(), 1))

  // Lo que conviene atender hoy: cada aviso lleva a la lista donde se resuelve
  const sinStock = porReponer.filter((p) => p.stock <= 0).length
  const bajoMinimo = porReponer.length - sinStock
  const tomaEnCurso = tomas.data?.find((t) => t.estado === 'en_curso')
  const ordenes = ordenesAbiertas.data ?? []
  const atrasadas = ordenes.filter(estaAtrasada)
  const candidatos: (Aviso | false | undefined)[] = [
    sinStock > 0 && {
      icono: PackageX,
      tono: 'rojo',
      valor: sinStock,
      texto: sinStock === 1 ? 'producto sin stock' : 'productos sin stock',
      to: '/productos?stock=bajo',
    },
    bajoMinimo > 0 && {
      icono: AlertTriangle,
      tono: 'ambar',
      valor: bajoMinimo,
      texto: 'en o bajo el stock mínimo',
      to: '/productos?stock=bajo',
    },
    tomaEnCurso && {
      icono: ClipboardCheck,
      tono: 'azul',
      valor: `#${tomaEnCurso.numero}`,
      texto: `toma en curso · ${tomaEnCurso.contados} de ${tomaEnCurso.productos} contados`,
      to: `/inventario/${tomaEnCurso.id}`,
    },
    atrasadas.length > 0 && {
      icono: ShoppingCart,
      tono: 'rojo',
      valor: atrasadas.length,
      texto:
        atrasadas.length === 1 ? `orden atrasada (${formatearOrden(atrasadas[0]!)})` : 'órdenes de compra atrasadas',
      to: atrasadas.length === 1 ? `/compras/${atrasadas[0]!.id}` : '/compras',
    },
    ordenes.length > atrasadas.length && {
      icono: PackageCheck,
      tono: 'azul',
      valor: ordenes.length - atrasadas.length,
      texto: 'órdenes de compra por recibir',
      to: '/compras',
    },
    (enGarantia.data ?? 0) > 0 && {
      icono: ShieldAlert,
      tono: 'ambar',
      valor: enGarantia.data!,
      texto: enGarantia.data === 1 ? 'unidad en garantía' : 'unidades en garantía',
      to: '/seriales?estado=en_garantia',
    },
  ]
  const avisos = candidatos.filter((a): a is Aviso => Boolean(a))
  const cargandoAvisos = productos.isLoading || tomas.isLoading || enGarantia.isLoading

  return (
    <>
      <PageHeader
        title={saludo(perfil?.nombre)}
        description={new Intl.DateTimeFormat('es-CO', { weekday: 'long', day: 'numeric', month: 'long' }).format(hoy)}
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
            to="/reportes"
          />
        )}
        <StatTile
          label="Unidades en stock"
          cargando={productos.isLoading}
          valor={unidadesEnStock.toLocaleString('es-CO')}
          detalle={`${activos.filter((p) => p.stock > 0).length} de ${activos.length} productos con existencias`}
          to="/productos"
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
          to={`/movimientos?tipo=salida&desde=${inicioMes}`}
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

      <section className="mb-6" aria-label="Requiere atención">
        <h2 className="mb-3 text-sm font-medium text-slate-400">Requiere atención</h2>
        {cargandoAvisos ? (
          <div className="h-16 animate-pulse rounded-2xl bg-tinte/5" />
        ) : avisos.length === 0 ? (
          <div className="flex items-center gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-5 py-4 text-sm text-emerald-400">
            <CheckCircle2 className="size-5 shrink-0" />
            Todo en orden: no hay productos por reponer, tomas abiertas ni pendientes.
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {avisos.map((a) => (
              <AvisoCard key={a.texto} {...a} />
            ))}
          </div>
        )}
      </section>

      {verContabilidad && <TableroFinanciero />}

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
            <EstadoVacio
              compacto
              icono={CheckCircle2}
              titulo="Nada por reponer"
              descripcion="Todos los productos activos están por encima de su stock mínimo."
            />
          ) : (
            <ul className="divide-y divide-brand-border">
              {porReponer.slice(0, 6).map((p) => (
                <li key={p.id}>
                  <Link
                    to={`/productos/${p.id}`}
                    className="flex items-center gap-3 px-5 py-3 transition hover:bg-tinte/[0.03]"
                  >
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
            <EstadoVacio
              compacto
              icono={ArrowLeftRight}
              titulo="Sin movimientos todavía"
              descripcion="Las entradas, salidas y ajustes que registres aparecerán aquí."
              accion={
                puedeOperar && (
                  <Link to="/movimientos/nuevo/entrada" className="btn btn-primary">
                    <ArrowDownToLine className="size-4" />
                    Registrar la primera entrada
                  </Link>
                )
              }
            />
          )}
        </Tarjeta>
      </div>

      <Tarjeta className="mt-4" titulo="Más vendidos del mes" enlace={`/movimientos?tipo=salida&desde=${inicioMes}`}>
        {masVendidos.isLoading ? (
          <LoadingBlock />
        ) : masVendidos.error ? (
          <p className="px-5 pb-5 text-sm text-red-400">{mensajeError(masVendidos.error)}</p>
        ) : !masVendidos.data?.length ? (
          <EstadoVacio
            compacto
            icono={TrendingUp}
            titulo="Aún no hay ventas este mes"
            descripcion="Cuando registres salidas, aquí verás los productos que más se venden."
          />
        ) : (
          <ol className="grid gap-x-8 px-5 pb-5 md:grid-cols-2">
            {masVendidos.data.map((p, i, lista) => (
              <li key={p.id}>
                <Link to={`/productos/${p.id}`} className="group flex items-center gap-3 py-2.5">
                  <span className="w-5 text-right font-display text-sm font-semibold text-slate-500">{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="truncate text-sm font-medium group-hover:text-brand-cyan">{p.nombre}</p>
                      <span className="text-xs whitespace-nowrap text-slate-400">
                        {p.unidades} und. · {formatearPrecioCompacto(p.total)}
                      </span>
                    </div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-tinte/5">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-brand-accent to-brand-cyan"
                        style={{ width: `${(p.unidades / lista[0]!.unidades) * 100}%` }}
                      />
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ol>
        )}
      </Tarjeta>
    </>
  )
}

/** "Buenos días, Johan" según la hora (sin nombre si el perfil solo tiene el correo) */
function saludo(nombre: string | null | undefined) {
  const hora = new Date().getHours()
  const momento = hora < 12 ? 'Buenos días' : hora < 19 ? 'Buenas tardes' : 'Buenas noches'
  const primerNombre = nombre && !nombre.includes('@') ? nombre.trim().split(/\s+/)[0] : null
  return primerNombre ? `${momento}, ${primerNombre}` : momento
}

type Tono = 'rojo' | 'ambar' | 'azul'

interface Aviso {
  icono: LucideIcon
  tono: Tono
  valor: ReactNode
  texto: string
  to: string
}

const TONOS: Record<Tono, { borde: string; icono: string }> = {
  rojo: { borde: 'border-red-500/30', icono: 'bg-red-500/10 text-red-400' },
  ambar: { borde: 'border-amber-500/30', icono: 'bg-amber-500/10 text-amber-400' },
  azul: { borde: 'border-brand-accent/40', icono: 'bg-brand-accent/15 text-brand-cyan' },
}

function AvisoCard({ icono: Icono, tono, valor, texto, to }: Aviso) {
  return (
    <Link
      to={to}
      className={`group flex items-center gap-4 rounded-2xl border bg-brand-card px-4 py-3 transition hover:bg-tinte/[0.03] ${TONOS[tono].borde}`}
    >
      <span className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${TONOS[tono].icono}`}>
        <Icono className="size-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-display text-xl leading-tight font-semibold">{valor}</span>
        <span className="block truncate text-sm text-slate-400">{texto}</span>
      </span>
      <ChevronRight className="size-4 shrink-0 text-slate-500 transition group-hover:translate-x-0.5" />
    </Link>
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
// Tablero financiero (desde la contabilidad): solo cuando ya arrancó
// ---------------------------------------------------------------------
function TableroFinanciero() {
  const config = useConfiguracionContable()
  const arranco = Boolean(config.data?.fecha_inicio)
  const hoy = new Date()
  const inicioMes = fechaIso(new Date(hoy.getFullYear(), hoy.getMonth(), 1))
  const cuentas = useCuentasTesoreria()
  const clientes = useEdades('1305')
  const proveedores = useEdades('2205')
  const resultados = useEstadoResultados(inicioMes, fechaIso(hoy))
  if (!arranco) return null

  const disponible = (cuentas.data ?? []).filter((c) => c.activa).reduce((s, c) => s + Number(c.saldo), 0)
  const suma = (filas: typeof clientes.data, campo: 'total' | 'al_dia') =>
    (filas ?? []).reduce((s, f) => s + Number(f[campo] ?? 0), 0)
  const vencida = suma(clientes.data, 'total') - suma(clientes.data, 'al_dia')
  const porPagar = suma(proveedores.data, 'total')
  const valor = (codigo: string) => Number(resultados.data?.find((f) => f.codigo === codigo)?.valor ?? 0)
  const utilidad = valor('4') - valor('5') - valor('6')

  return (
    <section className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4" aria-label="Finanzas">
      <StatTile label="Dinero disponible" valor={formatearValor(disponible)} detalle="Cajas y bancos" cargando={cuentas.isLoading} to="/tesoreria" />
      <StatTile
        label="Cartera vencida"
        valor={formatearValor(vencida)}
        detalle={`De ${formatearValor(suma(clientes.data, 'total'))} por cobrar`}
        alerta={vencida > 0}
        cargando={clientes.isLoading}
        to="/tesoreria?t=edades"
      />
      <StatTile
        label="Por pagar a proveedores"
        valor={formatearValor(porPagar)}
        detalle={`${formatearValor(porPagar - suma(proveedores.data, 'al_dia'))} vencido`}
        cargando={proveedores.isLoading}
        to="/tesoreria?t=edades"
      />
      <StatTile
        label="Utilidad del mes"
        valor={<span className={utilidad < 0 ? 'text-red-400' : ''}>{formatearValor(utilidad)}</span>}
        detalle={`Ingresos ${formatearValor(valor('4'))}`}
        cargando={resultados.isLoading}
        to="/contabilidad?t=estados"
      />
    </section>
  )
}

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
        <div className="mt-3 h-8 w-24 animate-pulse rounded-md bg-tinte/5" />
      ) : (
        <p className="mt-2 font-display text-2xl font-semibold sm:text-3xl">{valor}</p>
      )}
      {detalle && !cargando && <p className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-slate-400">{detalle}</p>}
    </>
  )

  const clases = `rounded-2xl border bg-brand-card p-5 ${alerta ? 'border-amber-500/40' : 'border-brand-border'}`
  return to ? (
    <Link to={to} className={`${clases} block transition hover:bg-tinte/[0.03]`}>
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
