import { CheckCircle2, Loader2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { FormField } from '@/components/ui/FormField'
import { LoadingBlock } from '@/components/ui/LoadingBlock'
import { usePermisos } from '@/features/auth/permisos'
import { mensajeError } from '@/lib/errores'
import {
  codigosConHijas,
  formatearDia,
  useActualizarConfiguracion,
  useActualizarParametro,
  useConfiguracionContable,
  useCuentas,
  useParametros,
  type ConfiguracionContable,
} from '../api'

/** Datos contables de la empresa y cuentas de los asientos automáticos */
export function TabConfiguracion() {
  const config = useConfiguracionContable()
  if (config.isLoading) return <LoadingBlock />
  if (config.error) return <p className="text-sm text-red-400">{mensajeError(config.error)}</p>
  if (!config.data) return <p className="text-sm text-slate-400">No hay configuración contable.</p>
  return (
    <div className="space-y-6">
      <FormConfiguracion key={config.data.updated_at} config={config.data} />
      <Parametros />
    </div>
  )
}

function FormConfiguracion({ config }: { config: ConfiguracionContable }) {
  const { llevaContabilidad } = usePermisos()
  const actualizar = useActualizarConfiguracion()
  const [mesInicio, setMesInicio] = useState(config.fecha_inicio?.slice(0, 7) ?? '')
  const [marco, setMarco] = useState(config.marco)
  const [regimen, setRegimen] = useState(config.regimen)
  const [responsableIva, setResponsableIva] = useState(config.responsable_iva)
  const [agenteRetencion, setAgenteRetencion] = useState(config.agente_retencion)
  const [tarifaIva, setTarifaIva] = useState(config.tarifa_iva)
  const [municipio, setMunicipio] = useState(config.municipio_ica ?? '')
  const [periodicidad, setPeriodicidad] = useState(config.periodicidad_ica ?? 'Bimestral')
  const [ciiu, setCiiu] = useState(config.actividad_ciiu ?? '')
  const [tarifaIca, setTarifaIca] = useState(config.tarifa_ica ?? Number.NaN)
  const [guardado, setGuardado] = useState(false)

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    setGuardado(false)
    actualizar.mutate(
      {
        fecha_inicio: mesInicio ? `${mesInicio}-01` : null,
        marco: marco.trim(),
        regimen: regimen.trim(),
        responsable_iva: responsableIva,
        agente_retencion: agenteRetencion,
        tarifa_iva: tarifaIva,
        municipio_ica: municipio.trim() || null,
        periodicidad_ica: periodicidad,
        actividad_ciiu: ciiu.trim() || null,
        tarifa_ica: Number.isFinite(tarifaIca) ? tarifaIca : null,
      },
      { onSuccess: () => setGuardado(true) },
    )
  }

  return (
    <form onSubmit={onSubmit} className="rounded-2xl border border-brand-border bg-brand-card p-5">
      <fieldset disabled={!llevaContabilidad} className="space-y-5">
        <div>
          <h2 className="font-semibold">Arranque</h2>
          <p className="mt-1 text-sm text-slate-400">
            El primer día de un mes, con inventario físico ese día. Antes de esa fecha no se registra nada. Deja de poder
            cambiarse en cuanto se registre el primer comprobante.
          </p>
          <FormField
            label="Mes de arranque"
            className="mt-3 max-w-xs"
            hint={config.fecha_inicio ? `Arranca el ${formatearDia(config.fecha_inicio)}` : 'Sin definir'}
          >
            <input type="month" value={mesInicio} onChange={(e) => setMesInicio(e.target.value)} className="input" />
          </FormField>
        </div>

        <div>
          <h2 className="font-semibold">Régimen y marco contable</h2>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <FormField label="Marco contable">
              <input value={marco} onChange={(e) => setMarco(e.target.value)} maxLength={100} className="input" />
            </FormField>
            <FormField label="Régimen">
              <input value={regimen} onChange={(e) => setRegimen(e.target.value)} maxLength={100} className="input" />
            </FormField>
          </div>
          <div className="mt-3 flex flex-wrap gap-6 text-sm text-slate-300">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={responsableIva} onChange={(e) => setResponsableIva(e.target.checked)} />
              Responsable de IVA
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={agenteRetencion} onChange={(e) => setAgenteRetencion(e.target.checked)} />
              Agente de retención
            </label>
          </div>
        </div>

        <div>
          <h2 className="font-semibold">Impuestos</h2>
          <p className="mt-1 text-sm text-slate-400">
            {responsableIva
              ? 'Las ventas llevan IVA y el IVA de las compras se descuenta.'
              : 'Sin responsabilidad de IVA: las ventas no lo llevan y el IVA de las compras suma al costo.'}
          </p>
          <div className="mt-3 grid gap-4 sm:grid-cols-3">
            <FormField label="Tarifa general de IVA (%)">
              <input
                type="number"
                min={0}
                max={100}
                step="0.01"
                value={Number.isFinite(tarifaIva) ? tarifaIva : ''}
                onChange={(e) => setTarifaIva(e.target.valueAsNumber)}
                className="input"
              />
            </FormField>
            <FormField label="Municipio del ICA">
              <input value={municipio} onChange={(e) => setMunicipio(e.target.value)} maxLength={100} className="input" />
            </FormField>
            <FormField label="Periodicidad del ICA">
              <select value={periodicidad} onChange={(e) => setPeriodicidad(e.target.value)} className="input">
                <option>Mensual</option>
                <option>Bimestral</option>
                <option>Anual</option>
              </select>
            </FormField>
            <FormField label="Actividad económica (CIIU)" hint="Pendiente de definir con la contadora">
              <input
                value={ciiu}
                onChange={(e) => setCiiu(e.target.value.replace(/\D/g, '').slice(0, 4))}
                inputMode="numeric"
                placeholder="4741"
                className="input"
              />
            </FormField>
            <FormField label="Tarifa de ICA (por mil)" hint="Depende de la actividad">
              <input
                type="number"
                min={0}
                step="0.001"
                value={Number.isFinite(tarifaIca) ? tarifaIca : ''}
                onChange={(e) => setTarifaIca(e.target.valueAsNumber)}
                className="input"
              />
            </FormField>
          </div>
        </div>

        {llevaContabilidad && (
          <div className="flex flex-wrap items-center gap-3">
            <button type="submit" disabled={actualizar.isPending} className="btn btn-primary">
              {actualizar.isPending && <Loader2 className="size-4 animate-spin" />}
              Guardar configuración
            </button>
            {guardado && (
              <span className="flex items-center gap-1 text-sm text-emerald-400">
                <CheckCircle2 className="size-4" />
                Guardado
              </span>
            )}
            {actualizar.error && (
              <span role="alert" className="text-sm text-red-400">
                {mensajeError(actualizar.error)}
              </span>
            )}
          </div>
        )}
      </fieldset>
    </form>
  )
}

