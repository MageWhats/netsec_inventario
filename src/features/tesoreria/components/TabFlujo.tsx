import { TriangleAlert } from 'lucide-react'
import { useState } from 'react'
import { formatearDia, formatearValor } from '@/features/contabilidad/api'
import { RangoFechas } from '@/features/reportes/components/RangoFechas'
import { Cifra, Reporte, TablaReporte, type Columna } from '@/features/reportes/components/TablaReporte'
import { describirRango, rangoEsteMes, type Rango } from '@/features/reportes/rangos'
import { fechaIso, tablaDesdeColumnas } from '@/lib/exportar'
import { useCuentasTesoreria } from '../api'
import { useFlujoEfectivo, useFlujoProyectado, type FilaFlujo, type SemanaProyectada } from '../conciliacionApi'

const columnasFlujo: Columna<FilaFlujo>[] = [
  { titulo: 'Concepto', valor: (f) => f.concepto, className: 'font-medium text-slate-200' },
  { titulo: 'Entradas', valor: (f) => Number(f.entradas), mostrar: (f) => formatearValor(Number(f.entradas)), numerica: true, total: formatearValor },
  { titulo: 'Salidas', valor: (f) => Number(f.salidas), mostrar: (f) => formatearValor(Number(f.salidas)), numerica: true, total: formatearValor },
  {
    titulo: 'Neto',
    valor: (f) => Number(f.entradas) - Number(f.salidas),
    mostrar: (f) => {
      const neto = Number(f.entradas) - Number(f.salidas)
      return <span className={neto < 0 ? 'text-red-400' : 'text-emerald-400'}>{formatearValor(neto)}</span>
    },
    numerica: true,
    total: formatearValor,
  },
]

type SemanaConSaldo = SemanaProyectada & { saldo: number }

/** De dónde vino y a dónde fue el dinero, y cuánto se espera cobrar y pagar en las próximas semanas */
export function TabFlujo() {
  return (
    <div className="space-y-6">
      <Proyectado />
      <Real />
    </div>
  )
}

function Proyectado() {
  const [semanas, setSemanas] = useState(8)
  const cuentas = useCuentasTesoreria()
  const { data = [], isLoading, error } = useFlujoProyectado(semanas)
  const disponible = (cuentas.data ?? []).filter((c) => c.activa).reduce((s, c) => s + Number(c.saldo), 0)

  // Saldo acumulado semana a semana desde lo disponible hoy
  const filas = data.reduce<SemanaConSaldo[]>((acumuladas, s) => {
    const previo = acumuladas.at(-1)?.saldo ?? disponible
    return [...acumuladas, { ...s, saldo: previo + Number(s.cobros) - Number(s.pagos) }]
  }, [])
  const minimo = filas.reduce((m, f) => Math.min(m, f.saldo), disponible)

  const columnas: Columna<SemanaConSaldo>[] = [
    {
      titulo: 'Semana',
      valor: (s) => `${s.desde} a ${s.hasta}`,
      mostrar: (s) => `${formatearDia(s.desde)} – ${formatearDia(s.hasta)}`,
      className: 'whitespace-nowrap text-slate-300',
    },
    { titulo: 'Cobros esperados', valor: (s) => Number(s.cobros), mostrar: (s) => formatearValor(Number(s.cobros)), numerica: true, total: formatearValor },
    { titulo: 'Pagos esperados', valor: (s) => Number(s.pagos), mostrar: (s) => formatearValor(Number(s.pagos)), numerica: true, total: formatearValor },
    {
      titulo: 'Saldo proyectado',
      valor: (s) => s.saldo,
      mostrar: (s) => <span className={s.saldo < 0 ? 'font-semibold text-red-400' : 'font-semibold'}>{formatearValor(s.saldo)}</span>,
      numerica: true,
    },
  ]

  return (
    <Reporte
      titulo="Flujo de caja proyectado"
      subtitulo={`Próximas ${semanas} semanas desde el ${formatearDia(fechaIso(new Date()))}`}
      cargando={isLoading || cuentas.isLoading}
      error={error}
      puedeExportar={filas.length > 0}
      exportar={() => ({ archivo: `flujo_proyectado_${fechaIso(new Date())}`, ...tablaDesdeColumnas(columnas, filas) })}
      aviso={
        minimo < 0 && (
          <span className="flex items-center gap-2">
            <TriangleAlert className="size-4" />
            Con lo que se espera cobrar y pagar, el saldo llega a {formatearValor(minimo)}: revisa cobros o aplaza pagos.
          </span>
        )
      }
      filtros={
        <label className="text-xs text-slate-400">
          Horizonte
          <select value={semanas} onChange={(e) => setSemanas(Number(e.target.value))} className="input mt-1 w-36">
            {[4, 8, 12, 26].map((n) => (
              <option key={n} value={n}>
                {n} semanas
              </option>
            ))}
          </select>
        </label>
      }
      resumen={
        <>
          <Cifra label="Disponible hoy" valor={formatearValor(disponible)} />
          <Cifra label="Por cobrar en el período" valor={formatearValor(filas.reduce((s, f) => s + Number(f.cobros), 0))} />
          <Cifra label="Por pagar en el período" valor={formatearValor(filas.reduce((s, f) => s + Number(f.pagos), 0))} />
          <Cifra
            label="Saldo al final"
            valor={formatearValor(filas.at(-1)?.saldo ?? disponible)}
            tono={minimo < 0 ? 'bg-red-500/15 text-red-400' : 'bg-emerald-500/15 text-emerald-400'}
          />
        </>
      }
    >
      <TablaReporte columnas={columnas} filas={filas} clave={(s) => String(s.semana)} vacio="Sin datos." />
      <p className="border-t border-brand-border px-4 py-3 text-xs text-slate-500">
        Cobros: cartera de clientes según su fecha límite. Pagos: proveedores y gastos por pagar según el plazo de cada
        tercero, y los gastos recurrentes sin confirmar. Lo vencido se espera en la primera semana.
      </p>
    </Reporte>
  )
}

function Real() {
  const [rango, setRango] = useState<Rango>(rangoEsteMes)
  const { data = [], isLoading, error } = useFlujoEfectivo(rango.desde, rango.hasta)
  const entradas = data.reduce((s, f) => s + Number(f.entradas), 0)
  const salidas = data.reduce((s, f) => s + Number(f.salidas), 0)

  return (
    <Reporte
      titulo="Flujo de efectivo"
      subtitulo={describirRango(rango)}
      cargando={isLoading}
      error={error}
      puedeExportar={data.length > 0}
      exportar={() => ({ archivo: `flujo_efectivo_${rango.desde}_a_${rango.hasta}`, ...tablaDesdeColumnas(columnasFlujo, data) })}
      filtros={<RangoFechas valor={rango} onChange={setRango} />}
      resumen={
        data.length > 0 && (
          <>
            <Cifra label="Entró" valor={formatearValor(entradas)} tono="bg-emerald-500/15 text-emerald-400" />
            <Cifra label="Salió" valor={formatearValor(salidas)} tono="bg-red-500/15 text-red-400" />
            <Cifra label="Variación del disponible" valor={formatearValor(entradas - salidas)} />
          </>
        )
      }
    >
      <TablaReporte columnas={columnasFlujo} filas={data} clave={(f) => f.concepto} vacio="Sin movimientos de caja ni bancos en este período." />
    </Reporte>
  )
}
