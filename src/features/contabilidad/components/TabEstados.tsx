import { CheckCircle2, TriangleAlert } from 'lucide-react'
import { useMemo, useState } from 'react'
import { RangoFechas } from '@/features/reportes/components/RangoFechas'
import { Cifra, Reporte } from '@/features/reportes/components/TablaReporte'
import { describirRango, rangoAnterior, rangoEsteMes, type Rango } from '@/features/reportes/rangos'
import { fechaIso, type DatosTabla } from '@/lib/exportar'
import {
  NIVELES,
  formatearDia,
  formatearValor,
  useEstadoResultados,
  useSituacionFinanciera,
  type FilaEstado,
  type Naturaleza,
} from '../api'

/** Naturaleza de cada clase: una cuenta de naturaleza contraria (4175, 1592) resta dentro de su clase */
const NATURALEZA_CLASE: Record<string, Naturaleza> = {
  '1': 'debito',
  '2': 'credito',
  '3': 'credito',
  '4': 'credito',
  '5': 'debito',
  '6': 'debito',
}

const valorEnClase = (f: FilaEstado) =>
  f.codigo === 'resultado' || f.naturaleza === NATURALEZA_CLASE[f.codigo[0]!] ? Number(f.valor) : -Number(f.valor)

type Fila =
  | { tipo: 'cuenta'; codigo: string; nombre: string; nivel: number; actual: number; anterior?: number }
  | { tipo: 'total'; nombre: string; actual: number; anterior?: number; fuerte?: boolean }

const SANGRIA = ['', 'pl-0', 'pl-3', 'pl-6', 'pl-9', 'pl-12']

function filasDeClase(clase: string, actual: FilaEstado[], anterior: FilaEstado[] | undefined, nivel: number): Fila[] {
  const previo = new Map((anterior ?? []).map((f) => [f.codigo, valorEnClase(f)]))
  const codigos = new Map<string, FilaEstado>()
  for (const f of [...actual, ...(anterior ?? [])]) if (f.codigo.startsWith(clase) && !codigos.has(f.codigo)) codigos.set(f.codigo, f)
  return [...codigos.values()]
    .filter((f) => f.nivel <= nivel && f.codigo !== clase)
    .sort((a, b) => a.codigo.localeCompare(b.codigo))
    .map((f) => ({
      tipo: 'cuenta',
      codigo: f.codigo,
      nombre: f.nombre,
      nivel: f.nivel,
      actual: valorEnClase(actual.find((x) => x.codigo === f.codigo) ?? { ...f, valor: 0 }),
      anterior: anterior ? (previo.get(f.codigo) ?? 0) : undefined,
    }))
}

const totalClase = (clase: string, filas: FilaEstado[] | undefined) =>
  filas ? Number(filas.find((f) => f.codigo === clase)?.valor ?? 0) : undefined

const menos = (a?: number, b?: number) => (a === undefined || b === undefined ? undefined : a - b)

