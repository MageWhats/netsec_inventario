import { Info } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { RangoFechas } from '@/features/reportes/components/RangoFechas'
import { Reporte, TablaReporte, type Columna } from '@/features/reportes/components/TablaReporte'
import { describirRango, type Rango } from '@/features/reportes/rangos'
import { fechaIso, tablaDesdeColumnas } from '@/lib/exportar'
import {
  formatearDia,
  formatearValor,
  useBaseIca,
  useConfiguracionContable,
  useRetencionesAFavor,
  type BimestreIca,
  type RetencionAFavor,
} from '../api'

const NOMBRES_BIMESTRE = ['Enero – febrero', 'Marzo – abril', 'Mayo – junio', 'Julio – agosto', 'Septiembre – octubre', 'Noviembre – diciembre']

const columnasIca: Columna<BimestreIca>[] = [
  { titulo: 'Bimestre', valor: (b) => NOMBRES_BIMESTRE[b.bimestre - 1], className: 'font-medium text-slate-200' },
  { titulo: 'Ingresos', valor: (b) => Number(b.ingresos), mostrar: (b) => formatearValor(Number(b.ingresos)), numerica: true, total: formatearValor },
  { titulo: 'Devoluciones', valor: (b) => Number(b.devoluciones), mostrar: (b) => formatearValor(Number(b.devoluciones)), numerica: true, total: formatearValor },
  { titulo: 'Base gravable', valor: (b) => Number(b.base), mostrar: (b) => formatearValor(Number(b.base)), numerica: true, total: formatearValor },
  {
    titulo: 'ICA estimado',
    valor: (b) => (b.impuesto === null ? null : Number(b.impuesto)),
    mostrar: (b) => (b.impuesto === null ? '—' : formatearValor(Number(b.impuesto))),
    numerica: true,
    total: formatearValor,
    className: 'font-medium text-slate-100',
  },
]

const columnasRetenciones: Columna<RetencionAFavor>[] = [
  { titulo: 'Cliente', valor: (r) => r.nombre, className: 'font-medium text-slate-100' },
  { titulo: 'Documento', valor: (r) => r.documento, className: 'text-slate-400' },
  { titulo: 'Abonos', valor: (r) => r.abonos, numerica: true },
  { titulo: 'Base (abonos + retención)', valor: (r) => Number(r.base), mostrar: (r) => formatearValor(Number(r.base)), numerica: true, total: formatearValor },
  { titulo: 'Retención', valor: (r) => Number(r.retencion), mostrar: (r) => formatearValor(Number(r.retencion)), numerica: true, total: formatearValor },
]

/** Lo que el contador necesita para declarar: base del ICA por bimestre y retenciones que practicaron los clientes */
export function TabImpuestos() {
  const config = useConfiguracionContable()
  const [anio, setAnio] = useState(() => new Date().getFullYear())
  const ica = useBaseIca(anio)
  const [rango, setRango] = useState<Rango>(() => ({ desde: `${new Date().getFullYear()}-01-01`, hasta: fechaIso(new Date()) }))
  const retenciones = useRetencionesAFavor(rango.desde, rango.hasta)
  const c = config.data

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3 rounded-2xl border border-brand-border bg-brand-card p-4 text-sm text-slate-300">
        <Info className="mt-0.5 size-4 shrink-0 text-brand-cyan" />
        <p>
          {c?.responsable_iva ? 'Responsable de IVA' : 'No responsable de IVA'} ·{' '}
          {c?.agente_retencion ? 'agente de retención' : 'no agente de retención'}.{' '}
          {!c?.responsable_iva && 'Las ventas no llevan IVA y el IVA de las compras suma al costo: no hay auxiliar de IVA. '}
          {!c?.agente_retencion && 'Net&Sec no practica retenciones, así que no expide certificados. '}
          Las declaraciones las presenta la contadora en la DIAN y en el municipio.
        </p>
      </div>

      <Reporte
        titulo={`ICA ${c?.municipio_ica ?? ''} ${anio}`}
        subtitulo={`${c?.periodicidad_ica ?? 'Bimestral'} · tarifa ${c?.tarifa_ica ?? 'sin definir'} por mil${c?.actividad_ciiu ? ` · CIIU ${c.actividad_ciiu}` : ''}`}
        cargando={ica.isLoading}
        error={ica.error}
        puedeExportar={(ica.data ?? []).length > 0}
        exportar={() => ({ archivo: `base_ica_${anio}`, ...tablaDesdeColumnas(columnasIca, ica.data ?? []) })}
        aviso={
          c && c.tarifa_ica === null && (
            <>
              Falta la tarifa del ICA (depende de la actividad económica).{' '}
              <Link to="/contabilidad?t=configuracion" className="underline">
                Defínela en Configuración
              </Link>{' '}
              para estimar el impuesto.
            </>
          )
        }
        filtros={
          <label className="text-xs text-slate-400">
            Año
            <input
              type="number"
              min={2020}
              max={2100}
              value={anio}
              onChange={(e) => Number.isFinite(e.target.valueAsNumber) && setAnio(e.target.valueAsNumber)}
              className="input mt-1 w-28"
            />
          </label>
        }
      >
        <TablaReporte columnas={columnasIca} filas={ica.data ?? []} clave={(b) => String(b.bimestre)} vacio="Sin datos." />
        <p className="border-t border-brand-border px-4 py-3 text-xs text-slate-500">
          Base: ingresos operacionales (41) menos devoluciones (4175) del bimestre. El ICA se redondea a miles; avisos y
          tableros, sobretasas y otros complementos los liquida la contadora en el formulario del municipio.
        </p>
      </Reporte>

      <Reporte
        titulo="Retenciones que practicaron los clientes"
        subtitulo={describirRango(rango)}
        cargando={retenciones.isLoading}
        error={retenciones.error}
        puedeExportar={(retenciones.data ?? []).length > 0}
        exportar={() => ({
          archivo: `retenciones_a_favor_${rango.desde}_a_${rango.hasta}`,
          ...tablaDesdeColumnas(columnasRetenciones, retenciones.data ?? []),
        })}
        filtros={<RangoFechas valor={rango} onChange={setRango} />}
      >
        <TablaReporte
          columnas={columnasRetenciones}
          filas={retenciones.data ?? []}
          clave={(r) => r.cliente_id}
          vacio={`Ningún cliente practicó retenciones entre el ${formatearDia(rango.desde)} y el ${formatearDia(rango.hasta)}.`}
        />
        <p className="border-t border-brand-border px-4 py-3 text-xs text-slate-500">
          Sirve para cruzarlas con los certificados que envían los clientes. Quedan en la 135515 y se descuentan en la
          declaración de renta.
        </p>
      </Reporte>
    </div>
  )
}
