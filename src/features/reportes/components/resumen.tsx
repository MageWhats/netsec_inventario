import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Minus, TrendingDown, TrendingUp } from 'lucide-react'
import { fechaIso } from '@/lib/exportar'
import { num } from '../cifras'
import type { Rango } from '../rangos'

/** Piezas comunes de las tarjetas de resumen de los reportes */

/** "▲ 12 % vs. período anterior" */
export function Variacion({
  actual,
  anterior,
  periodo,
  formato = num,
}: {
  actual: number
  /** undefined mientras carga el período anterior */
  anterior?: number
  periodo: string
  formato?: (n: number) => string
}) {
  if (anterior === undefined) return <p className="mt-2 h-4 text-xs text-slate-500">…</p>
  const Icono = actual > anterior ? TrendingUp : actual < anterior ? TrendingDown : Minus
  const texto =
    anterior === 0
      ? actual === 0
        ? 'Igual'
        : 'Sin datos previos'
      : `${actual > anterior ? '+' : ''}${Math.round(((actual - anterior) / Math.abs(anterior)) * 100)} %`
  return (
    <p className="mt-2 flex items-center gap-1 text-xs text-slate-400" title={`${periodo}: ${formato(anterior)}`}>
      <Icono className="size-3.5 shrink-0" />
      <span className="font-medium text-slate-300">{texto}</span>
      <span className="truncate text-slate-500">vs. período anterior ({formato(anterior)})</span>
    </p>
  )
}

/** Barra delgada partida en dos proporciones (p. ej. entran/salen o costo/margen) */
export function BarraProporcion({
  a,
  b,
  colorA,
  colorB,
  title,
}: {
  a: number
  b: number
  colorA: string
  colorB: string
  title?: string
}) {
  const pa = Math.max(a, 0)
  const pb = Math.max(b, 0)
  return (
    <div className="flex h-1.5 gap-0.5 overflow-hidden rounded-full bg-slate-500/20" title={title}>
      {pa > 0 && <div className={`rounded-full ${colorA}`} style={{ width: `${(pa / (pa + pb)) * 100}%` }} />}
      {pb > 0 && <div className={`flex-1 rounded-full ${colorB}`} />}
    </div>
  )
}

export interface ItemRanking {
  clave: string
  nombre: string
  /** Lo que define el largo de la barra */
  valor: number
  /** Cómo se muestra el valor */
  texto: string
  title?: string
  ruta?: string
}

