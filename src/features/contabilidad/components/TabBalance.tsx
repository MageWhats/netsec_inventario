import { CheckCircle2, Scale, TriangleAlert } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { EstadoVacio } from '@/components/ui/EstadoVacio'
import { RangoFechas } from '@/features/reportes/components/RangoFechas'
import { Cifra, Reporte, TablaReporte, type Columna } from '@/features/reportes/components/TablaReporte'
import { describirRango, rangoEsteMes, type Rango } from '@/features/reportes/rangos'
import { tablaDesdeColumnas } from '@/lib/exportar'
import { NIVELES, formatearValor, useBalancePrueba, type FilaBalance } from '../api'

const SANGRIA = ['', 'pl-0', 'pl-3', 'pl-6', 'pl-9', 'pl-12']

/** Balance de prueba: saldos de todas las cuentas; débitos y créditos deben ser iguales */
export function TabBalance() {
  const [, setParams] = useSearchParams()
  const [rango, setRango] = useState<Rango>(rangoEsteMes)
  const [nivel, setNivel] = useState(5)
  const { data = [], isLoading, error } = useBalancePrueba(rango.desde, rango.hasta)

  const filas = useMemo(() => data.filter((f) => f.nivel <= nivel), [data, nivel])
  // Las clases suman todo: de ahí salen los totales (sumar todas las filas contaría doble)
  const clases = data.filter((f) => f.nivel === 1)
  const debitos = clases.reduce((s, f) => s + Number(f.debitos), 0)
  const creditos = clases.reduce((s, f) => s + Number(f.creditos), 0)
  const cuadra = Math.round((debitos - creditos) * 100) === 0

  const verAuxiliar = (codigo: string) =>
    setParams({ t: 'auxiliar', cuenta: codigo, desde: rango.desde, hasta: rango.hasta })

  const columnas: Columna<FilaBalance>[] = [
    {
      titulo: 'Código',
      valor: (f) => f.codigo,
      mostrar: (f) => (
        <button onClick={() => verAuxiliar(f.codigo)} className="font-mono hover:text-brand-cyan" title="Ver auxiliar">
          {f.codigo}
        </button>
      ),
      className: 'whitespace-nowrap text-slate-200',
    },
    {
      titulo: 'Cuenta',
      valor: (f) => f.nombre,
      mostrar: (f) => (
        <span className={`${SANGRIA[f.nivel]} block ${f.nivel <= 2 ? 'font-semibold text-slate-100' : ''}`}>
          {f.nombre}
        </span>
      ),
    },
    { titulo: 'Saldo anterior', valor: (f) => Number(f.saldo_inicial), mostrar: (f) => formatearValor(Number(f.saldo_inicial)), numerica: true },
    { titulo: 'Débitos', valor: (f) => Number(f.debitos), mostrar: (f) => formatearValor(Number(f.debitos)), numerica: true },
    { titulo: 'Créditos', valor: (f) => Number(f.creditos), mostrar: (f) => formatearValor(Number(f.creditos)), numerica: true },
    {
      titulo: 'Saldo final',
      valor: (f) => Number(f.saldo_final),
      mostrar: (f) => (
        <span className={Number(f.saldo_final) < 0 ? 'text-amber-400' : ''}>{formatearValor(Number(f.saldo_final))}</span>
      ),
      numerica: true,
    },
  ]

  return (
    <Reporte
      titulo="Balance de prueba"
      subtitulo={`${describirRango(rango)} · hasta ${NIVELES[nivel]?.toLowerCase()}`}
      cargando={isLoading}
      error={error}
      puedeExportar={filas.length > 0}
      exportar={() => ({ archivo: `balance_prueba_${rango.desde}_a_${rango.hasta}`, ...tablaDesdeColumnas(columnas, filas) })}
      filtros={
        <>
          <RangoFechas valor={rango} onChange={setRango} />
          <label className="text-xs text-slate-400">
            Detalle hasta
            <select value={nivel} onChange={(e) => setNivel(Number(e.target.value))} className="input mt-1 w-40">
              {Object.entries(NIVELES).map(([n, label]) => (
                <option key={n} value={n}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </>
      }
      resumen={
        data.length > 0 && (
          <>
            <Cifra label="Débitos del período" valor={formatearValor(debitos)} />
            <Cifra label="Créditos del período" valor={formatearValor(creditos)} />
            <Cifra
              label="Cuadre"
              valor={cuadra ? 'Cuadrado' : `Diferencia ${formatearValor(Math.abs(debitos - creditos))}`}
              icono={cuadra ? CheckCircle2 : TriangleAlert}
              tono={cuadra ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'}
            />
            <Cifra label="Cuentas con movimiento" valor={data.filter((f) => f.nivel === 5 || !data.some((h) => h.codigo !== f.codigo && h.codigo.startsWith(f.codigo))).length} />
          </>
        )
      }
    >
      {filas.length === 0 ? (
        <EstadoVacio icono={Scale} titulo="Sin saldos ni movimientos en este período" compacto />
      ) : (
        <TablaReporte columnas={columnas} filas={filas} clave={(f) => f.codigo} vacio="" />
      )}
    </Reporte>
  )
}
