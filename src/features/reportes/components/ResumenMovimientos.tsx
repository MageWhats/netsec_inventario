import { useMemo } from 'react'
import { ArrowDownToLine, ArrowUpFromLine, FileText, Package, Scale } from 'lucide-react'
import { formatearPrecio } from '@/lib/format'
import { TIPOS_MOVIMIENTO, tiposMovimiento, type TipoMovimiento } from '@/features/movimientos/tipos'
import { valorUnitario, type LineaMovimiento } from '../api'
import { num } from '../cifras'
import { describirRango, type Rango } from '../rangos'
import { BarraProporcion, GraficoActividad, Ranking, Variacion } from './resumen'
import { Cifra } from './TablaReporte'

const SERIES_ACTIVIDAD = [
  { label: 'Entran', color: 'bg-emerald-600' },
  { label: 'Salen', color: 'bg-blue-500' },
]
const esEntrada = (l: LineaMovimiento) => tiposMovimiento[l.movimiento.tipo].esEntrada

function totales(filas: LineaMovimiento[]) {
  const porTipo = new Map<TipoMovimiento, Set<string>>()
  let entran = 0
  let salen = 0
  let valorEntra = 0
  let valorSale = 0
  for (const l of filas) {
    const t = l.movimiento.tipo
    if (!porTipo.has(t)) porTipo.set(t, new Set())
    porTipo.get(t)!.add(l.movimiento.id)
    const valor = l.cantidad * (valorUnitario(l) ?? 0)
    if (esEntrada(l)) {
      entran += l.cantidad
      valorEntra += valor
    } else {
      salen += l.cantidad
      valorSale += valor
    }
  }
  const movimientos = new Set(filas.map((l) => l.movimiento.id)).size
  return { porTipo, movimientos, entran, salen, valorEntra, valorSale, neto: entran - salen }
}

interface ResumenMovimientosProps {
  filas: LineaMovimiento[]
  /** Líneas del período anterior (para comparar); undefined mientras cargan */
  anteriores?: LineaMovimiento[]
  rango: Rango
  rangoPrevio: Rango
  tipo: TipoMovimiento | ''
  onTipo: (tipo: TipoMovimiento | '') => void
}

/** Tarjetas de resumen del reporte de movimientos */
export function ResumenMovimientos({ filas, anteriores, rango, rangoPrevio, tipo, onTipo }: ResumenMovimientosProps) {
  const r = useMemo(() => totales(filas), [filas])
  const previo = useMemo(() => anteriores && totales(anteriores), [anteriores])
  const periodoPrevio = describirRango(rangoPrevio)

  const productos = useMemo(() => {
    const porProducto = new Map<string, { id: string; nombre: string; unidades: number; movimientos: Set<string> }>()
    for (const l of filas) {
      const p = porProducto.get(l.producto.id) ?? {
        id: l.producto.id,
        nombre: l.producto.nombre,
        unidades: 0,
        movimientos: new Set<string>(),
      }
      p.unidades += l.cantidad
      p.movimientos.add(l.movimiento.id)
      porProducto.set(l.producto.id, p)
    }
    return {
      distintos: porProducto.size,
      seriales: filas.filter((l) => l.unidad).length,
      top: [...porProducto.values()].sort((a, b) => b.unidades - a.unidades).slice(0, 3),
    }
  }, [filas])

  const puntos = useMemo(
    () => filas.map((l) => ({ fecha: l.movimiento.fecha, valores: esEntrada(l) ? [l.cantidad, 0] : [0, l.cantidad] })),
    [filas],
  )

  return (
    <>
      <Cifra
        label="Movimientos"
        valor={num(r.movimientos)}
        detalle={`${num(filas.length)} ${filas.length === 1 ? 'línea' : 'líneas'}`}
        icono={FileText}
        tono="bg-brand-cyan/15 text-brand-cyan"
      >
        <div className="flex flex-wrap gap-1.5">
          {TIPOS_MOVIMIENTO.filter((t) => r.porTipo.has(t)).map((t) => {
            const { label, icono: Icono, clase } = tiposMovimiento[t]
            return (
              <button
                key={t}
                type="button"
                onClick={() => onTipo(tipo === t ? '' : t)}
                title={tipo === t ? 'Quitar filtro' : `Ver solo ${label.toLowerCase()}`}
                className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium transition hover:brightness-125 ${clase} ${tipo === t ? 'ring-1 ring-current' : ''}`}
              >
                <Icono className="size-3" />
                {r.porTipo.get(t)!.size} {label}
              </button>
            )
          })}
        </div>
        <Variacion actual={r.movimientos} anterior={previo?.movimientos} periodo={periodoPrevio} />
      </Cifra>
      <Cifra
        label="Unidades que entran"
        valor={num(r.entran)}
        detalle={`${formatearPrecio(r.valorEntra)} a costo`}
        icono={ArrowDownToLine}
        tono="bg-emerald-600/15 text-emerald-400"
      >
        <Variacion actual={r.entran} anterior={previo?.entran} periodo={periodoPrevio} />
      </Cifra>
      <Cifra
        label="Unidades que salen"
        valor={num(r.salen)}
        detalle={`${formatearPrecio(r.valorSale)} (ventas a precio, ajustes a costo)`}
        icono={ArrowUpFromLine}
        tono="bg-blue-500/15 text-blue-400"
      >
        <Variacion actual={r.salen} anterior={previo?.salen} periodo={periodoPrevio} />
      </Cifra>
      <Cifra
        label="Balance neto"
        valor={
          <span className={r.neto > 0 ? 'text-emerald-400' : r.neto < 0 ? 'text-red-400' : ''}>
            {r.neto > 0 ? '+' : ''}
            {num(r.neto)} {Math.abs(r.neto) === 1 ? 'unidad' : 'unidades'}
          </span>
        }
        detalle={r.neto >= 0 ? 'El inventario crece en el período' : 'El inventario baja en el período'}
        icono={Scale}
        tono="bg-violet-500/15 text-violet-400"
      >
        <BarraProporcion
          a={r.entran}
          b={r.salen}
          colorA="bg-emerald-600"
          colorB="bg-blue-500"
          title={`Entran ${num(r.entran)} · Salen ${num(r.salen)}`}
        />
      </Cifra>

      <Cifra
        label="Productos distintos"
        valor={num(productos.distintos)}
        detalle={`${num(productos.seriales)} ${productos.seriales === 1 ? 'serial movido' : 'seriales movidos'}`}
        icono={Package}
        tono="bg-amber-500/15 text-amber-400"
      />
      <Ranking
        titulo="Más movidos"
        items={productos.top.map((p) => ({
          clave: p.id,
          nombre: p.nombre,
          valor: p.unidades,
          texto: num(p.unidades),
          title: `${p.nombre}: ${num(p.unidades)} unidades en ${p.movimientos.size} movimientos`,
          ruta: `/productos/${p.id}`,
        }))}
      />
      <GraficoActividad
        titulo="Actividad"
        rango={rango}
        series={SERIES_ACTIVIDAD}
        modo="espejo"
        puntos={puntos}
      />
    </>
  )
}