function Parametros() {
  const { llevaContabilidad } = usePermisos()
  const parametros = useParametros()
  const cuentas = useCuentas()
  const actualizar = useActualizarParametro()
  const conHijas = codigosConHijas(cuentas.data ?? [])
  const hojas = (cuentas.data ?? []).filter((c) => c.activa && !conHijas.has(c.codigo))

  return (
    <section className="rounded-2xl border border-brand-border bg-brand-card">
      <div className="p-5 pb-3">
        <h2 className="font-semibold">Cuentas de los asientos automáticos</h2>
        <p className="mt-1 text-sm text-slate-400">
          Qué cuenta usa cada asiento que la aplicación genere sola (desde la fase 2: inventario, ventas, ajustes por
          motivo). Se cambian aquí sin tocar el código.
        </p>
        {actualizar.error && (
          <p role="alert" className="mt-2 text-sm text-red-400">
            {mensajeError(actualizar.error)}
          </p>
        )}
      </div>
      {parametros.isLoading || cuentas.isLoading ? (
        <LoadingBlock />
      ) : (
        <table className="w-full text-sm">
          <tbody className="divide-y divide-brand-border">
            {(parametros.data ?? []).map((p) => (
              <tr key={p.clave}>
                <td className="px-5 py-2.5 text-slate-300">{p.nombre}</td>
                <td className="px-5 py-2.5">
                  <select
                    value={p.cuenta}
                    disabled={!llevaContabilidad || actualizar.isPending}
                    onChange={(e) => actualizar.mutate({ clave: p.clave, cuenta: e.target.value })}
                    className="input w-full max-w-md"
                    aria-label={p.nombre}
                  >
                    {!hojas.some((c) => c.codigo === p.cuenta) && <option value={p.cuenta}>{p.cuenta}</option>}
                    {hojas.map((c) => (
                      <option key={c.codigo} value={c.codigo}>
                        {c.codigo} · {c.nombre}
                      </option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}
