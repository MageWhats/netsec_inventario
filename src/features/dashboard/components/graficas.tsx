import { BarChart3, Table2 } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { formatearPrecio, formatearPrecioCompacto } from '@/lib/format'
import type { ResumenMes } from '../api'

// Colores validados contra el fondo de las tarjetas (#121824) para daltonismo y contraste.
// Entradas y salidas conservan el verde y el azul que usan en el resto de la app.
const COLOR_ENTRADAS = '#059669'
const COLOR_SALIDAS = '#2563eb'
const COLOR_VALOR = '#0891b2'
const COLOR_GRILLA = '#1e293b'
const COLOR_EJE = '#94a3b8'

const tick = { fill: COLOR_EJE, fontSize: 12 }
const cursor = { fill: 'rgb(255 255 255 / 0.04)' }

interface Serie {
  clave: string
  label: string
  color: string
  formato: (valor: number) => string
}

// ---------------------------------------------------------------------
// Piezas comunes
// ---------------------------------------------------------------------

interface ChartCardProps {
  titulo: string
  descripcion?: string
  /** Leyenda (solo con dos o más series) */
  series?: Serie[]
  /** Los mismos datos en tabla, para quien no puede leer la gráfica */
  tabla: ReactNode
  children: ReactNode
  className?: string
}

export function ChartCard({ titulo, descripcion, series, tabla, children, className = '' }: ChartCardProps) {
  const [verTabla, setVerTabla] = useState(false)
  const Icono = verTabla ? BarChart3 : Table2

  return (
    <section className={`rounded-2xl border border-brand-border bg-brand-card p-5 ${className}`}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold">{titulo}</h2>
          {descripcion && <p className="mt-0.5 text-xs text-slate-400">{descripcion}</p>}
        </div>
        <button
          type="button"
          onClick={() => setVerTabla((v) => !v)}
          className="btn btn-secondary shrink-0 px-2.5 py-1.5 text-xs"
          aria-pressed={verTabla}
        >
          <Icono className="size-3.5" />
          {verTabla ? 'Gráfica' : 'Tabla'}
        </button>
      </div>

      {series && !verTabla && (
        <ul className="mb-3 flex flex-wrap gap-4 text-xs text-slate-300">
          {series.map((s) => (
            <li key={s.clave} className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-sm" style={{ backgroundColor: s.color }} />
              {s.label}
            </li>
          ))}
        </ul>
      )}

      {verTabla ? tabla : children}
    </section>
  )
}

interface ChartTooltipProps {
  active?: boolean
  payload?: ReadonlyArray<{ payload?: Record<string, unknown> }>
  titulo: (fila: Record<string, unknown>) => string
  series: Serie[]
}

function ChartTooltip({ active, payload, titulo, series }: ChartTooltipProps) {
  const fila = payload?.[0]?.payload
  if (!active || !fila) return null

  return (
    <div className="rounded-lg border border-brand-border bg-brand-bg px-3 py-2 text-xs shadow-lg">
      <p className="mb-1 font-medium text-slate-200">{titulo(fila)}</p>
      {series.map((s) => (
        <p key={s.clave} className="flex items-center gap-2 text-slate-300">
          <span className="size-2 rounded-sm" style={{ backgroundColor: s.color }} />
          {s.label}
          <span className="ml-auto pl-3 font-medium text-slate-100 tabular-nums">{s.formato(Number(fila[s.clave]))}</span>
        </p>
      ))}
    </div>
  )
}

