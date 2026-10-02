import { CheckCircle2, CircleAlert, Loader2, Lock, LockOpen } from 'lucide-react'
import { useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { FormField } from '@/components/ui/FormField'
import { LoadingBlock } from '@/components/ui/LoadingBlock'
import { Modal } from '@/components/ui/Modal'
import { usePermisos } from '@/features/auth/permisos'
import { mensajeError } from '@/lib/errores'
import { formatearFecha } from '@/lib/format'
import {
  MESES,
  formatearDia,
  useAnularCierreAnual,
  useCerrarPeriodo,
  useChecklistCierre,
  useCierreAnual,
  useComprobantes,
  useConfiguracionContable,
  usePeriodos,
  useReabrirPeriodo,
} from '../api'

interface Mes {
  anio: number
  mes: number
  cerrado: boolean
  cerrado_at: string | null
  motivo_reapertura: string | null
}

const nombreMes = (m: Pick<Mes, 'anio' | 'mes'>) => `${MESES[m.mes - 1]} ${m.anio}`

/** Meses desde el arranque hasta hoy, del más reciente al más antiguo */
function mesesDesde(inicio: string, guardados: Mes[]): Mes[] {
  const [anioInicio, mesInicio] = inicio.split('-').map(Number) as [number, number]
  const hoy = new Date()
  const meses: Mes[] = []
  for (let a = anioInicio, m = mesInicio; a < hoy.getFullYear() || (a === hoy.getFullYear() && m <= hoy.getMonth() + 1); ) {
    const guardado = guardados.find((p) => p.anio === a && p.mes === m)
    meses.push(guardado ?? { anio: a, mes: m, cerrado: false, cerrado_at: null, motivo_reapertura: null })
    if (++m > 12) {
      m = 1
      a++
    }
  }
  return meses.reverse()
}

/** Cierre mensual: se cierran en orden; reabrir es solo de la contadora y queda con su motivo */
export function TabPeriodos() {
  const { llevaContabilidad, esContador } = usePermisos()
  const config = useConfiguracionContable()
  const periodos = usePeriodos()
  const [cerrando, setCerrando] = useState<Mes | null>(null)
  const [reabriendo, setReabriendo] = useState<Mes | null>(null)

  const inicio = config.data?.fecha_inicio
  const meses = useMemo(() => (inicio ? mesesDesde(inicio, periodos.data ?? []) : []), [inicio, periodos.data])

  if (config.isLoading || periodos.isLoading) return <LoadingBlock />
  if (periodos.error) return <p className="text-sm text-red-400">{mensajeError(periodos.error)}</p>
  if (!inicio) {
    return (
      <p className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-400">
        Define la fecha de arranque en{' '}
        <Link to="/contabilidad?t=configuracion" className="underline">
          Configuración
        </Link>{' '}
        para ver los periodos.
      </p>
    )
  }

  if (meses.length === 0) {
    return (
      <p className="text-sm text-slate-400">La contabilidad arranca el {formatearDia(inicio)}: aún no hay periodos.</p>
    )
  }

  // El siguiente que se puede cerrar es el más antiguo abierto; se reabre el último cerrado
  const siguienteACerrar = meses.findLast((m) => !m.cerrado)
  const ultimoCerrado = meses.find((m) => m.cerrado)

  return (
    <>
      <p className="mb-4 max-w-3xl text-sm text-slate-400">
        En un mes cerrado no se registra nada con fecha de ese mes. Los meses se cierran en orden, del más antiguo al más
        reciente; para corregir uno cerrado, la contadora lo reabre indicando el motivo.
      </p>
      <div className="overflow-hidden rounded-2xl border border-brand-border bg-brand-card">
        <table className="tabla-tarjetas w-full text-sm">
          <thead className="border-b border-brand-border text-left text-xs tracking-wide text-slate-400 uppercase">
            <tr>
              <th className="px-4 py-3 font-medium">Mes</th>
              <th className="px-4 py-3 font-medium">Estado</th>
              <th className="px-4 py-3 font-medium">Detalle</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-brand-border">
            {meses.map((m) => (
              <tr key={`${m.anio}-${m.mes}`}>
                <td data-principal className="px-4 py-3 font-medium text-slate-100">
                  {nombreMes(m)}
                </td>
                <td data-label="Estado" className="px-4 py-3">
                  {m.cerrado ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-slate-500/15 px-2 py-0.5 text-xs text-slate-300">
                      <Lock className="size-3" />
                      Cerrado
                    </span>
                  ) : (
                    <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs text-emerald-400">Abierto</span>
                  )}
                </td>
                <td data-label="Detalle" className="px-4 py-3 text-xs text-slate-400">
                  {m.cerrado && m.cerrado_at
                    ? `Cerrado el ${formatearFecha(m.cerrado_at)}`
                    : m.motivo_reapertura
                      ? `Reabierto: ${m.motivo_reapertura}`
                      : '—'}
                </td>
                <td className="px-4 py-3 text-right">
                  {llevaContabilidad && m === siguienteACerrar && (
                    <button onClick={() => setCerrando(m)} className="btn btn-secondary">
                      <Lock className="size-4" />
                      Cerrar mes
                    </button>
                  )}
                  {esContador && m === ultimoCerrado && (
                    <button onClick={() => setReabriendo(m)} className="btn btn-secondary">
                      <LockOpen className="size-4" />
                      Reabrir
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal open={cerrando !== null} onClose={() => setCerrando(null)} title={`Cerrar ${cerrando ? nombreMes(cerrando) : ''}`}>
        {cerrando && <CerrarForm key={`${cerrando.anio}-${cerrando.mes}`} mes={cerrando} onClose={() => setCerrando(null)} />}
      </Modal>

      <CierreAnual meses={meses} />

      <Modal open={reabriendo !== null} onClose={() => setReabriendo(null)} title={`Reabrir ${reabriendo ? nombreMes(reabriendo) : ''}`}>
        {reabriendo && <ReabrirForm mes={reabriendo} onClose={() => setReabriendo(null)} />}
      </Modal>
    </>
  )
}

function ReabrirForm({ mes, onClose }: { mes: Mes; onClose: () => void }) {
  const reabrir = useReabrirPeriodo()
  const [motivo, setMotivo] = useState('')
  const [intento, setIntento] = useState(false)
  const errorMotivo = motivo.trim().length < 5 ? 'Explica el motivo (mínimo 5 caracteres).' : undefined

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    setIntento(true)
    if (errorMotivo) return
    reabrir.mutate({ p_anio: mes.anio, p_mes: mes.mes, p_motivo: motivo.trim() }, { onSuccess: onClose })
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      <FormField label="Motivo *" error={intento ? errorMotivo : undefined} hint="Queda en el historial de cambios">
        <textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={3} maxLength={300} className="input" autoFocus />
      </FormField>
      {reabrir.error && (
        <p role="alert" className="text-sm text-red-400">
          {mensajeError(reabrir.error)}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onClose} className="btn btn-secondary">
          Cancelar
        </button>
        <button type="submit" disabled={reabrir.isPending} className="btn btn-primary">
          {reabrir.isPending && <Loader2 className="size-4 animate-spin" />}
          Reabrir mes
        </button>
      </div>
    </form>
  )
}

/** Lista de chequeo del mes: si algo falla, solo se cierra marcando «cerrar de todas formas» */
function CerrarForm({ mes, onClose }: { mes: Mes; onClose: () => void }) {
  const { data: lista = [], isLoading } = useChecklistCierre(mes.anio, mes.mes)
  const cerrar = useCerrarPeriodo()
  const [forzar, setForzar] = useState(false)
  const fallas = lista.filter((i) => !i.ok)
  const descuadre = fallas.some((i) => i.item === 'cuadre')

  return (
    <div className="space-y-4">
      {isLoading ? (
        <Loader2 className="size-5 animate-spin text-slate-500" />
      ) : (
        <ul className="space-y-2">
          {lista.map((i) => (
            <li key={i.item} className="flex items-start gap-2 text-sm">
              {i.ok ? (
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-400" />
              ) : (
                <CircleAlert className="mt-0.5 size-4 shrink-0 text-amber-400" />
              )}
              <span>
                {i.titulo}
                {i.detalle && <span className="block text-xs text-slate-400">{i.detalle}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="text-sm text-slate-400">
        Después de cerrarlo no se podrá registrar ni anular nada con fecha de ese mes, salvo que la contadora lo reabra.
      </p>
      {fallas.length > 0 && !descuadre && (
        <label className="flex items-center gap-2 text-sm text-amber-400">
          <input type="checkbox" checked={forzar} onChange={(e) => setForzar(e.target.checked)} />
          Cerrar de todas formas (quedan pendientes)
        </label>
      )}
      {cerrar.error && (
        <p role="alert" className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">
          {mensajeError(cerrar.error)}
        </p>
      )}
      <div className="flex justify-end gap-3">
        <button type="button" onClick={onClose} className="btn btn-secondary">
          Cancelar
        </button>
        <button
          onClick={() => cerrar.mutate({ p_anio: mes.anio, p_mes: mes.mes, p_forzar: forzar }, { onSuccess: onClose })}
          disabled={cerrar.isPending || isLoading || descuadre || (fallas.length > 0 && !forzar)}
          className="btn btn-primary"
        >
          {cerrar.isPending && <Loader2 className="size-4 animate-spin" />}
          Cerrar mes
        </button>
      </div>
    </div>
  )
}

/**
 * Cierre del ejercicio: lleva ingresos, gastos y costos a la utilidad del ejercicio (3605) el 31 de diciembre. Se
 * hace con los meses hasta noviembre cerrados y diciembre abierto; después se cierra diciembre.
 */
function CierreAnual({ meses }: { meses: Mes[] }) {
  const { llevaContabilidad } = usePermisos()
  const anios = [...new Set(meses.filter((m) => m.mes === 12).map((m) => m.anio))]
  const [anio, setAnio] = useState(anios[0] ?? 0)
  const cierres = useComprobantes({ desde: `${anio}-12-31`, hasta: `${anio}-12-31`, tipo: 'CI' })
  const cierre = (cierres.data?.comprobantes ?? []).find((c) => !c.anulado_at && !c.anula_id)
  const cerrar = useCierreAnual()
  const anular = useAnularCierreAnual()
  const [motivo, setMotivo] = useState('')
  const diciembre = meses.find((m) => m.anio === anio && m.mes === 12)

  if (anios.length === 0) return null

  return (
    <section className="mt-6 rounded-2xl border border-brand-border bg-brand-card p-5">
      <h2 className="font-semibold">Cierre del ejercicio</h2>
      <p className="mt-1 text-sm text-slate-400">
        Lleva los saldos de ingresos, gastos y costos (clases 4, 5 y 6) a la utilidad del ejercicio (3605) con fecha 31 de
        diciembre. Requiere los meses hasta noviembre cerrados y diciembre abierto.
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <select value={anio} onChange={(e) => setAnio(Number(e.target.value))} className="input w-28" aria-label="Año">
          {anios.map((a) => (
            <option key={a}>{a}</option>
          ))}
        </select>
        {cierre ? (
          <span className="flex items-center gap-1 text-sm text-emerald-400">
            <CheckCircle2 className="size-4" />
            Cerrado con el {`CI-${String(cierre.numero).padStart(6, '0')}`}
          </span>
        ) : (
          llevaContabilidad && (
            <button
              onClick={() => cerrar.mutate({ p_anio: anio })}
              disabled={cerrar.isPending || diciembre?.cerrado}
              className="btn btn-primary"
            >
              {cerrar.isPending && <Loader2 className="size-4 animate-spin" />}
              Cerrar el ejercicio {anio}
            </button>
          )
        )}
      </div>
      {cierre && llevaContabilidad && !diciembre?.cerrado && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Motivo para deshacer el cierre"
            maxLength={300}
            className="input w-72"
          />
          <button
            onClick={() => anular.mutate({ p_anio: anio, p_motivo: motivo.trim() }, { onSuccess: () => setMotivo('') })}
            disabled={anular.isPending || motivo.trim().length < 5}
            className="btn btn-secondary"
          >
            Deshacer el cierre
          </button>
        </div>
      )}
      {(cerrar.error || anular.error) && (
        <p role="alert" className="mt-2 text-sm text-red-400">
          {mensajeError(cerrar.error ?? anular.error)}
        </p>
      )}
    </section>
  )
}
