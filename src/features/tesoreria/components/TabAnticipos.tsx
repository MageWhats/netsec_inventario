import { Ban, HandCoins, Loader2, Plus, Split } from 'lucide-react'
import { useMemo, useState, type FormEvent } from 'react'
import { EstadoVacio } from '@/components/ui/EstadoVacio'
import { FormField } from '@/components/ui/FormField'
import { Modal } from '@/components/ui/Modal'
import { usePermisos } from '@/features/auth/permisos'
import { metodosPago, useCartera, type MetodoPago } from '@/features/cartera/api'
import { formatearDia, formatearValor, useOpcionesTercero, type OpcionTercero } from '@/features/contabilidad/api'
import { SelectorTercero } from '@/features/contabilidad/components/Selectores'
import { formatearNumero } from '@/features/movimientos/tipos'
import { RangoFechas } from '@/features/reportes/components/RangoFechas'
import { Reporte, TablaReporte, type Columna } from '@/features/reportes/components/TablaReporte'
import { describirRango, type Rango } from '@/features/reportes/rangos'
import { mensajeError } from '@/lib/errores'
import { fechaIso, tablaDesdeColumnas } from '@/lib/exportar'
import { etiquetaDocumento, useAnticipos, useAplicarAnticipo, useRegistrarAnticipo, type Anticipo } from '../api'
import { AnularDocumentoModal, BadgeAnulado, SelectorCaja } from './Comunes'

const pendiente = (a: Anticipo) => (a.anulado_at ? 0 : Math.round((a.valor - a.aplicado) * 100) / 100)

