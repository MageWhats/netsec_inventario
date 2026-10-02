import { Loader2, Lock, LockOpen } from 'lucide-react'
import { useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { FormField } from '@/components/ui/FormField'
import { LoadingBlock } from '@/components/ui/LoadingBlock'
import { Modal } from '@/components/ui/Modal'
import { usePermisos } from '@/features/auth/permisos'
import { mensajeError } from '@/lib/errores'
import { formatearFecha } from '@/lib/format'
import { MESES, formatearDia, useCerrarPeriodo, useConfiguracionContable, usePeriodos, useReabrirPeriodo } from '../api'

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
  const cerrar = useCerrarPeriodo()
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

      <ConfirmDialog
        open={cerrando !== null}
        title={`Cerrar ${cerrando ? nombreMes(cerrando) : ''}`}
        confirmLabel="Cerrar mes"
        pending={cerrar.isPending}
        error={cerrar.error ? mensajeError(cerrar.error) : null}
        onConfirm={() =>
          cerrando &&
          cerrar.mutate({ p_anio: cerrando.anio, p_mes: cerrando.mes }, { onSuccess: () => setCerrando(null) })
        }
        onClose={() => {
          setCerrando(null)
          cerrar.reset()
        }}
      >
        Después de cerrarlo no se podrá registrar ni anular nada con fecha de ese mes, salvo que la contadora lo reabra.
        Revisa antes el balance de prueba del mes.
      </ConfirmDialog>

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