function TablaDatos({ columnas, filas }: { columnas: string[]; filas: (string | number)[][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="border-b border-brand-border text-left text-xs tracking-wide text-slate-400 uppercase">
          <tr>
            {columnas.map((c, i) => (
              <th key={c} className={`px-3 py-2 font-medium ${i > 0 ? 'text-right' : ''}`}>
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-brand-border">
          {filas.map((fila) => (
            <tr key={String(fila[0])}>
              {fila.map((celda, i) => (
                <td key={i} className={`px-3 py-2 ${i > 0 ? 'text-right text-slate-300 tabular-nums' : ''}`}>
                  {celda}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function SinDatos({ children }: { children: ReactNode }) {
  return <p className="flex h-40 items-center justify-center text-center text-sm text-slate-500">{children}</p>
}

// ---------------------------------------------------------------------
// Entradas y salidas por mes
// ---------------------------------------------------------------------

const unidades = (valor: number) => `${valor.toLocaleString('es-CO')} und.`

const SERIES_MOVIMIENTOS: Serie[] = [
  { clave: 'entradas', label: 'Entradas', color: COLOR_ENTRADAS, formato: unidades },
  { clave: 'salidas', label: 'Salidas', color: COLOR_SALIDAS, formato: unidades },
]

export function MovimientosPorMesChart({ meses, className }: { meses: ResumenMes[]; className?: string }) {
  const hayDatos = meses.some((m) => m.entradas > 0 || m.salidas > 0)

  return (
    <ChartCard
      titulo="Entradas y salidas por mes"
      descripcion="Unidades recibidas de proveedores y despachadas a clientes (sin ajustes)"
      series={hayDatos ? SERIES_MOVIMIENTOS : undefined}
      className={className}
      tabla={
        <TablaDatos
          columnas={['Mes', 'Entradas', 'Salidas']}
          filas={meses.map((m) => [m.etiqueta, m.entradas, m.salidas])}
        />
      }
    >
      {hayDatos ? (
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={meses} barGap={2} margin={{ top: 8, right: 4, bottom: 0, left: -12 }}>
            <CartesianGrid vertical={false} stroke={COLOR_GRILLA} />
            <XAxis dataKey="etiqueta" tick={tick} axisLine={false} tickLine={false} />
            <YAxis allowDecimals={false} tick={tick} axisLine={false} tickLine={false} />
            <Tooltip
              cursor={cursor}
              content={({ active, payload }) => (
                <ChartTooltip
                  active={active}
                  payload={payload}
                  series={SERIES_MOVIMIENTOS}
                  titulo={(fila) => String(fila.etiqueta)}
                />
              )}
            />
            {SERIES_MOVIMIENTOS.map((s) => (
              <Bar key={s.clave} dataKey={s.clave} name={s.label} fill={s.color} radius={[4, 4, 0, 0]} maxBarSize={24} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      ) : (
        <SinDatos>Aún no hay entradas ni salidas en los últimos meses.</SinDatos>
      )}
    </ChartCard>
  )
}

// ---------------------------------------------------------------------
// Valor del inventario por categoría
// ---------------------------------------------------------------------

export interface ValorCategoria {
  nombre: string
  valor: number
}

const SERIES_VALOR: Serie[] = [
  { clave: 'valor', label: 'Valor a costo', color: COLOR_VALOR, formato: formatearPrecio },
]

export function ValorPorCategoriaChart({ datos, className }: { datos: ValorCategoria[]; className?: string }) {
  return (
    <ChartCard
      titulo="Valor del inventario por categoría"
      descripcion="Stock actual × precio de costo"
      className={className}
      tabla={
        <TablaDatos columnas={['Categoría', 'Valor']} filas={datos.map((d) => [d.nombre, formatearPrecio(d.valor)])} />
      }
    >
      {datos.length > 0 ? (
        <ResponsiveContainer width="100%" height={Math.max(160, datos.length * 36)}>
          <BarChart data={datos} layout="vertical" margin={{ top: 0, right: 64, bottom: 0, left: 0 }}>
            <XAxis type="number" hide />
            <YAxis
              type="category"
              dataKey="nombre"
              width={130}
              tick={tick}
              axisLine={false}
              tickLine={false}
              interval={0}
            />
            <Tooltip
              cursor={cursor}
              content={({ active, payload }) => (
                <ChartTooltip
                  active={active}
                  payload={payload}
                  series={SERIES_VALOR}
                  titulo={(fila) => String(fila.nombre)}
                />
              )}
            />
            <Bar dataKey="valor" name="Valor a costo" fill={COLOR_VALOR} radius={[0, 4, 4, 0]} maxBarSize={20}>
              <LabelList
                dataKey="valor"
                position="right"
                fill={COLOR_EJE}
                fontSize={12}
                formatter={(valor) => formatearPrecioCompacto(Number(valor))}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      ) : (
        <SinDatos>Cuando haya stock con precio de costo, aquí verás cómo se reparte el valor.</SinDatos>
      )}
    </ChartCard>
  )
}