/** Pagos que hace un cliente antes de la venta (2805). Después se aplican a sus ventas a crédito como abonos. */
export function TabAnticipos() {
  const { llevaContabilidad } = usePermisos()
  // Por defecto el año: un anticipo puede quedar pendiente varios meses
  const [rango, setRango] = useState<Rango>(() => ({
    desde: `${new Date().getFullYear()}-01-01`,
    hasta: fechaIso(new Date()),
  }))
  const { data = [], isLoading, error } = useAnticipos(rango.desde, rango.hasta)
  const [nuevo, setNuevo] = useState(false)
  const [aplicando, setAplicando] = useState<Anticipo | null>(null)
  const [anulando, setAnulando] = useState<Anticipo | null>(null)

  const columnas: Columna<Anticipo>[] = [
    {
      titulo: 'Anticipo',
      valor: (a) => etiquetaDocumento('RA', a.numero),
      mostrar: (a) => (
        <span className="flex items-center gap-2 font-mono">
          {etiquetaDocumento('RA', a.numero)}
          {a.anulado_at && <BadgeAnulado />}
        </span>
      ),
      className: 'whitespace-nowrap text-slate-200',
    },
    { titulo: 'Fecha', valor: (a) => a.fecha, mostrar: (a) => formatearDia(a.fecha), className: 'whitespace-nowrap text-slate-400' },
    { titulo: 'Cliente', valor: (a) => a.cliente?.nombre ?? '', className: 'font-medium text-slate-100' },
    { titulo: 'Entró a', valor: (a) => a.caja?.nombre ?? '', className: 'text-slate-400' },
    { titulo: 'Valor', valor: (a) => a.valor, mostrar: (a) => formatearValor(a.valor), numerica: true },
    { titulo: 'Aplicado', valor: (a) => a.aplicado, mostrar: (a) => formatearValor(a.aplicado), numerica: true },
    {
      titulo: 'Por aplicar',
      valor: pendiente,
      mostrar: (a) => <span className={pendiente(a) > 0 ? 'text-amber-400' : ''}>{formatearValor(pendiente(a))}</span>,
      numerica: true,
      total: formatearValor,
    },
    ...(llevaContabilidad
      ? [
          {
            titulo: '',
            valor: () => null,
            mostrar: (a: Anticipo) =>
              !a.anulado_at && (
                <span className="flex justify-end gap-1">
                  {pendiente(a) > 0 && (
                    <button
                      onClick={() => setAplicando(a)}
                      className="rounded-lg p-1.5 text-slate-400 hover:bg-tinte/5 hover:text-slate-200"
                      title="Aplicar a una venta"
                      aria-label={`Aplicar ${etiquetaDocumento('RA', a.numero)}`}
                    >
                      <Split className="size-4" />
                    </button>
                  )}
                  {a.aplicado === 0 && (
                    <button
                      onClick={() => setAnulando(a)}
                      className="rounded-lg p-1.5 text-slate-400 hover:bg-tinte/5 hover:text-red-400"
                      aria-label={`Anular ${etiquetaDocumento('RA', a.numero)}`}
                    >
                      <Ban className="size-4" />
                    </button>
                  )}
                </span>
              ),
          },
        ]
      : []),
  ]

  return (
    <>
      <Reporte
        titulo="Anticipos de clientes"
        subtitulo={describirRango(rango)}
        cargando={isLoading}
        error={error}
        puedeExportar={data.length > 0}
        exportar={() => ({
          archivo: `anticipos_${rango.desde}_a_${rango.hasta}`,
          ...tablaDesdeColumnas(columnas.filter((c) => c.titulo), data),
        })}
        filtros={
          <>
            <RangoFechas valor={rango} onChange={setRango} />
            {llevaContabilidad && (
              <button onClick={() => setNuevo(true)} className="btn btn-primary">
                <Plus className="size-4" />
                Nuevo anticipo
              </button>
            )}
          </>
        }
      >
        {data.length === 0 ? (
          <EstadoVacio
            icono={HandCoins}
            titulo="No hay anticipos en este período"
            descripcion="Cuando un cliente paga antes de la venta, el dinero queda como anticipo y luego se aplica a su venta a crédito."
            compacto
          />
        ) : (
          <TablaReporte columnas={columnas} filas={data} clave={(a) => a.id} vacio="" />
        )}
      </Reporte>

      <Modal open={nuevo} onClose={() => setNuevo(false)} title="Nuevo anticipo">
        {nuevo && <AnticipoForm onClose={() => setNuevo(false)} />}
      </Modal>
      <Modal
        open={aplicando !== null}
        onClose={() => setAplicando(null)}
        title={`Aplicar ${aplicando ? etiquetaDocumento('RA', aplicando.numero) : ''}`}
      >
        {aplicando && <AplicarForm key={aplicando.id} anticipo={aplicando} onClose={() => setAplicando(null)} />}
      </Modal>
      <AnularDocumentoModal
        documento={anulando && { tabla: 'anticipos', id: anulando.id, etiqueta: etiquetaDocumento('RA', anulando.numero) }}
        onClose={() => setAnulando(null)}
      />
    </>
  )
}