/** Tarjeta con los primeros de una lista y una barra relativa al primero */
export function Ranking({ titulo, items, color = 'bg-brand-cyan' }: { titulo: string; items: ItemRanking[]; color?: string }) {
  const maximo = Math.max(0, ...items.map((i) => i.valor)) || 1
  return (
    <div className="rounded-2xl border border-brand-border bg-brand-card px-4 py-3">
      <p className="text-xs tracking-wide text-slate-400 uppercase">{titulo}</p>
      {items.length === 0 ? (
        <p className="mt-2 text-sm text-slate-500">—</p>
      ) : (
        <ol className="mt-2 space-y-2">
          {items.map((i) => (
            <li key={i.clave} title={i.title ?? `${i.nombre}: ${i.texto}`}>
              <div className="flex justify-between gap-2 text-xs">
                {i.ruta ? (
                  <Link to={i.ruta} className="truncate text-slate-300 hover:text-brand-cyan">
                    {i.nombre}
                  </Link>
                ) : (
                  <span className="truncate text-slate-300">{i.nombre}</span>
                )}
                <span className="shrink-0 font-medium text-slate-200">{i.texto}</span>
              </div>
              <div className="mt-1 h-1 rounded-full bg-slate-500/20">
                <div className={`h-full rounded-full ${color}`} style={{ width: `${(Math.max(i.valor, 0) / maximo) * 100}%` }} />
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------
// Gráfico de actividad por día, semana o mes
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
  valores: number[]
}

export interface SerieActividad {
  label: string
  /** Clase de fondo de la serie, p. ej. bg-emerald-600 */
  color: string
}

export interface PuntoActividad {
  /** Fecha ISO (timestamp) del registro */
  fecha: string
  /** Un valor por serie */
  valores: number[]
}

interface GraficoActividadProps {
  /** "Actividad", "Ventas"... se completa con "por día/semana/mes" */
  titulo: string
  rango: Rango
  series: SerieActividad[]
  puntos: PuntoActividad[]
  /**
   * espejo: la primera serie hacia arriba y la segunda hacia abajo (entran/salen).
   * apilado: las series una sobre otra, la primera abajo.
   */
  modo: 'espejo' | 'apilado'
  formato?: (n: number) => string
  /** En modo apilado, etiqueta de la suma en el detalle (p. ej. "Vendido") */
  etiquetaTotal?: string
}

export function GraficoActividad({
  titulo,
  rango,
  series,
  puntos,
  modo,
  formato = num,
  etiquetaTotal,
}: GraficoActividadProps) {
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
        valores: series.map(() => 0),
      })
    }
    for (const p of puntos) {
      const c = cubetas.get(claveCubeta(new Date(p.fecha), escala))
      if (!c) continue
      p.valores.forEach((v, i) => (c.valores[i] = (c.valores[i] ?? 0) + v))
    }
    const lista = [...cubetas.values()]
    const positivos = (c: Cubeta) => c.valores.map((v) => Math.max(v, 0))
    const maximo = Math.max(
      0,
      ...lista.map((c) =>
        modo === 'espejo' ? Math.max(...positivos(c)) : positivos(c).reduce((s, v) => s + v, 0),
      ),
    )
    return { cubetas: lista, escala, maximo }
  }, [puntos, rango, series, modo])

  const alto = (v: number) => (v > 0 ? `max(2px, ${(v / maximo) * 100}%)` : '0')
  const sel = activa === null ? null : cubetas[activa]
  const alinear =
    activa === null ? '' : activa < cubetas.length / 4 ? 'left-0' : activa >= (cubetas.length * 3) / 4 ? 'right-0' : ''

  return (
    <div className="col-span-2 flex flex-col rounded-2xl border border-brand-border bg-brand-card px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs tracking-wide text-slate-400 uppercase">
          {titulo} por {escala}
        </p>
        <div className="flex flex-wrap justify-end gap-x-3 text-xs text-slate-400">
          {series.map((s) => (
            <span key={s.label} className="inline-flex items-center gap-1.5">
              <span className={`size-2 rounded-sm ${s.color}`} />
              {s.label}
            </span>
          ))}
        </div>
      </div>

      {maximo === 0 ? (
        <p className="grid flex-1 place-items-center py-6 text-sm text-slate-500">Sin actividad en el período</p>
      ) : (
        <div className="relative mt-3 flex-1">
          <div
            role="img"
            aria-label={`${titulo} por ${escala}: ${series.map((s) => s.label).join(', ')}`}
            className="relative flex h-24 gap-0.5"
            onMouseLeave={() => setActiva(null)}
          >
            {modo === 'espejo' && <div className="pointer-events-none absolute inset-x-0 top-1/2 h-px bg-slate-500/30" />}
            {cubetas.map((c, i) => (
              <div
                key={c.clave}
                onMouseEnter={() => setActiva(i)}
                className={`flex flex-1 flex-col rounded-sm ${activa === i ? 'bg-slate-500/15' : ''} ${modo === 'apilado' ? 'justify-end' : ''}`}
              >
                {modo === 'espejo' && series[0] && series[1] ? (
                  <>
                    <div className="flex flex-1 items-end pb-px">
                      <div className={`w-full rounded-t-sm ${series[0].color}`} style={{ height: alto(c.valores[0] ?? 0) }} />
                    </div>
                    <div className="flex flex-1 items-start pt-px">
                      <div className={`w-full rounded-b-sm ${series[1].color}`} style={{ height: alto(c.valores[1] ?? 0) }} />
                    </div>
                  </>
                ) : (
                  <Apilada valores={c.valores} series={series} alto={alto} />
                )}
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
              {series.map((s, i) => (
                <p key={s.label} className="flex items-center gap-1.5 text-slate-300">
                  <span className={`size-2 rounded-sm ${s.color}`} />
                  {s.label} {formato(sel.valores[i] ?? 0)}
                </p>
              ))}
              {etiquetaTotal && (
                <p className="mt-1 border-t border-brand-border pt-1 font-medium text-slate-200">
                  {etiquetaTotal} {formato(sel.valores.reduce((s, v) => s + v, 0))}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function Apilada({
  valores,
  series,
  alto,
}: {
  valores: number[]
  series: SerieActividad[]
  alto: (v: number) => string
}) {
  const positivos = valores.map((v) => Math.max(v, 0))
  const suma = positivos.reduce((s, v) => s + v, 0)
  if (suma === 0) return null
  return (
    <div className="flex w-full flex-col-reverse overflow-hidden rounded-t-sm" style={{ height: alto(suma) }}>
      {series.map((s, i) => {
        const v = positivos[i] ?? 0
        return v > 0 ? <div key={s.label} className={s.color} style={{ height: `${(v / suma) * 100}%` }} /> : null
      })}
    </div>
  )
}
