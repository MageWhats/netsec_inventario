import { useMemo, useState } from 'react'
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  FileText,
  Minus,
  Package,
  Scale,
  TrendingDown,
  TrendingUp,
} from 'lucide-react'
import { formatearPrecio } from '@/lib/format'
import { fechaIso } from '@/lib/exportar'
import { TIPOS_MOVIMIENTO, tiposMovimiento, type TipoMovimiento } from '@/features/movimientos/tipos'
import { valorUnitario, type LineaMovimiento } from '../api'
import { describirRango, type Rango } from '../rangos'
import { Cifra } from './TablaReporte'

const num = (n: number) => n.toLocaleString('es-CO')
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
  const pctEntra = r.entran + r.salen > 0 ? (r.entran / (r.entran + r.salen)) * 100 : 0
  const periodoPrevio = describirRango(rangoPrevio)

  const productos = useMemo(() => {
    const porProducto = new Map<string, { nombre: string; unidades: number; movimientos: Set<string> }>()
    for (const l of filas) {
      const p = porProducto.get(l.producto.id) ?? { nombre: l.producto.nombre, unidades: 0, movimientos: new Set() }
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
        <div
          className="flex h-1.5 gap-0.5 overflow-hidden rounded-full bg-slate-500/20"
          title={`Entran ${num(r.entran)} · Salen ${num(r.salen)}`}
        >
          {r.entran > 0 && <div className="rounded-full bg-emerald-600" style={{ width: `${pctEntra}%` }} />}
          {r.salen > 0 && <div className="flex-1 rounded-full bg-blue-500" />}
        </div>
      </Cifra>

      <Cifra
        label="Productos distintos"
        valor={num(productos.distintos)}
        detalle={`${num(productos.seriales)} ${productos.seriales === 1 ? 'serial movido' : 'seriales movidos'}`}
        icono={Package}
        tono="bg-amber-500/15 text-amber-400"
      />
      <div className="rounded-2xl border border-brand-border bg-brand-card px-4 py-3">
        <p className="text-xs tracking-wide text-slate-400 uppercase">Más movidos</p>
        {productos.top.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">—</p>
        ) : (
          <ol className="mt-2 space-y-2">
            {productos.top.map((p) => (
              <li key={p.nombre} title={`${p.nombre}: ${num(p.unidades)} unidades en ${p.movimientos.size} movimientos`}>
                <div className="flex justify-between gap-2 text-xs">
                  <span className="truncate text-slate-300">{p.nombre}</span>
                  <span className="shrink-0 font-medium text-slate-200">{num(p.unidades)}</span>
                </div>
                <div className="mt-1 h-1 rounded-full bg-slate-500/20">
                  <div
                    className="h-full rounded-full bg-brand-cyan"
                    style={{ width: `${(p.unidades / (productos.top[0]?.unidades || 1)) * 100}%` }}
                  />
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>
      <Actividad filas={filas} rango={rango} />
    </>
  )
}

/** "▲ 12 % vs. período anterior" */
function Variacion({ actual, anterior, periodo }: { actual: number; anterior?: number; periodo: string }) {
  if (anterior === undefined) return <p className="mt-2 h-4 text-xs text-slate-500">…</p>
  const Icono = actual > anterior ? TrendingUp : actual < anterior ? TrendingDown : Minus
  const texto =
    anterior === 0
      ? actual === 0
        ? 'Igual'
        : 'Sin datos previos'
      : `${actual > anterior ? '+' : ''}${Math.round(((actual - anterior) / anterior) * 100)} %`
  return (
    <p className="mt-2 flex items-center gap-1 text-xs text-slate-400" title={`${periodo}: ${num(anterior)}`}>
      <Icono className="size-3.5" />
      <span className="font-medium text-slate-300">{texto}</span>
      <span className="text-slate-500">vs. período anterior ({num(anterior)})</span>
    </p>
  )
}

// ---------------------------------------------------------------------
// Actividad: unidades que entran (arriba) y salen (abajo) por día, semana o mes
// ---------------------------------------------------------------------

type Escala = 'día' | 'semana' | 'mes'

const fmtDia = new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short' })
const fmtDiaLargo = new Intl.DateTimeFormat('es-CO', { weekday: 'long', day: 'numeric', month: 'long' })
const fmtMes = new Intl.DateTimeFormat('es-CO', { month: 'short', year: 'numeric' })
const fmtMesLargo = new Intl.DateTimeFormat('es-CO', { month: 'long', year: 'numeric' })

function claveCubeta(fecha: Date, escala: Escala) {
  if (escala === 'mes') return `${fecha.getFullYear()}-${fecha.getMonth()}`
  if (escala === 'semana') {
    // Semanas de lunes a domingo
    const lunes = new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate() - ((fecha.getDay() + 6) % 7))
    return fechaIso(lunes)
  }
  return fechaIso(fecha)
}

interface Cubeta {
  clave: string
  corta: string
  larga: string
  entran: number
  salen: number
}

function Actividad({ filas, rango }: { filas: LineaMovimiento[]; rango: Rango }) {
  const [activa, setActiva] = useState<number | null>(null)

  const { cubetas, escala, maximo } = useMemo(() => {
    const desde = new Date(`${rango.desde}T00:00:00`)
    const hasta = new Date(`${rango.hasta}T00:00:00`)
    const dias = Math.round((hasta.getTime() - desde.getTime()) / 86_400_000) + 1
    const escala: Escala = dias <= 45 ? 'día' : dias <= 210 ? 'semana' : 'mes'

    const cubetas = new Map<string, Cubeta>()
    for (let d = new Date(desde); d <= hasta; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) {
      const clave = claveCubeta(d, escala)
      const existente = cubetas.get(clave)
      if (existente) {
        if (escala === 'semana') existente.larga = `Semana del ${existente.corta} al ${fmtDia.format(d)}`
        continue
      }
      cubetas.set(clave, {
        clave,
        corta: escala === 'mes' ? fmtMes.format(d) : fmtDia.format(d),
        larga:
          escala === 'mes' ? fmtMesLargo.format(d) : escala === 'semana' ? `Semana del ${fmtDia.format(d)}` : fmtDiaLargo.format(d),
        entran: 0,
        salen: 0,
      })
    }
    for (const l of filas) {
      const c = cubetas.get(claveCubeta(new Date(l.movimiento.fecha), escala))
      if (!c) continue
      if (esEntrada(l)) c.entran += l.cantidad
      else c.salen += l.cantidad
    }
    const lista = [...cubetas.values()]
    return { cubetas: lista, escala, maximo: Math.max(0, ...lista.map((c) => Math.max(c.entran, c.salen))) }
  }, [filas, rango])

  const alto = (v: number) => (v > 0 ? `max(2px, ${(v / maximo) * 100}%)` : '0')
  const sel = activa === null ? null : cubetas[activa]
  const alinear =
    activa === null ? '' : activa < cubetas.length / 4 ? 'left-0' : activa >= (cubetas.length * 3) / 4 ? 'right-0' : ''

  return (
    <div className="col-span-2 flex flex-col rounded-2xl border border-brand-border bg-brand-card px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs tracking-wide text-slate-400 uppercase">Actividad por {escala}</p>
        <div className="flex gap-3 text-xs text-slate-400">
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2 rounded-sm bg-emerald-600" />
            Entran
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2 rounded-sm bg-blue-500" />
            Salen
          </span>
        </div>
      </div>

      {maximo === 0 ? (
        <p className="grid flex-1 place-items-center py-6 text-sm text-slate-500">Sin actividad en el período</p>
      ) : (
        <div className="relative mt-3 flex-1">
          <div
            role="img"
            aria-label={`Unidades que entran y salen por ${escala}`}
            className="relative flex h-24 gap-0.5"
            onMouseLeave={() => setActiva(null)}
          >
            <div className="pointer-events-none absolute inset-x-0 top-1/2 h-px bg-slate-500/30" />
            {cubetas.map((c, i) => (
              <div
                key={c.clave}
                onMouseEnter={() => setActiva(i)}
                className={`flex flex-1 flex-col rounded-sm ${activa === i ? 'bg-slate-500/15' : ''}`}
              >
                <div className="flex flex-1 items-end pb-px">
                  <div className="w-full rounded-t-sm bg-emerald-600" style={{ height: alto(c.entran) }} />
                </div>
                <div className="flex flex-1 items-start pt-px">
                  <div className="w-full rounded-b-sm bg-blue-500" style={{ height: alto(c.salen) }} />
                </div>
              </div>
            ))}
          </div>
          <div className="mt-1 flex justify-between text-[11px] text-slate-500">
            <span>{cubetas[0]?.corta}</span>
            <span>{cubetas.at(-1)?.corta}</span>
          </div>

          {sel && (
            <div
              className={`pointer-events-none absolute bottom-full z-10 mb-1 rounded-lg border border-brand-border bg-brand-bg px-3 py-2 text-xs whitespace-nowrap shadow-lg ${alinear}`}
              style={alinear ? undefined : { left: `${((activa! + 0.5) / cubetas.length) * 100}%`, transform: 'translateX(-50%)' }}
            >
              <p className="mb-1 font-medium text-slate-200 first-letter:uppercase">{sel.larga}</p>
              <p className="flex items-center gap-1.5 text-slate-300">
                <span className="size-2 rounded-sm bg-emerald-600" />
                Entran {num(sel.entran)}
              </p>
              <p className="flex items-center gap-1.5 text-slate-300">
                <span className="size-2 rounded-sm bg-blue-500" />
                Salen {num(sel.salen)}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