function AnticipoForm({ onClose }: { onClose: () => void }) {
  const registrar = useRegistrarAnticipo()
  const terceros = useOpcionesTercero()
  const hoy = fechaIso(new Date())
  const clientes = useMemo(() => (terceros.data ?? []).filter((t) => t.clase === 'cliente'), [terceros.data])
  const [cliente, setCliente] = useState<OpcionTercero | null>(null)
  const [caja, setCaja] = useState('')
  const [valor, setValor] = useState(Number.NaN)
  const [metodo, setMetodo] = useState<MetodoPago>('transferencia')
  const [fecha, setFecha] = useState(hoy)
  const [referencia, setReferencia] = useState('')
  const [notas, setNotas] = useState('')
  const [intento, setIntento] = useState(false)

  const errores = {
    cliente: !cliente ? 'Elige el cliente.' : undefined,
    caja: !caja ? 'Elige a dónde entra el dinero.' : undefined,
    valor: !Number.isFinite(valor) || valor <= 0 ? 'Escribe un valor mayor que cero.' : undefined,
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    setIntento(true)
    if (Object.values(errores).some(Boolean)) return
    registrar.mutate(
      {
        p_fecha: fecha,
        p_cliente_id: cliente!.id,
        p_cuenta_tesoreria_id: caja,
        p_valor: valor,
        p_metodo: metodo,
        p_referencia: referencia.trim() || null,
        p_notas: notas.trim() || null,
      },
      { onSuccess: onClose },
    )
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      <FormField label="Cliente *" error={intento ? errores.cliente : undefined}>
        <SelectorTercero opciones={clientes} value={cliente} onChange={setCliente} />
      </FormField>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Entra a *" error={intento ? errores.caja : undefined}>
          <SelectorCaja value={caja} onChange={setCaja} />
        </FormField>
        <FormField label="Valor *" error={intento ? errores.valor : undefined}>
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
        <FormField label="Forma de pago *">
          <select value={metodo} onChange={(e) => setMetodo(e.target.value as MetodoPago)} className="input">
            {Object.entries(metodosPago).map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label="Fecha *">
          <input type="date" value={fecha} max={hoy} onChange={(e) => setFecha(e.target.value)} className="input" />
        </FormField>
        <FormField label="Referencia">
          <input value={referencia} onChange={(e) => setReferencia(e.target.value)} maxLength={100} className="input" />
        </FormField>
        <FormField label="Notas">
          <input value={notas} onChange={(e) => setNotas(e.target.value)} maxLength={300} className="input" />
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
          Registrar anticipo
        </button>
      </div>
    </form>
  )
}

function AplicarForm({ anticipo, onClose }: { anticipo: Anticipo; onClose: () => void }) {
  const aplicar = useAplicarAnticipo()
  const cartera = useCartera(anticipo.cliente_id)
  const ventas = (cartera.data ?? []).filter((v) => v.saldo > 0)
  const [ventaId, setVentaId] = useState('')
  const venta = ventas.find((v) => v.id === ventaId)
  const disponible = pendiente(anticipo)
  const [valor, setValor] = useState(Number.NaN)

  const tope = venta ? Math.min(disponible, venta.saldo) : disponible
  const error =
    !venta
      ? 'Elige la venta.'
      : !Number.isFinite(valor) || valor <= 0
        ? 'Escribe un valor mayor que cero.'
        : valor > tope
          ? `Máximo ${formatearValor(tope)}.`
          : undefined

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (error) return
    aplicar.mutate({ p_anticipo_id: anticipo.id, p_movimiento_id: ventaId, p_valor: valor }, { onSuccess: onClose })
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <p className="text-sm text-slate-400">
        Por aplicar: <strong className="text-slate-200">{formatearValor(disponible)}</strong> de {anticipo.cliente?.nombre}.
        Queda como un abono a la venta.
      </p>
      <FormField label="Venta a crédito *">
        <select
          value={ventaId}
          onChange={(e) => {
            setVentaId(e.target.value)
            const v = ventas.find((x) => x.id === e.target.value)
            if (v) setValor(Math.min(disponible, v.saldo))
          }}
          className="input"
        >
          <option value="">{cartera.isLoading ? 'Cargando…' : ventas.length ? 'Elige la venta…' : 'El cliente no tiene ventas con saldo'}</option>
          {ventas.map((v) => (
            <option key={v.id} value={v.id}>
              {formatearNumero({ tipo: 'salida', numero: v.numero })} · saldo {formatearValor(v.saldo)}
            </option>
          ))}
        </select>
      </FormField>
      <FormField label="Valor a aplicar *" error={venta ? error : undefined}>
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
      {aplicar.error && (
        <p role="alert" className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">
          {mensajeError(aplicar.error)}
        </p>
      )}
      <div className="flex justify-end gap-3">
        <button type="button" onClick={onClose} className="btn btn-secondary">
          Cancelar
        </button>
        <button type="submit" disabled={aplicar.isPending || Boolean(error)} className="btn btn-primary">
          {aplicar.isPending && <Loader2 className="size-4 animate-spin" />}
          Aplicar
        </button>
      </div>
    </form>
  )
}
