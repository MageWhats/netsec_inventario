import { Hourglass } from 'lucide-react'
import { useState } from 'react'
import { EstadoVacio } from '@/components/ui/EstadoVacio'
import { formatearValor } from '@/features/contabilidad/api'
import { Cifra, Reporte, TablaReporte, type Columna } from '@/features/reportes/components/TablaReporte'
import { fechaIso, tablaDesdeColumnas } from '@/lib/exportar'
import { useEdades, type FilaEdades } from '../api'

const VISTAS = {
  clientes: { cuenta: '1305', label: 'Clientes', titulo: 'Cartera por edades', vacio: 'Ningún cliente tiene saldo pendiente' },
  proveedores: {
    cuenta: '2205',
    label: 'Proveedores',
    titulo: 'Cuentas por pagar por edades',
    vacio: 'No se le debe nada a ningún proveedor',
  },
} as const

type Vista = keyof typeof VISTAS

const tramo = (titulo: string, campo: keyof FilaEdades, clase = ''): Columna<FilaEdades> => ({
  titulo,
  valor: (f) => Number(f[campo] ?? 0),
  mostrar: (f) => (Number(f[campo] ?? 0) ? <span className={clase}>{formatearValor(Number(f[campo]))}</span> : ''),
  numerica: true,
  total: formatearValor,
})

const columnas: Columna<FilaEdades>[] = [
  { titulo: 'Tercero', valor: (f) => f.nombre, className: 'font-medium text-slate-100' },
  { titulo: 'Documento', valor: (f) => f.documento, className: 'whitespace-nowrap text-slate-400' },
  tramo('Al día', 'al_dia', 'text-emerald-400'),
  tramo('1–30 días', 'd1_30', 'text-amber-300'),
  tramo('31–60 días', 'd31_60', 'text-amber-400'),
  tramo('61–90 días', 'd61_90', 'text-orange-400'),
  tramo('Más de 90', 'mas_90', 'text-red-400'),
  tramo('Total', 'total', 'font-semibold text-slate-100'),
]

const suma = (filas: FilaEdades[], campo: keyof FilaEdades) => filas.reduce((s, f) => s + Number(f[campo] ?? 0), 0)

/**
 * Lo pendiente de cada cliente o proveedor por antigüedad, según la contabilidad. Los pagos se aplican primero a
 * lo más antiguo; vence en la fecha límite de la venta o en la fecha más el plazo del tercero.
 */
export function TabEdades() {
  const [vista, setVista] = useState<Vista>('clientes')
  const { cuenta, label, titulo, vacio } = VISTAS[vista]
  const { data = [], isLoading, error } = useEdades(cuenta)
  const vencido = suma(data, 'total') - suma(data, 'al_dia')

  return (
    <Reporte
      titulo={titulo}
      subtitulo={`Al ${new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium' }).format(new Date())}`}
      cargando={isLoading}
      error={error}
      puedeExportar={data.length > 0}
      exportar={() => ({ archivo: `edades_${vista}_${fechaIso(new Date())}`, ...tablaDesdeColumnas(columnas, data) })}
      filtros={
        <div className="flex gap-1" role="tablist">
          {(Object.keys(VISTAS) as Vista[]).map((v) => (
            <button
              key={v}
              role="tab"
              aria-selected={vista === v}
              onClick={() => setVista(v)}
              className={`rounded-full px-3 py-1.5 text-sm transition ${
                vista === v ? 'bg-brand-accent/15 text-brand-accent' : 'text-slate-400 hover:bg-tinte/5 hover:text-slate-200'
              }`}
            >
              {VISTAS[v].label}
            </button>
          ))}
        </div>
      }
      resumen={
        data.length > 0 && (
          <>
            <Cifra label={`Total ${label.toLowerCase()}`} valor={formatearValor(suma(data, 'total'))} />
            <Cifra label="Al día" valor={formatearValor(suma(data, 'al_dia'))} tono="bg-emerald-500/15 text-emerald-400" />
            <Cifra label="Vencido" valor={formatearValor(vencido)} tono="bg-amber-500/15 text-amber-400" />
            <Cifra label="Más de 90 días" valor={formatearValor(suma(data, 'mas_90'))} tono="bg-red-500/15 text-red-400" />
          </>
        )
      }
    >
      {data.length === 0 ? (
        <EstadoVacio icono={Hourglass} titulo={vacio} compacto />
      ) : (
        <TablaReporte columnas={columnas} filas={data} clave={(f) => `${f.clase}-${f.tercero_id}`} vacio="" />
      )}
    </Reporte>
  )
}
