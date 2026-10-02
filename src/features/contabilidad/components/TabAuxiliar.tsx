import { ListTree } from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import { EstadoVacio } from '@/components/ui/EstadoVacio'
import { RangoFechas } from '@/features/reportes/components/RangoFechas'
import { Cifra, Reporte, TablaReporte, type Columna } from '@/features/reportes/components/TablaReporte'
import { describirRango, rangoEsteMes, type Rango } from '@/features/reportes/rangos'
import { tablaDesdeColumnas } from '@/lib/exportar'
import { etiquetaComprobante, formatearDia, formatearValor, useAuxiliar, useCuentas, type FilaAuxiliar } from '../api'
import { SelectorCuenta } from './Selectores'

const columnas: Columna<FilaAuxiliar>[] = [
  { titulo: 'Fecha', valor: (f) => f.fecha, mostrar: (f) => formatearDia(f.fecha), className: 'whitespace-nowrap text-slate-400' },
  {
    titulo: 'Comprobante',
    valor: (f) => (f.tipo && f.numero ? etiquetaComprobante({ tipo: f.tipo, numero: f.numero }) : ''),
    mostrar: (f) =>
      f.comprobante_id && f.tipo && f.numero ? (
        <Link to={`/contabilidad/comprobantes/${f.comprobante_id}`} className="font-mono hover:text-brand-cyan">
          {etiquetaComprobante({ tipo: f.tipo, numero: f.numero })}
        </Link>
      ) : (
        ''
      ),
    className: 'whitespace-nowrap text-slate-200',
  },
  { titulo: 'Cuenta', valor: (f) => f.cuenta, className: 'font-mono text-slate-400' },
  {
    titulo: 'Descripción',
    valor: (f) => f.descripcion,
    mostrar: (f) => (f.comprobante_id ? f.descripcion : <strong>{f.descripcion}</strong>),
  },
  { titulo: 'Tercero', valor: (f) => f.tercero, className: 'text-slate-400' },
  { titulo: 'Débito', valor: (f) => f.debito, mostrar: (f) => (f.debito ? formatearValor(f.debito) : ''), numerica: true, total: formatearValor },
  { titulo: 'Crédito', valor: (f) => f.credito, mostrar: (f) => (f.credito ? formatearValor(f.credito) : ''), numerica: true, total: formatearValor },
  { titulo: 'Saldo', valor: (f) => f.saldo, mostrar: (f) => formatearValor(f.saldo), numerica: true, className: 'font-medium text-slate-100' },
]

/** Movimientos de una cuenta (y sus subcuentas) con el saldo línea a línea */
export function TabAuxiliar() {
  const [params, setParams] = useSearchParams()
  const cuenta = params.get('cuenta') ?? ''
  const porDefecto = rangoEsteMes()
  const rango: Rango = { desde: params.get('desde') ?? porDefecto.desde, hasta: params.get('hasta') ?? porDefecto.hasta }
  const cuentas = useCuentas()
  const { data, isLoading, error } = useAuxiliar(cuenta, rango.desde, rango.hasta)
  const filas = data?.filas ?? []
  const nombre = cuentas.data?.find((c) => c.codigo === cuenta)?.nombre

  const cambiar = (cambios: Partial<{ cuenta: string } & Rango>) =>
    setParams({ t: 'auxiliar', cuenta, ...rango, ...cambios }, { replace: true })

  const movimientos = filas.filter((f) => f.comprobante_id)
  const saldoFinal = filas.at(-1)?.saldo ?? 0

  return (
    <Reporte
      titulo={`Auxiliar ${cuenta}${nombre ? ` · ${nombre}` : ''}`}
      subtitulo={describirRango(rango)}
      cargando={Boolean(cuenta) && isLoading}
      error={error}
      puedeExportar={movimientos.length > 0}
      exportar={() => ({ archivo: `auxiliar_${cuenta}_${rango.desde}_a_${rango.hasta}`, ...tablaDesdeColumnas(columnas, filas) })}
      aviso={data?.truncado && 'Hay demasiadas líneas para mostrarlas todas: acorta el período.'}
      filtros={
        <>
          <label className="w-80 text-xs text-slate-400">
            Cuenta
            <div className="mt-1">
              <SelectorCuenta cuentas={cuentas.data ?? []} value={cuenta} onChange={(c) => c && cambiar({ cuenta: c })} />
            </div>
          </label>
          <RangoFechas valor={rango} onChange={(r) => cambiar(r)} />
        </>
      }
      resumen={
        cuenta &&
        filas.length > 0 && (
          <>
            <Cifra label="Saldo anterior" valor={formatearValor(filas[0]!.saldo)} />
            <Cifra label="Débitos" valor={formatearValor(movimientos.reduce((s, f) => s + Number(f.debito ?? 0), 0))} />
            <Cifra label="Créditos" valor={formatearValor(movimientos.reduce((s, f) => s + Number(f.credito ?? 0), 0))} />
            <Cifra label="Saldo final" valor={formatearValor(saldoFinal)} />
          </>
        )
      }
    >
      {!cuenta ? (
        <EstadoVacio icono={ListTree} titulo="Elige una cuenta" descripcion="Incluye sus subcuentas: la 1105 muestra todas las cajas." compacto />
      ) : (
        <TablaReporte columnas={columnas} filas={filas} clave={(f) => `${f.comprobante_id ?? 'saldo'}-${f.linea ?? 0}`} vacio="" />
      )}
    </Reporte>
  )
}
