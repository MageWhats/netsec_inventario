import { BookOpen, Plus } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { EstadoVacio } from '@/components/ui/EstadoVacio'
import { usePermisos } from '@/features/auth/permisos'
import { RangoFechas } from '@/features/reportes/components/RangoFechas'
import { Reporte } from '@/features/reportes/components/TablaReporte'
import { describirRango, rangoEsteMes, type Rango } from '@/features/reportes/rangos'
import { tablaDesdeColumnas, type ColumnaExportable } from '@/lib/exportar'
import {
  TIPOS_MANUALES,
  etiquetaComprobante,
  formatearDia,
  formatearValor,
  useComprobantes,
  type ComprobanteConLineas,
} from '../api'
import { nombreTercero, type LineaAsiento } from './columnasLineas'
import { TablaLineas } from './TablaLineas'

type FilaDiario = LineaAsiento & { comprobante: Omit<ComprobanteConLineas, 'asientos' | 'anulacion' | 'original'> }

const columnasExportar: ColumnaExportable<FilaDiario>[] = [
  { titulo: 'Fecha', valor: (f) => f.comprobante.fecha },
  { titulo: 'Comprobante', valor: (f) => etiquetaComprobante(f.comprobante) },
  { titulo: 'Descripción', valor: (f) => f.comprobante.descripcion },
  { titulo: 'Cuenta', valor: (f) => f.cuenta },
  { titulo: 'Nombre de la cuenta', valor: (f) => f.cuenta_info?.nombre ?? '' },
  { titulo: 'Tercero', valor: nombreTercero },
  { titulo: 'Detalle', valor: (f) => f.descripcion },
  { titulo: 'Débito', valor: (f) => f.debito || null, numerica: true, total: formatearValor },
  { titulo: 'Crédito', valor: (f) => f.credito || null, numerica: true, total: formatearValor },
]

/** Libro diario: los comprobantes del período en orden de fecha, cada uno con sus líneas */
export function TabDiario() {
  const { llevaContabilidad } = usePermisos()
  const [rango, setRango] = useState<Rango>(rangoEsteMes)
  const [tipo, setTipo] = useState('')
  const { data, isLoading, error } = useComprobantes({ ...rango, tipo })
  const comprobantes = useMemo(() => data?.comprobantes ?? [], [data])
  const filas = useMemo<FilaDiario[]>(
    () => comprobantes.flatMap(({ asientos, ...comprobante }) => asientos.map((a) => ({ ...a, comprobante }))),
    [comprobantes],
  )

  return (
    <Reporte
      titulo="Libro diario"
      subtitulo={`${describirRango(rango)}${tipo ? ` · ${TIPOS_MANUALES[tipo as keyof typeof TIPOS_MANUALES]}` : ''}`}
      cargando={isLoading}
      error={error}
      puedeExportar={filas.length > 0}
      exportar={() => ({
        archivo: `libro_diario_${rango.desde}_a_${rango.hasta}`,
        ...tablaDesdeColumnas(columnasExportar, filas),
      })}
      aviso={data?.truncado && 'Hay demasiados comprobantes para mostrarlos todos: acorta el período.'}
      filtros={
        <>
          <RangoFechas valor={rango} onChange={setRango} />
          <label className="text-xs text-slate-400">
            Tipo
            <select value={tipo} onChange={(e) => setTipo(e.target.value)} className="input mt-1 w-48">
              <option value="">Todos</option>
              {Object.entries(TIPOS_MANUALES).map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          {llevaContabilidad && (
            <Link to="/contabilidad/comprobantes/nuevo" className="btn btn-primary">
              <Plus className="size-4" />
              Nuevo comprobante
            </Link>
          )}
        </>
      }
    >
      {comprobantes.length === 0 ? (
        <EstadoVacio
          icono={BookOpen}
          titulo="No hay comprobantes en este período"
          descripcion="Los comprobantes manuales los registra la contadora. Desde la fase 2, las entradas, ventas y ajustes de inventario generarán los suyos solos."
          compacto
        />
      ) : (
        <div className="divide-y-4 divide-brand-border">
          {comprobantes.map((c) => (
            <section key={c.id} className="break-inside-avoid">
              <header className="flex flex-wrap items-baseline gap-x-4 gap-y-1 bg-tinte/[0.03] px-4 py-3">
                <Link to={`/contabilidad/comprobantes/${c.id}`} className="font-mono font-medium hover:text-brand-cyan">
                  {etiquetaComprobante(c)}
                </Link>
                <span className="text-sm text-slate-400">{formatearDia(c.fecha)}</span>
                <span className="min-w-0 flex-1 text-sm text-slate-300">{c.descripcion}</span>
                {c.anulado_at && (
                  <span className="rounded-full bg-red-500/15 px-2 py-0.5 text-xs text-red-400">Anulado</span>
                )}
                {c.anula_id && (
                  <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs text-amber-400">Anulación</span>
                )}
              </header>
              <TablaLineas lineas={c.asientos} />
            </section>
          ))}
        </div>
      )}
    </Reporte>
  )
}