/** Estado de resultados (con el período anterior) y estado de situación financiera */
export function TabEstados() {
  const [vista, setVista] = useState<'resultados' | 'situacion'>('resultados')
  return (
    <>
      <div className="mb-4 flex gap-1" role="tablist">
        {(
          [
            ['resultados', 'Estado de resultados'],
            ['situacion', 'Situación financiera'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            role="tab"
            aria-selected={vista === id}
            onClick={() => setVista(id)}
            className={`rounded-full px-3 py-1.5 text-sm transition ${
              vista === id ? 'bg-brand-accent/15 text-brand-accent' : 'text-slate-400 hover:bg-tinte/5 hover:text-slate-200'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {vista === 'resultados' ? <EstadoResultados /> : <SituacionFinanciera />}
    </>
  )
}

function EstadoResultados() {
  const [rango, setRango] = useState<Rango>(rangoEsteMes)
  const [nivel, setNivel] = useState(3)
  const previo = useMemo(() => rangoAnterior(rango), [rango])
  const actual = useEstadoResultados(rango.desde, rango.hasta)
  const anterior = useEstadoResultados(previo.desde, previo.hasta)
  const a = actual.data ?? []
  const p = anterior.isPlaceholderData ? undefined : anterior.data

  const ingresos = totalClase('4', a) ?? 0
  const costos = totalClase('6', a) ?? 0
  const gastos = totalClase('5', a) ?? 0
  const filas: Fila[] = [
    ...filasDeClase('4', a, p, nivel),
    { tipo: 'total', nombre: 'Ingresos', actual: ingresos, anterior: totalClase('4', p) },
    ...filasDeClase('6', a, p, nivel),
    { tipo: 'total', nombre: 'Costo de ventas', actual: costos, anterior: totalClase('6', p) },
    { tipo: 'total', nombre: 'Utilidad bruta', actual: ingresos - costos, anterior: menos(totalClase('4', p), totalClase('6', p)), fuerte: true },
    ...filasDeClase('5', a, p, nivel),
    { tipo: 'total', nombre: 'Gastos', actual: gastos, anterior: totalClase('5', p) },
    {
      tipo: 'total',
      nombre: 'Utilidad del período',
      actual: ingresos - costos - gastos,
      anterior: p ? (totalClase('4', p) ?? 0) - (totalClase('6', p) ?? 0) - (totalClase('5', p) ?? 0) : undefined,
      fuerte: true,
    },
  ]
  const margen = ingresos ? ((ingresos - costos - gastos) / ingresos) * 100 : 0

  return (
    <Reporte
      titulo="Estado de resultados"
      subtitulo={`${describirRango(rango)} · comparado con ${describirRango(previo).toLowerCase()}`}
      cargando={actual.isLoading}
      error={actual.error}
      puedeExportar={a.length > 0}
      exportar={() => ({ archivo: `estado_resultados_${rango.desde}_a_${rango.hasta}`, ...exportarFilas(filas, true) })}
      filtros={
        <>
          <RangoFechas valor={rango} onChange={setRango} />
          <SelectorNivel valor={nivel} onChange={setNivel} />
        </>
      }
      resumen={
        a.length > 0 && (
          <>
            <Cifra label="Ingresos" valor={formatearValor(ingresos)} />
            <Cifra label="Costo de ventas" valor={formatearValor(costos)} />
            <Cifra label="Gastos" valor={formatearValor(gastos)} />
            <Cifra
              label="Utilidad"
              valor={formatearValor(ingresos - costos - gastos)}
              detalle={ingresos ? `Margen neto ${margen.toFixed(1)} %` : undefined}
              tono={ingresos - costos - gastos >= 0 ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'}
            />
          </>
        )
      }
    >
      <TablaEstado filas={filas} comparar />
    </Reporte>
  )
}

function SituacionFinanciera() {
  const [hasta, setHasta] = useState(() => fechaIso(new Date()))
  const [nivel, setNivel] = useState(3)
  const { data = [], isLoading, error } = useSituacionFinanciera(hasta)

  const activo = totalClase('1', data) ?? 0
  const pasivo = totalClase('2', data) ?? 0
  const resultado = totalClase('resultado', data) ?? 0
  const patrimonio = (totalClase('3', data) ?? 0) + resultado
  const cuadra = Math.round((activo - pasivo - patrimonio) * 100) === 0
  const resultadoFila: Fila[] = resultado
    ? [{ tipo: 'cuenta', codigo: '', nombre: 'Resultado del ejercicio (sin cerrar)', nivel: 2, actual: resultado }]
    : []

  const filas: Fila[] = [
    ...filasDeClase('1', data, undefined, nivel),
    { tipo: 'total', nombre: 'Total activo', actual: activo, fuerte: true },
    ...filasDeClase('2', data, undefined, nivel),
    { tipo: 'total', nombre: 'Total pasivo', actual: pasivo },
    ...filasDeClase('3', data, undefined, nivel),
    ...resultadoFila,
    { tipo: 'total', nombre: 'Total patrimonio', actual: patrimonio },
    { tipo: 'total', nombre: 'Pasivo + patrimonio', actual: pasivo + patrimonio, fuerte: true },
  ]

  return (
    <Reporte
      titulo="Estado de situación financiera"
      subtitulo={`Al ${formatearDia(hasta)}`}
      cargando={isLoading}
      error={error}
      puedeExportar={data.length > 0}
      exportar={() => ({ archivo: `situacion_financiera_${hasta}`, ...exportarFilas(filas, false) })}
      filtros={
        <>
          <label className="text-xs text-slate-400">
            Al
            <input type="date" value={hasta} onChange={(e) => e.target.value && setHasta(e.target.value)} className="input mt-1 w-40" />
          </label>
          <SelectorNivel valor={nivel} onChange={setNivel} />
        </>
      }
      resumen={
        data.length > 0 && (
          <>
            <Cifra label="Activo" valor={formatearValor(activo)} />
            <Cifra label="Pasivo" valor={formatearValor(pasivo)} />
            <Cifra label="Patrimonio" valor={formatearValor(patrimonio)} />
            <Cifra
              label="Ecuación contable"
              valor={cuadra ? 'Cuadra' : `Diferencia ${formatearValor(activo - pasivo - patrimonio)}`}
              icono={cuadra ? CheckCircle2 : TriangleAlert}
              tono={cuadra ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'}
            />
          </>
        )
      }
    >
      <TablaEstado filas={filas} />
    </Reporte>
  )
}

function SelectorNivel({ valor, onChange }: { valor: number; onChange: (n: number) => void }) {
  return (
    <label className="text-xs text-slate-400">
      Detalle hasta
      <select value={valor} onChange={(e) => onChange(Number(e.target.value))} className="input mt-1 w-36">
        {Object.entries(NIVELES)
          .filter(([n]) => Number(n) >= 2)
          .map(([n, label]) => (
            <option key={n} value={n}>
              {label}
            </option>
          ))}
      </select>
    </label>
  )
}

function TablaEstado({ filas, comparar }: { filas: Fila[]; comparar?: boolean }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="border-b border-brand-border text-xs tracking-wide text-slate-400 uppercase">
          <tr>
            <th className="px-4 py-3 text-left font-medium">Cuenta</th>
            <th className="px-4 py-3 text-right font-medium">{comparar ? 'Período' : 'Saldo'}</th>
            {comparar && <th className="px-4 py-3 text-right font-medium">Anterior</th>}
            {comparar && <th className="px-4 py-3 text-right font-medium">Variación</th>}
          </tr>
        </thead>
        <tbody>
          {filas.map((f, i) =>
            f.tipo === 'cuenta' ? (
              <tr key={`${f.codigo}-${i}`} className="border-b border-brand-border/50">
                <td className={`px-4 py-2 ${f.nivel <= 2 ? 'font-medium text-slate-200' : 'text-slate-300'}`}>
                  <span className={`${SANGRIA[f.nivel]} block`}>
                    {f.codigo && <span className="mr-2 font-mono text-xs text-slate-500">{f.codigo}</span>}
                    {f.nombre}
                  </span>
                </td>
                <td className="px-4 py-2 text-right tabular-nums">{formatearValor(f.actual)}</td>
                {comparar && <td className="px-4 py-2 text-right text-slate-400 tabular-nums">{f.anterior !== undefined ? formatearValor(f.anterior) : '—'}</td>}
                {comparar && <td className="px-4 py-2 text-right tabular-nums"><Variacion actual={f.actual} anterior={f.anterior} /></td>}
              </tr>
            ) : (
              <tr key={`${f.nombre}-${i}`} className={`border-b-2 border-brand-border ${f.fuerte ? 'bg-tinte/[0.04]' : ''}`}>
                <td className={`px-4 py-2.5 ${f.fuerte ? 'font-bold text-slate-100' : 'font-semibold text-slate-200'}`}>{f.nombre}</td>
                <td className={`px-4 py-2.5 text-right tabular-nums ${f.fuerte ? 'font-bold' : 'font-semibold'}`}>{formatearValor(f.actual)}</td>
                {comparar && <td className="px-4 py-2.5 text-right text-slate-400 tabular-nums">{f.anterior !== undefined ? formatearValor(f.anterior) : '—'}</td>}
                {comparar && <td className="px-4 py-2.5 text-right tabular-nums"><Variacion actual={f.actual} anterior={f.anterior} /></td>}
              </tr>
            ),
          )}
        </tbody>
      </table>
    </div>
  )
}

function Variacion({ actual, anterior }: { actual: number; anterior?: number }) {
  if (anterior === undefined || anterior === 0) return <span className="text-slate-500">—</span>
  const pct = ((actual - anterior) / Math.abs(anterior)) * 100
  return <span className={pct >= 0 ? 'text-emerald-400' : 'text-red-400'}>{`${pct >= 0 ? '+' : ''}${pct.toFixed(1)} %`}</span>
}

function exportarFilas(filas: Fila[], comparar: boolean): DatosTabla {
  const columnas = [
    { titulo: 'Código', numerica: false },
    { titulo: 'Cuenta', numerica: false },
    { titulo: comparar ? 'Período' : 'Saldo', numerica: true },
    ...(comparar ? [{ titulo: 'Anterior', numerica: true }] : []),
  ]
  const crudas = filas.map((f) => [
    f.tipo === 'cuenta' ? f.codigo : '',
    f.nombre,
    f.actual,
    ...(comparar ? [f.anterior ?? null] : []),
  ])
  const textos = filas.map((f) => [
    f.tipo === 'cuenta' ? f.codigo : '',
    f.tipo === 'total' ? f.nombre.toUpperCase() : f.nombre,
    formatearValor(f.actual),
    ...(comparar ? [f.anterior !== undefined ? formatearValor(f.anterior) : ''] : []),
  ])
  return { columnas, crudas, textos, totales: null }
}
