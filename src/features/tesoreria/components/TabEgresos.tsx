import { Ban, Loader2, Plus, Receipt } from 'lucide-react'
import { useMemo, useState, type FormEvent } from 'react'
import { EstadoVacio } from '@/components/ui/EstadoVacio'
import { FormField } from '@/components/ui/FormField'
import { Modal } from '@/components/ui/Modal'
import { usePermisos } from '@/features/auth/permisos'
import { metodosPago, type MetodoPago } from '@/features/cartera/api'
import {
  formatearDia,
  formatearValor,
  useCuentas,
  useOpcionesTercero,
  useSaldosPorTercero,
  type OpcionTercero,
} from '@/features/contabilidad/api'
import { SelectorCuenta, SelectorTercero } from '@/features/contabilidad/components/Selectores'
import { RangoFechas } from '@/features/reportes/components/RangoFechas'
import { Reporte, TablaReporte, type Columna } from '@/features/reportes/components/TablaReporte'
import { describirRango, rangoEsteMes, type Rango } from '@/features/reportes/rangos'
import { mensajeError } from '@/lib/errores'
import { fechaIso, tablaDesdeColumnas } from '@/lib/exportar'
import { etiquetaDocumento, useEgresos, useRegistrarEgreso, type Egreso } from '../api'
import { AnularDocumentoModal, BadgeAnulado, SelectorCaja } from './Comunes'

/** Atajos para los pagos más comunes que no son a proveedores */
const ATAJOS = [
  { cuenta: '5305', label: 'Gasto bancario', concepto: 'Comisión / cuota de manejo bancaria' },
  { cuenta: '5120', label: 'Arriendo', concepto: 'Arriendo del mes' },
  { cuenta: '5135', label: 'Servicios', concepto: 'Servicios públicos e internet' },
  { cuenta: '519595', label: 'Otros gastos', concepto: '' },
]

const beneficiario = (e: Egreso) => e.proveedor?.nombre ?? e.cliente?.nombre ?? e.tercero?.nombre ?? null

/** Comprobantes de egreso: pagos a proveedores y otros pagos que salen de una caja o un banco */
export function TabEgresos() {
  const { llevaContabilidad } = usePermisos()
  const [rango, setRango] = useState<Rango>(rangoEsteMes)
  const { data = [], isLoading, error } = useEgresos(rango.desde, rango.hasta)
  const [nuevo, setNuevo] = useState(false)
  const [anulando, setAnulando] = useState<Egreso | null>(null)

  const columnas: Columna<Egreso>[] = [
    {
      titulo: 'Egreso',
      valor: (e) => etiquetaDocumento('CE', e.numero),
      mostrar: (e) => (
        <span className="flex items-center gap-2 font-mono">
          {etiquetaDocumento('CE', e.numero)}
          {e.anulado_at && <BadgeAnulado />}
        </span>
      ),
      className: 'whitespace-nowrap text-slate-200',
    },
    { titulo: 'Fecha', valor: (e) => e.fecha, mostrar: (e) => formatearDia(e.fecha), className: 'whitespace-nowrap text-slate-400' },
    { titulo: 'Concepto', valor: (e) => e.concepto },
    { titulo: 'Beneficiario', valor: beneficiario, className: 'text-slate-400' },
    { titulo: 'Sale de', valor: (e) => e.caja?.nombre ?? '', className: 'text-slate-400' },
    {
      titulo: 'Valor',
      valor: (e) => (e.anulado_at ? 0 : e.valor),
      mostrar: (e) => <span className={e.anulado_at ? 'line-through opacity-60' : ''}>{formatearValor(e.valor)}</span>,
      numerica: true,
      total: formatearValor,
    },
    ...(llevaContabilidad
      ? [
          {
            titulo: '',
            valor: () => null,
            mostrar: (e: Egreso) =>
              !e.anulado_at && (
                <button
                  onClick={() => setAnulando(e)}
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-tinte/5 hover:text-red-400"
                  aria-label={`Anular ${etiquetaDocumento('CE', e.numero)}`}
                >
                  <Ban className="size-4" />
                </button>
              ),
          },
        ]
      : []),
  ]

  return (
    <>
      <Reporte
        titulo="Comprobantes de egreso"
        subtitulo={describirRango(rango)}
        cargando={isLoading}
        error={error}
        puedeExportar={data.length > 0}
        exportar={() => ({
          archivo: `egresos_${rango.desde}_a_${rango.hasta}`,
          ...tablaDesdeColumnas(columnas.filter((c) => c.titulo), data),
        })}
        filtros={
          <>
            <RangoFechas valor={rango} onChange={setRango} />
            {llevaContabilidad && (
              <button onClick={() => setNuevo(true)} className="btn btn-primary">
                <Plus className="size-4" />
                Nuevo egreso
              </button>
            )}
          </>
        }
      >
        {data.length === 0 ? (
          <EstadoVacio
            icono={Receipt}
            titulo="No hay egresos en este período"
            descripcion="Pagos a proveedores, comisiones bancarias, arriendo, servicios… Cada egreso baja la caja o el banco del que sale."
            compacto
          />
        ) : (
          <TablaReporte columnas={columnas} filas={data} clave={(e) => e.id} vacio="" />
        )}
      </Reporte>

      <Modal open={nuevo} onClose={() => setNuevo(false)} title="Nuevo comprobante de egreso" size="max-w-2xl">
        {nuevo && <EgresoForm onClose={() => setNuevo(false)} />}
      </Modal>
      <AnularDocumentoModal
        documento={anulando && { tabla: 'egresos', id: anulando.id, etiqueta: etiquetaDocumento('CE', anulando.numero) }}
        onClose={() => setAnulando(null)}
      />
    </>
  )
}

