import { useMemo, useState } from 'react'
import { Boxes, CheckCircle2, Package, Tag, Wallet } from 'lucide-react'
import { formatearPrecio } from '@/lib/format'
import type { Producto } from '@/features/productos/api'
import { agotado, bajoMinimo, num, porcentaje, type FiltroExistencias } from '../cifras'
import { BarraProporcion, Ranking } from './resumen'
import { Cifra } from './TablaReporte'

const existencias = (p: Producto) => Math.max(p.stock, 0)
const valorCosto = (p: Producto) => existencias(p) * p.precio_costo
const valorVenta = (p: Producto) => existencias(p) * p.precio_venta

interface ResumenInventarioProps {
  /** Productos que se ven en la tabla */
  filas: Producto[]
  /** Productos activos de la categoría, sin filtrar por existencias (para las alertas) */
  base: Producto[]
  /** Si se filtró una categoría, la distribución se hace por producto */
  porProducto: boolean
  filtro: FiltroExistencias
  onFiltro: (filtro: FiltroExistencias) => void
}

/** Tarjetas de resumen del inventario valorizado */
export function ResumenInventario({ filas, base, porProducto, filtro, onFiltro }: ResumenInventarioProps) {
  const r = useMemo(() => {
    let unidades = 0
    let costo = 0
    let venta = 0
    for (const p of filas) {
      unidades += existencias(p)
      costo += valorCosto(p)
      venta += valorVenta(p)
    }
    return {
      unidades,
      costo,
      venta,
      margen: venta - costo,
      seriales: filas.filter((p) => p.es_serializado).length,
      categorias: new Set(filas.map((p) => p.categoria?.id ?? '')).size,
      sinCosto: filas.filter((p) => existencias(p) > 0 && p.precio_costo <= 0).length,
    }
  }, [filas])

  const alertas = useMemo(() => {
    const porReponer = base
      .filter((p) => p.stock_minimo > 0 && p.stock <= p.stock_minimo)
      .sort((a, b) => b.stock_minimo - b.stock - (a.stock_minimo - a.stock))
    return {
      bajo: base.filter(bajoMinimo).length,
      agotados: base.filter(agotado).length,
      porReponer: porReponer.slice(0, 3).map((p) => ({
        clave: p.id,
        nombre: p.nombre,
        valor: p.stock_minimo - p.stock,
        texto: `${num(p.stock)} / mín. ${num(p.stock_minimo)}`,
        title: `${p.nombre}: ${num(p.stock)} en bodega, mínimo ${num(p.stock_minimo)} (faltan ${num(p.stock_minimo - p.stock)})`,
        ruta: `/productos/${p.id}`,
      })),
    }
  }, [base])

  const mayorValor = useMemo(
    () =>
      [...filas]
        .sort((a, b) => valorCosto(b) - valorCosto(a))
        .slice(0, 3)
        .filter((p) => valorCosto(p) > 0)
        .map((p) => ({
          clave: p.id,
          nombre: p.nombre,
          valor: valorCosto(p),
          texto: formatearPrecio(valorCosto(p)),
          title: `${p.nombre}: ${num(existencias(p))} unidades · ${formatearPrecio(valorCosto(p))} a costo`,
          ruta: `/productos/${p.id}`,
        })),
    [filas],
  )

  const chip = (valor: FiltroExistencias, n: number, texto: string, clase: string) => (
    <button
      type="button"
      onClick={() => onFiltro(filtro === valor ? 'con' : valor)}
      title={filtro === valor ? 'Quitar filtro' : `Ver solo ${texto}`}
      className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium transition hover:brightness-125 ${clase} ${filtro === valor ? 'ring-1 ring-current' : ''}`}
    >
      {num(n)} {texto}
    </button>
  )

  return (
    <>
      <Cifra
        label="Productos"
        valor={num(filas.length)}
        detalle={`${num(r.seriales)} con serial · ${num(r.categorias)} ${r.categorias === 1 ? 'categoría' : 'categorías'}`}
        icono={Package}
        tono="bg-brand-cyan/15 text-brand-cyan"
      >
        <div className="flex flex-wrap gap-1.5">
          {chip('bajo', alertas.bajo, 'bajo mínimo', 'bg-amber-500/15 text-amber-400')}
          {chip('agotado', alertas.agotados, alertas.agotados === 1 ? 'agotado' : 'agotados', 'bg-red-500/15 text-red-400')}
        </div>
      </Cifra>
      <Cifra
        label="Unidades"
        valor={num(r.unidades)}
        detalle={filas.length > 0 ? `Promedio ${num(Math.round(r.unidades / filas.length))} por producto` : '—'}
        icono={Boxes}
        tono="bg-amber-500/15 text-amber-400"
      />
      <Cifra
        label="Valor a costo"
        valor={formatearPrecio(r.costo)}
        detalle={
          r.sinCosto > 0
            ? `${num(r.sinCosto)} ${r.sinCosto === 1 ? 'producto' : 'productos'} con existencias sin costo`
            : `Costo promedio ${formatearPrecio(r.unidades > 0 ? r.costo / r.unidades : 0)} por unidad`
        }
        icono={Wallet}
        tono="bg-slate-500/15 text-slate-300"
      />
      <Cifra
        label="Valor a precio venta"
        valor={formatearPrecio(r.venta)}
        detalle={`Margen potencial ${formatearPrecio(r.margen)} · ${porcentaje(r.margen, r.venta)}`}
        icono={Tag}
        tono="bg-violet-500/15 text-violet-400"
      >
        <BarraProporcion
          a={r.costo}
          b={r.margen}
          colorA="bg-slate-500"
          colorB="bg-emerald-600"
          title={`Costo ${formatearPrecio(r.costo)} · Margen potencial ${formatearPrecio(r.margen)}`}
        />
      </Cifra>

      <Ranking titulo="Mayor valor en bodega" items={mayorValor} color="bg-violet-500" />
      {alertas.porReponer.length > 0 ? (
        <Ranking titulo="Por reponer" items={alertas.porReponer} color="bg-amber-500" />
      ) : (
        <div className="flex flex-col rounded-2xl border border-brand-border bg-brand-card px-4 py-3">
          <p className="text-xs tracking-wide text-slate-400 uppercase">Por reponer</p>
          <p className="mt-2 flex items-center gap-1.5 text-sm text-emerald-400">
            <CheckCircle2 className="size-4" />
            Todo por encima del mínimo
          </p>
        </div>
      )}
      <Distribucion filas={filas} porProducto={porProducto} total={r.costo} />
    </>
  )
}

// ---------------------------------------------------------------------
// Distribución del valor a costo por categoría (o por producto)
// ---------------------------------------------------------------------

const COLORES = ['bg-brand-cyan', 'bg-violet-500', 'bg-amber-500', 'bg-emerald-600', 'bg-blue-500']
const COLOR_OTROS = 'bg-slate-500'

function Distribucion({ filas, porProducto, total }: { filas: Producto[]; porProducto: boolean; total: number }) {
  const [activa, setActiva] = useState<string | null>(null)

  const grupos = useMemo(() => {
    const mapa = new Map<string, { clave: string; nombre: string; valor: number; unidades: number }>()
    for (const p of filas) {
      const clave = porProducto ? p.id : (p.categoria?.id ?? 'sin-categoria')
      const nombre = porProducto ? p.nombre : (p.categoria?.nombre ?? 'Sin categoría')
      const g = mapa.get(clave) ?? { clave, nombre, valor: 0, unidades: 0 }
      g.valor += valorCosto(p)
      g.unidades += existencias(p)
      mapa.set(clave, g)
    }
    const lista = [...mapa.values()].filter((g) => g.valor > 0).sort((a, b) => b.valor - a.valor)
    const principales = lista.slice(0, COLORES.length).map((g, i) => ({ ...g, color: COLORES[i] ?? COLOR_OTROS }))
    const resto = lista.slice(COLORES.length)
    if (resto.length > 0)
      principales.push({
        clave: 'otros',
        nombre: `${porProducto ? 'Otros' : 'Otras'} (${resto.length})`,
        valor: resto.reduce((s, g) => s + g.valor, 0),
        unidades: resto.reduce((s, g) => s + g.unidades, 0),
        color: COLOR_OTROS,
      })
    return principales
  }, [filas, porProducto])

  return (
    <div className="col-span-2 flex flex-col rounded-2xl border border-brand-border bg-brand-card px-4 py-3">
      <p className="text-xs tracking-wide text-slate-400 uppercase">
        Valor a costo por {porProducto ? 'producto' : 'categoría'}
      </p>
      {grupos.length === 0 ? (
        <p className="grid flex-1 place-items-center py-6 text-sm text-slate-500">Sin existencias valorizadas</p>
      ) : (
        <>
          <div className="mt-3 flex h-3 gap-0.5 overflow-hidden rounded-full" onMouseLeave={() => setActiva(null)}>
            {grupos.map((g) => (
              <div
                key={g.clave}
                onMouseEnter={() => setActiva(g.clave)}
                title={`${g.nombre}: ${formatearPrecio(g.valor)} (${porcentaje(g.valor, total)})`}
                className={`${g.color} transition-opacity ${activa && activa !== g.clave ? 'opacity-40' : ''}`}
                style={{ width: `${(g.valor / total) * 100}%` }}
              />
            ))}
          </div>
          <ul className="mt-3 grid gap-x-4 gap-y-1.5 sm:grid-cols-2">
            {grupos.map((g) => (
              <li
                key={g.clave}
                onMouseEnter={() => setActiva(g.clave)}
                onMouseLeave={() => setActiva(null)}
                title={`${g.nombre}: ${num(g.unidades)} unidades · ${formatearPrecio(g.valor)}`}
                className={`flex items-center gap-2 text-xs transition-opacity ${activa && activa !== g.clave ? 'opacity-50' : ''}`}
              >
                <span className={`size-2 shrink-0 rounded-sm ${g.color}`} />
                <span className="truncate text-slate-300">{g.nombre}</span>
                <span className="ml-auto shrink-0 text-slate-500">{porcentaje(g.valor, total)}</span>
                <span className="w-24 shrink-0 text-right font-medium text-slate-200 tabular-nums">
                  {formatearPrecio(g.valor)}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
