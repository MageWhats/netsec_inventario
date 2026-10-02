import { Users } from 'lucide-react'
import { useState } from 'react'
import { EstadoVacio } from '@/components/ui/EstadoVacio'
import { Cifra, Reporte, TablaReporte, type Columna } from '@/features/reportes/components/TablaReporte'
import { fechaIso, tablaDesdeColumnas } from '@/lib/exportar'
import { formatearDia, formatearValor, useCuentas, useSaldosPorTercero, type SaldoTercero } from '../api'
import { SelectorCuenta } from './Selectores'

const ATAJOS = [
  { cuenta: '1305', label: 'Lo que deben los clientes' },
  { cuenta: '2205', label: 'Lo que se debe a proveedores' },
  { cuenta: '1355', label: 'Retenciones a favor' },
]

const CLASES: Record<string, string> = {
  cliente: 'Cliente',
  proveedor: 'Proveedor',
  tercero: 'Otro tercero',
  sin_tercero: '—',
}

const columnas: Columna<SaldoTercero>[] = [
  { titulo: 'Tercero', valor: (f) => f.nombre, className: 'font-medium text-slate-100' },
  { titulo: 'Documento', valor: (f) => f.documento, className: 'whitespace-nowrap text-slate-400' },
  { titulo: 'Tipo', valor: (f) => CLASES[f.clase] ?? f.clase, className: 'text-slate-400' },
  { titulo: 'Débitos', valor: (f) => Number(f.debitos), mostrar: (f) => formatearValor(Number(f.debitos)), numerica: true },
  { titulo: 'Créditos', valor: (f) => Number(f.creditos), mostrar: (f) => formatearValor(Number(f.creditos)), numerica: true },
  {
    titulo: 'Saldo',
    valor: (f) => Number(f.saldo),
    mostrar: (f) => formatearValor(Number(f.saldo)),
    numerica: true,
    total: formatearValor,
    className: 'font-medium text-slate-100',
  },
]

/** Cuentas por cobrar y por pagar: el saldo de cada tercero en una cuenta, a una fecha */
export function TabSaldosTerceros() {
  const cuentas = useCuentas()
  const [cuenta, setCuenta] = useState('1305')
  const [hasta, setHasta] = useState(() => fechaIso(new Date()))
  const { data = [], isLoading, error } = useSaldosPorTercero(cuenta, hasta)
  const nombre = cuentas.data?.find((c) => c.codigo === cuenta)?.nombre
  const total = data.reduce((s, f) => s + Number(f.saldo), 0)

  return (
    <Reporte
      titulo={`Saldos por tercero · ${cuenta}${nombre ? ` ${nombre}` : ''}`}
      subtitulo={`Al ${formatearDia(hasta)}`}
      cargando={isLoading}
      error={error}
      puedeExportar={data.length > 0}
      exportar={() => ({ archivo: `saldos_tercero_${cuenta}_${hasta}`, ...tablaDesdeColumnas(columnas, data) })}
      filtros={
        <>
          <label className="w-80 text-xs text-slate-400">
            Cuenta
            <div className="mt-1">
              <SelectorCuenta cuentas={cuentas.data ?? []} value={cuenta} onChange={(c) => c && setCuenta(c)} />
            </div>
          </label>
          <label className="text-xs text-slate-400">
            Al
            <input
              type="date"
              value={hasta}
              onChange={(e) => e.target.value && setHasta(e.target.value)}
              className="input mt-1 w-40"
            />
          </label>
          <div className="flex flex-wrap gap-1">
            {ATAJOS.map((a) => (
              <button
                key={a.cuenta}
                onClick={() => setCuenta(a.cuenta)}
                className={`rounded-full px-3 py-1.5 text-sm transition ${
                  cuenta === a.cuenta
                    ? 'bg-brand-accent/15 text-brand-accent'
                    : 'text-slate-400 hover:bg-tinte/5 hover:text-slate-200'
                }`}
              >
                {a.label}
              </button>
            ))}
          </div>
        </>
      }
      resumen={
        data.length > 0 && (
          <>
            <Cifra label="Saldo total" valor={formatearValor(total)} />
            <Cifra label="Terceros con saldo" valor={data.length} />
            <Cifra label="Mayor saldo" valor={formatearValor(Number(data[0]!.saldo))} detalle={data[0]!.nombre} />
          </>
        )
      }
    >
      {data.length === 0 ? (
        <EstadoVacio icono={Users} titulo="Ningún tercero tiene saldo en esta cuenta a esa fecha" compacto />
      ) : (
        <TablaReporte columnas={columnas} filas={data} clave={(f) => `${f.clase}-${f.tercero_id ?? 'ninguno'}`} vacio="" />
      )}
    </Reporte>
  )
}