function EgresoForm({ onClose }: { onClose: () => void }) {
  const registrar = useRegistrarEgreso()
  const cuentas = useCuentas()
  const terceros = useOpcionesTercero()
  const hoy = fechaIso(new Date())
  const porPagar = useSaldosPorTercero('2205', hoy)
  const [clase, setClase] = useState<'proveedor' | 'otro'>('proveedor')
  const [fecha, setFecha] = useState(hoy)
  const [caja, setCaja] = useState('')
  const [valor, setValor] = useState(Number.NaN)
  const [metodo, setMetodo] = useState<MetodoPago>('transferencia')
  const [concepto, setConcepto] = useState('')
  const [referencia, setReferencia] = useState('')
  const [proveedor, setProveedor] = useState<OpcionTercero | null>(null)
  const [tercero, setTercero] = useState<OpcionTercero | null>(null)
  const [cuenta, setCuenta] = useState('')
  const [intento, setIntento] = useState(false)

  const proveedores = useMemo(() => (terceros.data ?? []).filter((t) => t.clase === 'proveedor'), [terceros.data])
  const deuda = proveedor ? Number(porPagar.data?.find((p) => p.tercero_id === proveedor.id)?.saldo ?? 0) : 0

  const errores = {
    caja: !caja ? 'Elige de dónde sale el dinero.' : undefined,
    valor:
      !Number.isFinite(valor) || valor <= 0
        ? 'Escribe un valor mayor que cero.'
        : clase === 'proveedor' && proveedor && valor > deuda
          ? `Al proveedor se le deben ${formatearValor(deuda)}.`
          : undefined,
    concepto: concepto.trim().length < 3 ? 'Escribe el concepto.' : undefined,
    proveedor: clase === 'proveedor' && !proveedor ? 'Elige el proveedor.' : undefined,
    cuenta: clase === 'otro' && !cuenta ? 'Elige la cuenta del gasto.' : undefined,
  }
  const hayErrores = Object.values(errores).some(Boolean)

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    setIntento(true)
    if (hayErrores) return
    registrar.mutate(
      {
        p_fecha: fecha,
        p_clase: clase,
        p_cuenta_tesoreria_id: caja,
        p_valor: valor,
        p_metodo: metodo,
        p_concepto: concepto.trim(),
        p_referencia: referencia.trim() || null,
        p_proveedor_id: clase === 'proveedor' ? proveedor!.id : tercero?.clase === 'proveedor' ? tercero.id : null,
        p_cliente_id: clase === 'otro' && tercero?.clase === 'cliente' ? tercero.id : null,
        p_tercero_id: clase === 'otro' && tercero?.clase === 'tercero' ? tercero.id : null,
        p_cuenta: clase === 'otro' ? cuenta : null,
      },
      { onSuccess: onClose },
    )
  }

  const error = (campo: keyof typeof errores) => (intento ? errores[campo] : undefined)

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      <div className="flex gap-2" role="radiogroup">
        {(
          [
            ['proveedor', 'Pago a proveedor'],
            ['otro', 'Otro pago o gasto'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={clase === id}
            onClick={() => setClase(id)}
            className={`btn flex-1 ${clase === id ? 'btn-primary' : 'btn-secondary'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {clase === 'proveedor' ? (
        <FormField
          label="Proveedor *"
          error={error('proveedor')}
          hint={proveedor ? `Se le deben ${formatearValor(deuda)} según la contabilidad` : undefined}
        >
          <SelectorTercero
            opciones={proveedores}
            value={proveedor}
            onChange={(p) => {
              setProveedor(p)
              if (p && !concepto) setConcepto(`Pago a ${p.nombre}`)
            }}
          />
        </FormField>
      ) : (
        <>
          <div className="flex flex-wrap gap-1">
            {ATAJOS.map((a) => (
              <button
                key={a.cuenta}
                type="button"
                onClick={() => {
                  setCuenta(a.cuenta)
                  if (a.concepto) setConcepto(a.concepto)
                }}
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
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Cuenta del gasto o de lo que se paga *" error={error('cuenta')}>
              <SelectorCuenta cuentas={cuentas.data ?? []} soloMovimiento value={cuenta} onChange={setCuenta} />
            </FormField>
            <FormField label="Beneficiario" hint="Obligatorio si la cuenta exige tercero">
              <SelectorTercero opciones={terceros.data ?? []} value={tercero} onChange={setTercero} />
            </FormField>
          </div>
        </>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Sale de *" error={error('caja')}>
          <SelectorCaja value={caja} onChange={setCaja} />
        </FormField>
        <FormField label="Valor *" error={error('valor')}>
          <input
            type="number"
            min={0}
            step="any"
            inputMode="decimal"
            value={Number.isFinite(valor) ? valor : ''}
            onChange={(e) => setValor(e.target.valueAsNumber)}
            className="input"
          />
        </FormField>
        <FormField label="Fecha *">
          <input type="date" value={fecha} max={hoy} onChange={(e) => setFecha(e.target.value)} className="input" />
        </FormField>
        <FormField label="Forma de pago *">
          <select value={metodo} onChange={(e) => setMetodo(e.target.value as MetodoPago)} className="input">
            {Object.entries(metodosPago).map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label="Concepto *" error={error('concepto')} className="sm:col-span-2">
          <input value={concepto} onChange={(e) => setConcepto(e.target.value)} maxLength={300} className="input" />
        </FormField>
        <FormField label="Referencia" hint="N.º de transferencia, cheque o factura" className="sm:col-span-2">
          <input value={referencia} onChange={(e) => setReferencia(e.target.value)} maxLength={100} className="input" />
        </FormField>
      </div>

      {registrar.error && (
        <p role="alert" className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">
          {mensajeError(registrar.error)}
        </p>
      )}
      <div className="flex justify-end gap-3">
        <button type="button" onClick={onClose} className="btn btn-secondary">
          Cancelar
        </button>
        <button type="submit" disabled={registrar.isPending} className="btn btn-primary">
          {registrar.isPending && <Loader2 className="size-4 animate-spin" />}
          Registrar egreso
        </button>
      </div>
    </form>
  )
}
