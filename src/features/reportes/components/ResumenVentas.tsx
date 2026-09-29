import { useMemo } from 'react'
import { Banknote, Package, PiggyBank, Receipt } from 'lucide-react'
import { formatearPrecio } from '@/lib/format'
import type { LineaMovimiento } from '../api'
import { num, porcentaje } from '../cifras'
import { describirRango, type Rango } from '../rangos'
import { BarraProporcion, GraficoActividad, Ranking, Variacion, type ItemRanking } from './resumen'
import { Cifra } from './TablaReporte'

const SERIES_VENTAS = [
  { label: 'Costo', color: 'bg-slate-500' },
  { label: 'Margen', color: 'bg-emerald-600' },
]

const totalLinea = (l: LineaMovimiento) => l.cantidad * (l.precio_unitario ?? 0)
/** Costo guardado en la salida (o el costo actual, si una línea antigua no lo tiene) */
const costoLinea = (l: LineaMovimiento) => l.cantidad * (l.costo_unitario ?? l.producto.precio_costo)

function totales(lineas: LineaMovimiento[]) {
  let total = 0
  let costo = 0
  let unidades = 0
  for (const l of lineas) {
    total += totalLinea(l)
    costo += costoLinea(l)
    unidades += l.cantidad
  }
  const ventas = new Set(lineas.map((l) => l.movimiento.id)).size
  return { total, costo, margen: total - costo, unidades, ventas, ticket: ventas > 0 ? total / ventas : 0 }
}

/** Los tres primeros de una agrupación por total vendido */
function top(lineas: LineaMovimiento[], clave: (l: LineaMovimiento) => { id: string; nombre: string; ruta?: string }) {
  const grupos = new Map<string, ItemRanking & { ventas: Set<string>; unidades: number }>()
  for (const l of lineas) {
    const { id, nombre, ruta } = clave(l)
    const g = grupos.get(id) ?? { clave: id, nombre, ruta, valor: 0, texto: '', ventas: new Set<string>(), unidades: 0 }
    g.valor += totalLinea(l)
    g.unidades += l.cantidad
    g.ventas.add(l.movimiento.id)
    grupos.set(id, g)
  }
  return [...grupos.values()]
    .sort((a, b) => b.valor - a.valor)
    .slice(0, 3)
    .map((g) => ({
      ...g,
      texto: formatearPrecio(g.valor),
      title: `${g.nombre}: ${formatearPrecio(g.valor)} · ${num(g.unidades)} unidades en ${num(g.ventas.size)} ${g.ventas.size === 1 ? 'venta' : 'ventas'}`,
    }))
}

interface ResumenVentasProps {
  lineas: LineaMovimiento[]
  /** Ventas del período anterior (para comparar); undefined mientras cargan */
  anteriores?: LineaMovimiento[]
  rango: Rango
  rangoPrevio: Rango
}

/** Tarjetas de resumen del reporte de ventas */
export function ResumenVentas({ lineas, anteriores, rango, rangoPrevio }: ResumenVentasProps) {
  const r = useMemo(() => totales(lineas), [lineas])
  const previo = useMemo(() => anteriores && totales(anteriores), [anteriores])
  const periodoPrevio = describirRango(rangoPrevio)

  const extra = useMemo(() => {
    const clientes = new Set(lineas.map((l) => l.movimiento.cliente?.id ?? 'consumidor-final'))
    return {
      clientes: clientes.size,
      productos: new Set(lineas.map((l) => l.producto.id)).size,
      topProductos: top(lineas, (l) => ({ id: l.producto.id, nombre: l.producto.nombre, ruta: `/productos/${l.producto.id}` })),
      topClientes: top(lineas, ({ movimiento: { cliente } }) =>
        cliente
          ? { id: cliente.id, nombre: cliente.nombre, ruta: `/clientes/${cliente.id}` }
          : { id: 'consumidor-final', nombre: 'Consumidor final' },
      ),
    }
  }, [lineas])

  const puntos = useMemo(
    () =>
      lineas.map((l) => {
        const total = totalLinea(l)
        const costo = costoLinea(l)
        return { fecha: l.movimiento.fecha, valores: [costo, total - costo] }
      }),
    [lineas],
  )

  return (
    <>
      <Cifra
        label="Total vendido"
        valor={formatearPrecio(r.total)}
        detalle={`Ticket promedio ${formatearPrecio(r.ticket)}`}
        icono={Banknote}
        tono="bg-emerald-600/15 text-emerald-400"
      >
        <Variacion actual={r.total} anterior={previo?.total} periodo={periodoPrevio} formato={formatearPrecio} />
      </Cifra>
      <Cifra
        label="Ventas (salidas)"
        valor={num(r.ventas)}
        detalle={`${num(extra.clientes)} ${extra.clientes === 1 ? 'cliente' : 'clientes'}`}
        icono={Receipt}
        tono="bg-brand-cyan/15 text-brand-cyan"
      >
        <Variacion actual={r.ventas} anterior={previo?.ventas} periodo={periodoPrevio} />
      </Cifra>
      <Cifra
        label="Unidades vendidas"
        valor={num(r.unidades)}
        detalle={`${num(extra.productos)} ${extra.productos === 1 ? 'producto distinto' : 'productos distintos'}`}
        icono={Package}
        tono="bg-amber-500/15 text-amber-400"
      >
        <Variacion actual={r.unidades} anterior={previo?.unidades} periodo={periodoPrevio} />
      </Cifra>
      <Cifra
        label="Margen"
        valor={<span className={r.margen < 0 ? 'text-red-400' : ''}>{formatearPrecio(r.margen)}</span>}
        detalle={`${porcentaje(r.margen, r.total)} sobre lo vendido · costo ${formatearPrecio(r.costo)}`}
        icono={PiggyBank}
        tono="bg-violet-500/15 text-violet-400"
      >
        <BarraProporcion
          a={r.costo}
          b={r.margen}
          colorA="bg-slate-500"
          colorB="bg-emerald-600"
          title={`Costo ${formatearPrecio(r.costo)} · Margen ${formatearPrecio(r.margen)}`}
        />
        <Variacion actual={r.margen} anterior={previo?.margen} periodo={periodoPrevio} formato={formatearPrecio} />
      </Cifra>

      <Ranking titulo="Productos más vendidos" items={extra.topProductos} color="bg-emerald-600" />
      <Ranking titulo="Mejores clientes" items={extra.topClientes} color="bg-brand-cyan" />
      <GraficoActividad
        titulo="Ventas"
        rango={rango}
        series={SERIES_VENTAS}
        modo="apilado"
        puntos={puntos}
        formato={formatearPrecio}
        etiquetaTotal="Vendido"
      />
    </>
  )
}
