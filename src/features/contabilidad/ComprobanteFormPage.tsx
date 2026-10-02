import { CheckCircle2, Loader2, Plus, Trash2, TriangleAlert } from 'lucide-react'
import { useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { FormField } from '@/components/ui/FormField'
import { LoadingBlock } from '@/components/ui/LoadingBlock'
import { PageHeader } from '@/components/ui/PageHeader'
import { mensajeError } from '@/lib/errores'
import { fechaIso } from '@/lib/exportar'
import {
  TIPOS_MANUALES,
  formatearDia,
  formatearValor,
  useConfiguracionContable,
  useCuentas,
  useOpcionesTercero,
  useRegistrarComprobante,
  type Cuenta,
  type LineaComprobante,
  type OpcionTercero,
  type TipoManual,
} from './api'
import { SelectorCuenta, SelectorTercero } from './components/Selectores'

interface Linea {
  clave: number
  cuenta: string
  tercero: Pick<OpcionTercero, 'clase' | 'id'> | null
  descripcion: string
  debito: number
  credito: number
}

let siguienteClave = 0
const lineaVacia = (): Linea => ({
  clave: siguienteClave++,
  cuenta: '',
  tercero: null,
  descripcion: '',
  debito: Number.NaN,
  credito: Number.NaN,
})

const valor = (n: number) => (Number.isFinite(n) ? Math.round(n * 100) / 100 : 0)

function errorLinea(l: Linea, cuentas: Map<string, Cuenta>): string | undefined {
  if (!l.cuenta) return 'Elige la cuenta.'
  const d = valor(l.debito)
  const c = valor(l.credito)
  if (d < 0 || c < 0) return 'Los valores no pueden ser negativos.'
  if ((d > 0) === (c > 0)) return 'Escribe el valor en débito o en crédito (uno solo).'
  if (cuentas.get(l.cuenta)?.exige_tercero && !l.tercero) return 'Esta cuenta exige indicar el tercero.'
  return undefined
}

/** Comprobante contable manual o de saldos iniciales: líneas libres que deben cuadrar */
export function ComprobanteFormPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const config = useConfiguracionContable()
  const cuentas = useCuentas()
  const terceros = useOpcionesTercero()
  const registrar = useRegistrarComprobante()

  const [tipo, setTipo] = useState<TipoManual>(params.get('tipo') === 'SI' ? 'SI' : 'CC')
  const [fecha, setFecha] = useState(() => fechaIso(new Date()))
  const [descripcion, setDescripcion] = useState(tipo === 'SI' ? 'Saldos iniciales de la contabilidad' : '')
  const [lineas, setLineas] = useState<Linea[]>(() => [lineaVacia(), lineaVacia()])
  const [intento, setIntento] = useState(false)

  const porCodigo = useMemo(() => new Map((cuentas.data ?? []).map((c) => [c.codigo, c])), [cuentas.data])
  const inicio = config.data?.fecha_inicio ?? null
  // Los saldos iniciales van siempre con la fecha de arranque
  const fechaEfectiva = tipo === 'SI' && inicio ? inicio : fecha

  const totalDebito = lineas.reduce((s, l) => s + valor(l.debito), 0)
  const totalCredito = lineas.reduce((s, l) => s + valor(l.credito), 0)
  const diferencia = Math.round((totalDebito - totalCredito) * 100) / 100
  const cuadra = diferencia === 0 && totalDebito > 0

  const errores = lineas.map((l) => errorLinea(l, porCodigo))
  const errorDescripcion = descripcion.trim().length < 3 ? 'Describe el comprobante.' : undefined
  const errorFecha = !fechaEfectiva
    ? 'La fecha es obligatoria.'
    : inicio && fechaEfectiva < inicio
      ? `La contabilidad arranca el ${formatearDia(inicio)}.`
      : undefined
  const hayErrores = Boolean(errorDescripcion || errorFecha || errores.some(Boolean) || !cuadra)

  const actualizar = (clave: number, cambios: Partial<Linea>) =>
    setLineas((ls) => ls.map((l) => (l.clave === clave ? { ...l, ...cambios } : l)))

  /** Completa la línea con lo que falta para cuadrar */
  function cuadrarCon(l: Linea) {
    const resto = Math.round((totalDebito - valor(l.debito) - (totalCredito - valor(l.credito))) * 100) / 100
    if (resto === 0) return
    actualizar(l.clave, resto > 0 ? { credito: resto, debito: Number.NaN } : { debito: -resto, credito: Number.NaN })
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    setIntento(true)
    if (hayErrores) return
    const datos: LineaComprobante[] = lineas.map((l) => ({
      cuenta: l.cuenta,
      debito: valor(l.debito),
      credito: valor(l.credito),
      descripcion: l.descripcion.trim() || undefined,
      ...(l.tercero && { [`${l.tercero.clase}_id`]: l.tercero.id }),
    }))
    registrar.mutate(
      { tipo, fecha: fechaEfectiva, descripcion: descripcion.trim(), lineas: datos },
      { onSuccess: (id) => navigate(`/contabilidad/comprobantes/${id}`, { replace: true }) },
    )
  }

  if (config.isLoading || cuentas.isLoading) return <LoadingBlock />
  if (!inicio) {
    return (
      <>
        <PageHeader title="Nuevo comprobante" />
        <p className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-400">
          Antes de registrar comprobantes hay que definir la fecha de arranque de la contabilidad en{' '}
          <Link to="/contabilidad?t=configuracion" className="underline">
            Contabilidad → Configuración
          </Link>
          .
        </p>
      </>
    )
  }

  return (
    <>
      <PageHeader
        title="Nuevo comprobante"
        description="Cada línea va a una cuenta de último nivel, en débito o en crédito. Solo se guarda si cuadra."
      />

      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <div className="grid gap-4 rounded-2xl border border-brand-border bg-brand-card p-4 sm:grid-cols-3">
          <FormField label="Tipo *">
            <select
              value={tipo}
              onChange={(e) => {
                const nuevo = e.target.value as TipoManual
                setTipo(nuevo)
                if (nuevo === 'SI' && !descripcion) setDescripcion('Saldos iniciales de la contabilidad')
              }}
              className="input"
            >
              {Object.entries(TIPOS_MANUALES).map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
          </FormField>
          <FormField
            label="Fecha *"
            error={intento ? errorFecha : undefined}
            hint={tipo === 'SI' ? 'Los saldos iniciales van con la fecha de arranque' : undefined}
          >
            <input
              type="date"
              value={fechaEfectiva}
              min={inicio}
              disabled={tipo === 'SI'}
              onChange={(e) => setFecha(e.target.value)}
              className="input"
            />
          </FormField>
          <FormField label="Descripción *" error={intento ? errorDescripcion : undefined}>
            <input
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              maxLength={300}
              placeholder="Depreciación de septiembre, causación del arriendo…"
              className="input"
            />
          </FormField>
        </div>

        <div className="space-y-3">
          {lineas.map((l, i) => {
            const cuenta = porCodigo.get(l.cuenta)
            const error = intento ? errores[i] : undefined
            return (
              <div
                key={l.clave}
                className={`grid gap-3 rounded-2xl border bg-brand-card p-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1.5fr)_minmax(0,1.5fr)_8rem_8rem_auto] ${
                  error ? 'border-red-500/40' : 'border-brand-border'
                }`}
              >
                <FormField label={`Cuenta · línea ${i + 1}`}>
                  <SelectorCuenta
                    cuentas={cuentas.data ?? []}
                    soloMovimiento
                    value={l.cuenta}
                    onChange={(codigo) => actualizar(l.clave, { cuenta: codigo })}
                  />
                </FormField>
                <FormField label={cuenta?.exige_tercero ? 'Tercero *' : 'Tercero'}>
                  <SelectorTercero
                    opciones={terceros.data ?? []}
                    value={l.tercero}
                    onChange={(t) => actualizar(l.clave, { tercero: t && { clase: t.clase, id: t.id } })}
                  />
                </FormField>
                <FormField label="Detalle">
                  <input
                    value={l.descripcion}
                    onChange={(e) => actualizar(l.clave, { descripcion: e.target.value })}
                    maxLength={200}
                    className="input"
                  />
                </FormField>
                <FormField label="Débito">
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    inputMode="decimal"
                    value={Number.isFinite(l.debito) ? l.debito : ''}
                    onChange={(e) => actualizar(l.clave, { debito: e.target.valueAsNumber })}
                    onDoubleClick={() => cuadrarCon(l)}
                    className="input text-right tabular-nums"
                  />
                </FormField>
                <FormField label="Crédito">
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    inputMode="decimal"
                    value={Number.isFinite(l.credito) ? l.credito : ''}
                    onChange={(e) => actualizar(l.clave, { credito: e.target.valueAsNumber })}
                    onDoubleClick={() => cuadrarCon(l)}
                    className="input text-right tabular-nums"
                  />
                </FormField>
                <div className="flex items-end gap-1">
                  <button
                    type="button"
                    onClick={() => cuadrarCon(l)}
                    className="btn btn-secondary"
                    title="Poner aquí lo que falta para cuadrar"
                  >
                    Cuadrar
                  </button>
                  <button
                    type="button"
                    onClick={() => setLineas((ls) => ls.filter((x) => x.clave !== l.clave))}
                    disabled={lineas.length <= 2}
                    className="btn btn-secondary"
                    aria-label={`Quitar la línea ${i + 1}`}
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
                {error && <p className="text-sm text-red-400 lg:col-span-6">{error}</p>}
              </div>
            )
          })}
          <button type="button" onClick={() => setLineas((ls) => [...ls, lineaVacia()])} className="btn btn-secondary">
            <Plus className="size-4" />
            Agregar línea
          </button>
        </div>

        <div className="sticky bottom-0 z-10 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-brand-border bg-brand-card p-4">
          <div className="flex flex-wrap gap-6 text-sm">
            <p>
              <span className="text-slate-400">Débitos </span>
              <strong className="tabular-nums">{formatearValor(totalDebito)}</strong>
            </p>
            <p>
              <span className="text-slate-400">Créditos </span>
              <strong className="tabular-nums">{formatearValor(totalCredito)}</strong>
            </p>
            {cuadra ? (
              <p className="flex items-center gap-1 text-emerald-400">
                <CheckCircle2 className="size-4" />
                Cuadra
              </p>
            ) : (
              <p className="flex items-center gap-1 text-amber-400">
                <TriangleAlert className="size-4" />
                {totalDebito === 0 && totalCredito === 0
                  ? 'Sin valores'
                  : `Diferencia ${formatearValor(Math.abs(diferencia))}`}
              </p>
            )}
          </div>
          <div className="flex gap-2">
            <Link to="/contabilidad" className="btn btn-secondary">
              Cancelar
            </Link>
            <button type="submit" disabled={registrar.isPending} className="btn btn-primary">
              {registrar.isPending && <Loader2 className="size-4 animate-spin" />}
              Guardar comprobante
            </button>
          </div>
          {registrar.error && (
            <p role="alert" className="w-full text-sm text-red-400">
              {mensajeError(registrar.error)}
            </p>
          )}
        </div>
      </form>
    </>
  )
}
