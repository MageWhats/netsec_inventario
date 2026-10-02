import { CheckCircle2, Laptop, Loader2, Pencil, Plus, TrendingDown } from 'lucide-react'
import { useMemo, useState, type FormEvent } from 'react'
import { EstadoVacio } from '@/components/ui/EstadoVacio'
import { FormField } from '@/components/ui/FormField'
import { LoadingBlock } from '@/components/ui/LoadingBlock'
import { Modal } from '@/components/ui/Modal'
import { usePermisos } from '@/features/auth/permisos'
import { Cifra } from '@/features/reportes/components/TablaReporte'
import { mensajeError } from '@/lib/errores'
import { fechaIso } from '@/lib/exportar'
import {
  MESES,
  formatearDia,
  formatearValor,
  useActivosFijos,
  useCuentas,
  useDepreciarMes,
  useGuardarActivo,
  type ActivoConDepreciacion,
} from '../api'
import { SelectorCuenta } from './Selectores'

/** Computadores, muebles, vehículos: su costo, lo depreciado y la depreciación de cada mes */
export function TabActivos() {
  const { llevaContabilidad } = usePermisos()
  const { data: activos = [], isLoading, error } = useActivosFijos()
  const [edicion, setEdicion] = useState<ActivoConDepreciacion | 'nuevo' | null>(null)
  const depreciar = useDepreciarMes()
  const hoy = new Date()
  // Por defecto, el mes pasado (la depreciación se registra al cerrar el mes)
  const [periodo, setPeriodo] = useState(() => {
    const d = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })
  const [resultado, setResultado] = useState<string | null>(null)

  const vigentes = activos.filter((a) => !a.fecha_baja)
  const costo = vigentes.reduce((s, a) => s + a.costo, 0)
  const depreciado = vigentes.reduce((s, a) => s + a.depreciado, 0)

  function onDepreciar() {
    const [anio, mes] = periodo.split('-').map(Number) as [number, number]
    setResultado(null)
    depreciar.mutate(
      { p_anio: anio, p_mes: mes },
      {
        onSuccess: (n) =>
          setResultado(
            n === 0
              ? `No había nada por depreciar en ${MESES[mes - 1]!.toLowerCase()} de ${anio}.`
              : `Depreciación de ${MESES[mes - 1]!.toLowerCase()} de ${anio} registrada (${n} ${n === 1 ? 'activo' : 'activos'}).`,
          ),
      },
    )
  }

  if (isLoading) return <LoadingBlock />
  if (error) return <p className="text-sm text-red-400">{mensajeError(error)}</p>

  const botonNuevo = llevaContabilidad && (
    <button onClick={() => setEdicion('nuevo')} className="btn btn-primary">
      <Plus className="size-4" />
      Nuevo activo
    </button>
  )

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <p className="max-w-2xl text-sm text-slate-400">
          Depreciación en línea recta, desde el mes siguiente a la compra: (costo − valor residual) ÷ vida útil. La compra
          se registra con un egreso o un comprobante a la cuenta del activo (1524, 1528).
        </p>
        {botonNuevo}
      </div>

      {activos.length > 0 && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Cifra label="Costo de los activos" valor={formatearValor(costo)} />
          <Cifra label="Depreciación acumulada" valor={formatearValor(depreciado)} icono={TrendingDown} />
          <Cifra label="Valor en libros" valor={formatearValor(costo - depreciado)} />
        </div>
      )}

      {llevaContabilidad && activos.length > 0 && (
        <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-brand-border bg-brand-card p-4">
          <label className="text-xs text-slate-400">
            Mes a depreciar
            <input
              type="month"
              value={periodo}
              max={fechaIso(hoy).slice(0, 7)}
              onChange={(e) => e.target.value && setPeriodo(e.target.value)}
              className="input mt-1 w-44"
            />
          </label>
          <button onClick={onDepreciar} disabled={depreciar.isPending} className="btn btn-secondary">
            {depreciar.isPending && <Loader2 className="size-4 animate-spin" />}
            Registrar depreciación del mes
          </button>
          {resultado && (
            <span className="flex items-center gap-1 text-sm text-emerald-400">
              <CheckCircle2 className="size-4" />
              {resultado}
            </span>
          )}
          {depreciar.error && <span className="text-sm text-red-400">{mensajeError(depreciar.error)}</span>}
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-brand-border bg-brand-card">
        {activos.length === 0 ? (
          <EstadoVacio icono={Laptop} titulo="Aún no hay activos fijos" accion={botonNuevo} compacto />
        ) : (
          <table className="tabla-tarjetas w-full text-sm">
            <thead className="border-b border-brand-border text-left text-xs tracking-wide text-slate-400 uppercase">
              <tr>
                <th className="px-4 py-3 font-medium">Activo</th>
                <th className="px-4 py-3 font-medium">Compra</th>
                <th className="px-4 py-3 text-right font-medium">Costo</th>
                <th className="px-4 py-3 text-right font-medium">Depreciado</th>
                <th className="px-4 py-3 text-right font-medium">En libros</th>
                <th className="px-4 py-3 font-medium">Vida útil</th>
                {llevaContabilidad && <th className="px-4 py-3" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-border">
              {activos.map((a) => {
                const meses = Math.round((a.depreciado / Math.max(a.costo - a.valor_residual, 1)) * a.vida_util_meses)
                return (
                  <tr key={a.id} className={a.fecha_baja ? 'opacity-50' : ''}>
                    <td data-principal className="px-4 py-3">
                      <span className="font-medium text-slate-100">{a.nombre}</span>
                      <span className="block text-xs text-slate-500">
                        PUC {a.cuenta}
                        {a.serial && ` · ${a.serial}`}
                        {a.fecha_baja && ` · dado de baja el ${formatearDia(a.fecha_baja)}`}
                      </span>
                    </td>
                    <td data-label="Compra" className="px-4 py-3 whitespace-nowrap text-slate-400">
                      {formatearDia(a.fecha_compra)}
                    </td>
                    <td data-label="Costo" className="px-4 py-3 text-right tabular-nums">
                      {formatearValor(a.costo)}
                    </td>
                    <td data-label="Depreciado" className="px-4 py-3 text-right text-slate-400 tabular-nums">
                      {formatearValor(a.depreciado)}
                    </td>
                    <td data-label="En libros" className="px-4 py-3 text-right font-medium tabular-nums">
                      {formatearValor(a.costo - a.depreciado)}
                    </td>
                    <td data-label="Vida útil" className="px-4 py-3 text-slate-400">
                      {Math.min(meses, a.vida_util_meses)} de {a.vida_util_meses} meses
                    </td>
                    {llevaContabilidad && (
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => setEdicion(a)}
                          className="rounded-lg p-1.5 text-slate-400 hover:bg-tinte/5 hover:text-slate-200"
                          aria-label={`Editar ${a.nombre}`}
                        >
                          <Pencil className="size-4" />
                        </button>
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      <Modal open={edicion !== null} onClose={() => setEdicion(null)} title={edicion === 'nuevo' ? 'Nuevo activo fijo' : 'Editar activo'}>
        {edicion && (
          <ActivoForm key={edicion === 'nuevo' ? 'nuevo' : edicion.id} activo={edicion === 'nuevo' ? null : edicion} onClose={() => setEdicion(null)} />
        )}
      </Modal>
    </div>
  )
}

function ActivoForm({ activo, onClose }: { activo: ActivoConDepreciacion | null; onClose: () => void }) {
  const guardar = useGuardarActivo()
  const cuentas = useCuentas()
  const conDepreciaciones = Boolean(activo && activo.depreciado > activo.depreciacion_inicial)
  const disponibles = useMemo(() => (cuentas.data ?? []).filter((c) => c.codigo.startsWith('15') && !c.codigo.startsWith('1592')), [cuentas.data])
  const [nombre, setNombre] = useState(activo?.nombre ?? '')
  const [cuenta, setCuenta] = useState(activo?.cuenta ?? '1528')
  const [fecha, setFecha] = useState(activo?.fecha_compra ?? fechaIso(new Date()))
  const [costo, setCosto] = useState(activo?.costo ?? Number.NaN)
  const [residual, setResidual] = useState(activo?.valor_residual ?? 0)
  const [vida, setVida] = useState(activo?.vida_util_meses ?? 36)
  const [inicial, setInicial] = useState(activo?.depreciacion_inicial ?? 0)
  const [serial, setSerial] = useState(activo?.serial ?? '')
  const [notas, setNotas] = useState(activo?.notas ?? '')
  const [baja, setBaja] = useState(activo?.fecha_baja ?? '')
  const [intento, setIntento] = useState(false)

  const errores = {
    nombre: nombre.trim().length < 2 ? 'Escribe el nombre.' : undefined,
    cuenta: !cuenta ? 'Elige la cuenta.' : undefined,
    costo: !Number.isFinite(costo) || costo <= 0 ? 'Escribe el costo.' : undefined,
    vida: !Number.isFinite(vida) || vida < 1 ? 'Indica los meses.' : undefined,
    inicial:
      (residual || 0) + (inicial || 0) > (costo || 0) ? 'Lo depreciado más el residual no puede superar el costo.' : undefined,
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    setIntento(true)
    if (Object.values(errores).some(Boolean)) return
    guardar.mutate(
      {
        ...(activo && { id: activo.id }),
        nombre: nombre.trim(),
        serial: serial.trim() || null,
        notas: notas.trim() || null,
        fecha_baja: baja || null,
        ...(!conDepreciaciones && {
          cuenta,
          fecha_compra: fecha,
          costo,
          valor_residual: residual || 0,
          vida_util_meses: vida,
          depreciacion_inicial: inicial || 0,
        }),
      } as Parameters<typeof guardar.mutate>[0],
      { onSuccess: onClose },
    )
  }
  const error = (c: keyof typeof errores) => (intento ? errores[c] : undefined)
  const numero = (valor: number, set: (n: number) => void) => (
    <input
      type="number"
      min={0}
      step="any"
      value={Number.isFinite(valor) ? valor : ''}
      onChange={(e) => set(e.target.valueAsNumber)}
      disabled={conDepreciaciones}
      className="input"
    />
  )

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      {conDepreciaciones && (
        <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-amber-400">
          Ya tiene depreciaciones registradas: solo se cambian el nombre, el serial, las notas y la baja.
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Nombre *" error={error('nombre')} className="sm:col-span-2">
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={150} className="input" autoFocus />
        </FormField>
        <FormField label="Cuenta del activo *" error={error('cuenta')}>
          {conDepreciaciones ? (
            <input value={cuenta} disabled className="input font-mono" />
          ) : (
            <SelectorCuenta cuentas={disponibles} soloMovimiento value={cuenta} onChange={setCuenta} />
          )}
        </FormField>
        <FormField label="Fecha de compra *">
          <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} disabled={conDepreciaciones} className="input" />
        </FormField>
        <FormField label="Costo *" error={error('costo')}>
          {numero(costo, setCosto)}
        </FormField>
        <FormField label="Vida útil (meses) *" error={error('vida')} hint="Computadores 36, muebles 120">
          {numero(vida, setVida)}
        </FormField>
        <FormField label="Valor residual">{numero(residual, setResidual)}</FormField>
        <FormField label="Depreciado antes del arranque" error={error('inicial')} hint="Si se compró antes de llevar la contabilidad aquí">
          {numero(inicial, setInicial)}
        </FormField>
        <FormField label="Serial">
          <input value={serial} onChange={(e) => setSerial(e.target.value)} maxLength={100} className="input" />
        </FormField>
        <FormField label="Fecha de baja" hint="Vendido, dañado o retirado: deja de depreciarse">
          <input type="date" value={baja} min={fecha} onChange={(e) => setBaja(e.target.value)} className="input" />
        </FormField>
        <FormField label="Notas" className="sm:col-span-2">
          <input value={notas} onChange={(e) => setNotas(e.target.value)} maxLength={500} className="input" />
        </FormField>
      </div>
      {guardar.error && (
        <p role="alert" className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">
          {mensajeError(guardar.error)}
        </p>
      )}
      <div className="flex justify-end gap-3">
        <button type="button" onClick={onClose} className="btn btn-secondary">
          Cancelar
        </button>
        <button type="submit" disabled={guardar.isPending} className="btn btn-primary">
          {guardar.isPending && <Loader2 className="size-4 animate-spin" />}
          Guardar
        </button>
      </div>
    </form>
  )
}
