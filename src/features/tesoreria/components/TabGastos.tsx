import { Ban, CalendarCheck, CircleDollarSign, Loader2, Plus, Wallet } from 'lucide-react'
import { useMemo, useState, type FormEvent } from 'react'
import { EstadoVacio } from '@/components/ui/EstadoVacio'
import { FormField } from '@/components/ui/FormField'
import { Modal } from '@/components/ui/Modal'
import { usePermisos } from '@/features/auth/permisos'
import { metodosPago, type MetodoPago } from '@/features/cartera/api'
import { formatearDia, formatearValor, useOpcionesTercero, type OpcionTercero } from '@/features/contabilidad/api'
import { SelectorTercero } from '@/features/contabilidad/components/Selectores'
import { RangoFechas } from '@/features/reportes/components/RangoFechas'
import { Cifra, Reporte, TablaReporte, type Columna } from '@/features/reportes/components/TablaReporte'
import { describirRango, rangoEsteMes, type Rango } from '@/features/reportes/rangos'
import { mensajeError } from '@/lib/errores'
import { fechaIso, tablaDesdeColumnas } from '@/lib/exportar'
import {
  etiquetaGasto,
  gastoPorPagar,
  useAnularGasto,
  useCategoriasGasto,
  useConfirmarRecurrente,
  useGastos,
  usePagarGasto,
  useRecurrentesPendientes,
  useRegistrarGasto,
  type Gasto,
} from '../gastosApi'
import { BadgeAnulado, SelectorCaja } from './Comunes'

const beneficiario = (g: Gasto) => g.proveedor?.nombre ?? g.tercero?.nombre ?? null

/** Gastos del día a día por categoría: pagados de una caja o banco, o por pagar */
export function TabGastos() {
  const { llevaContabilidad } = usePermisos()
  const [rango, setRango] = useState<Rango>(rangoEsteMes)
  const { data = [], isLoading, error } = useGastos(rango.desde, rango.hasta)
  const [nuevo, setNuevo] = useState(false)
  const [pagando, setPagando] = useState<Gasto | null>(null)
  const [anulando, setAnulando] = useState<Gasto | null>(null)

  const vigentes = data.filter((g) => !g.anulado_at)
  const total = vigentes.reduce((s, g) => s + g.valor, 0)
  const porPagar = vigentes.filter(gastoPorPagar).reduce((s, g) => s + g.valor, 0)

  const columnas: Columna<Gasto>[] = [
    {
      titulo: 'Gasto',
      valor: (g) => etiquetaGasto(g.numero),
      mostrar: (g) => (
        <span className="flex items-center gap-2 font-mono">
          {etiquetaGasto(g.numero)}
          {g.anulado_at && <BadgeAnulado />}
        </span>
      ),
      className: 'whitespace-nowrap text-slate-200',
    },
    { titulo: 'Fecha', valor: (g) => g.fecha, mostrar: (g) => formatearDia(g.fecha), className: 'whitespace-nowrap text-slate-400' },
    { titulo: 'Categoría', valor: (g) => g.categoria?.nombre ?? '' },
    { titulo: 'Descripción', valor: (g) => g.descripcion, className: 'text-slate-300' },
    { titulo: 'Beneficiario', valor: beneficiario, className: 'text-slate-400' },
    {
      titulo: 'Estado',
      valor: (g) => (g.anulado_at ? 'Anulado' : gastoPorPagar(g) ? 'Por pagar' : 'Pagado'),
      mostrar: (g) =>
        g.anulado_at ? (
          ''
        ) : gastoPorPagar(g) ? (
          <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs text-amber-400">Por pagar</span>
        ) : (
          <span className="text-xs text-slate-400">
            Pagado{g.caja ? ` · ${g.caja.nombre}` : g.egreso ? ` · CE-${String(g.egreso.numero).padStart(6, '0')}` : ''}
          </span>
        ),
    },
    {
      titulo: 'Valor',
      valor: (g) => (g.anulado_at ? 0 : g.valor),
      mostrar: (g) => <span className={g.anulado_at ? 'line-through opacity-60' : ''}>{formatearValor(g.valor)}</span>,
      numerica: true,
      total: formatearValor,
    },
    ...(llevaContabilidad
      ? [
          {
            titulo: '',
            valor: () => null,
            mostrar: (g: Gasto) =>
              !g.anulado_at && (
                <span className="flex justify-end gap-1">
                  {gastoPorPagar(g) && (
                    <button
                      onClick={() => setPagando(g)}
                      className="rounded-lg p-1.5 text-slate-400 hover:bg-tinte/5 hover:text-slate-200"
                      title="Pagar"
                      aria-label={`Pagar ${etiquetaGasto(g.numero)}`}
                    >
                      <Wallet className="size-4" />
                    </button>
                  )}
                  <button
                    onClick={() => setAnulando(g)}
                    className="rounded-lg p-1.5 text-slate-400 hover:bg-tinte/5 hover:text-red-400"
                    aria-label={`Anular ${etiquetaGasto(g.numero)}`}
                  >
                    <Ban className="size-4" />
                  </button>
                </span>
              ),
          },
        ]
      : []),
  ]

  return (
    <>
      {llevaContabilidad && <RecurrentesDelMes />}
      <Reporte
        titulo="Gastos"
        subtitulo={describirRango(rango)}
        cargando={isLoading}
        error={error}
        puedeExportar={data.length > 0}
        exportar={() => ({
          archivo: `gastos_${rango.desde}_a_${rango.hasta}`,
          ...tablaDesdeColumnas(columnas.filter((c) => c.titulo), data),
        })}
        filtros={
          <>
            <RangoFechas valor={rango} onChange={setRango} />
            {llevaContabilidad && (
              <button onClick={() => setNuevo(true)} className="btn btn-primary">
                <Plus className="size-4" />
                Nuevo gasto
              </button>
            )}
          </>
        }
        resumen={
          vigentes.length > 0 && (
            <>
              <Cifra label="Gastos del período" valor={formatearValor(total)} icono={CircleDollarSign} />
              <Cifra label="Por pagar" valor={formatearValor(porPagar)} tono="bg-amber-500/15 text-amber-400" />
            </>
          )
        }
      >
        {data.length === 0 ? (
          <EstadoVacio
            icono={CircleDollarSign}
            titulo="No hay gastos en este período"
            descripcion="Elige la categoría (arriendo, servicios, transporte…) y la aplicación sabe a qué cuenta va."
            compacto
          />
        ) : (
          <TablaReporte columnas={columnas} filas={data} clave={(g) => g.id} vacio="" />
        )}
      </Reporte>

      <Modal open={nuevo} onClose={() => setNuevo(false)} title="Nuevo gasto">
        {nuevo && <GastoForm onClose={() => setNuevo(false)} />}
      </Modal>
      <Modal open={pagando !== null} onClose={() => setPagando(null)} title={`Pagar ${pagando ? etiquetaGasto(pagando.numero) : ''}`}>
        {pagando && <PagarForm key={pagando.id} gasto={pagando} onClose={() => setPagando(null)} />}
      </Modal>
      <Modal open={anulando !== null} onClose={() => setAnulando(null)} title={`Anular ${anulando ? etiquetaGasto(anulando.numero) : ''}`}>
        {anulando && <AnularForm key={anulando.id} gasto={anulando} onClose={() => setAnulando(null)} />}
      </Modal>
    </>
  )
}

/** Los recurrentes del mes que faltan por confirmar */
function RecurrentesDelMes() {
  const hoy = new Date()
  const anio = hoy.getFullYear()
  const mes = hoy.getMonth() + 1
  const { data = [] } = useRecurrentesPendientes(anio, mes)
  const confirmar = useConfirmarRecurrente()
  const [confirmando, setConfirmando] = useState<string | null>(null)

  if (data.length === 0) return null
  return (
    <section className="mb-4 rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4">
      <h3 className="flex items-center gap-2 text-sm font-medium text-amber-400">
        <CalendarCheck className="size-4" />
        Gastos recurrentes de este mes por confirmar
      </h3>
      <ul className="mt-3 divide-y divide-brand-border">
        {data.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2 text-sm">
            <span className="font-medium">{r.nombre}</span>
            <span className="text-slate-400">
              {r.categoria} · día {r.dia}
            </span>
            <span className="ml-auto tabular-nums">{formatearValor(r.valor)}</span>
            <button
              onClick={() => {
                setConfirmando(r.id)
                confirmar.mutate({ p_id: r.id, p_anio: anio, p_mes: mes }, { onSettled: () => setConfirmando(null) })
              }}
              disabled={confirmar.isPending}
              className="btn btn-secondary"
            >
              {confirmando === r.id && <Loader2 className="size-4 animate-spin" />}
              Confirmar
            </button>
          </li>
        ))}
      </ul>
      {confirmar.error && <p className="mt-2 text-sm text-red-400">{mensajeError(confirmar.error)}</p>}
    </section>
  )
}

function GastoForm({ onClose }: { onClose: () => void }) {
  const registrar = useRegistrarGasto()
  const categorias = useCategoriasGasto()
  const terceros = useOpcionesTercero()
  const hoy = fechaIso(new Date())
  const beneficiarios = useMemo(() => (terceros.data ?? []).filter((t) => t.clase !== 'cliente'), [terceros.data])
  const [categoria, setCategoria] = useState('')
  const [fecha, setFecha] = useState(hoy)
  const [valor, setValor] = useState(Number.NaN)
  const [descripcion, setDescripcion] = useState('')
  const [pagado, setPagado] = useState(true)
  const [caja, setCaja] = useState('')
  const [tercero, setTercero] = useState<OpcionTercero | null>(null)
  const [referencia, setReferencia] = useState('')
  const [intento, setIntento] = useState(false)

  const errores = {
    categoria: !categoria ? 'Elige la categoría.' : undefined,
    valor: !Number.isFinite(valor) || valor <= 0 ? 'Escribe un valor mayor que cero.' : undefined,
    descripcion: descripcion.trim().length < 3 ? 'Describe el gasto.' : undefined,
    caja: pagado && !caja ? 'Elige de dónde se pagó.' : undefined,
    tercero: !pagado && !tercero ? 'Elige a quién se le debe.' : undefined,
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    setIntento(true)
    if (Object.values(errores).some(Boolean)) return
    registrar.mutate(
      {
        p_fecha: fecha,
        p_categoria_id: categoria,
        p_valor: valor,
        p_descripcion: descripcion.trim(),
        p_cuenta_tesoreria_id: pagado ? caja : null,
        p_proveedor_id: tercero?.clase === 'proveedor' ? tercero.id : null,
        p_tercero_id: tercero?.clase === 'tercero' ? tercero.id : null,
        p_referencia: referencia.trim() || null,
      },
      { onSuccess: onClose },
    )
  }
  const error = (c: keyof typeof errores) => (intento ? errores[c] : undefined)

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Categoría *" error={error('categoria')}>
          <select value={categoria} onChange={(e) => setCategoria(e.target.value)} className="input" autoFocus>
            <option value="">Elige…</option>
            {(categorias.data ?? [])
              .filter((c) => c.activa)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
          </select>
        </FormField>
        <FormField label="Valor total *" error={error('valor')} hint="Con el IVA, si lo trae: suma al gasto">
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
        <FormField label="Descripción *" error={error('descripcion')} className="sm:col-span-2">
          <input value={descripcion} onChange={(e) => setDescripcion(e.target.value)} maxLength={300} className="input" />
        </FormField>
        <FormField label="Fecha *">
          <input type="date" value={fecha} max={hoy} onChange={(e) => setFecha(e.target.value)} className="input" />
        </FormField>
        <FormField label="Factura o soporte">
          <input value={referencia} onChange={(e) => setReferencia(e.target.value)} maxLength={100} className="input" />
        </FormField>
      </div>

      <div className="flex gap-2" role="radiogroup">
        {[
          [true, 'Ya se pagó'],
          [false, 'Queda por pagar'],
        ].map(([v, label]) => (
          <button
            key={String(v)}
            type="button"
            role="radio"
            aria-checked={pagado === v}
            onClick={() => setPagado(v as boolean)}
            className={`btn flex-1 ${pagado === v ? 'btn-primary' : 'btn-secondary'}`}
          >
            {label as string}
          </button>
        ))}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {pagado && (
          <FormField label="Se pagó de *" error={error('caja')}>
            <SelectorCaja value={caja} onChange={setCaja} />
          </FormField>
        )}
        <FormField label={pagado ? 'Beneficiario' : 'A quién se le debe *'} error={error('tercero')}>
          <SelectorTercero opciones={beneficiarios} value={tercero} onChange={setTercero} />
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
          Registrar gasto
        </button>
      </div>
    </form>
  )
}

function PagarForm({ gasto, onClose }: { gasto: Gasto; onClose: () => void }) {
  const pagar = usePagarGasto()
  const hoy = fechaIso(new Date())
  const [caja, setCaja] = useState('')
  const [fecha, setFecha] = useState(hoy)
  const [metodo, setMetodo] = useState<MetodoPago>('transferencia')
  const [referencia, setReferencia] = useState('')

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!caja) return
    pagar.mutate(
      { p_gasto_id: gasto.id, p_cuenta_tesoreria_id: caja, p_fecha: fecha, p_metodo: metodo, p_referencia: referencia.trim() || null },
      { onSuccess: onClose },
    )
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <p className="text-sm text-slate-400">
        {gasto.descripcion} · <strong className="text-slate-200">{formatearValor(gasto.valor)}</strong> a {beneficiario(gasto)}.
        Se registra un comprobante de egreso.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Sale de *">
          <SelectorCaja value={caja} onChange={setCaja} />
        </FormField>
        <FormField label="Fecha *">
          <input type="date" value={fecha} min={gasto.fecha} max={hoy} onChange={(e) => setFecha(e.target.value)} className="input" />
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
        <FormField label="Referencia">
          <input value={referencia} onChange={(e) => setReferencia(e.target.value)} maxLength={100} className="input" />
        </FormField>
      </div>
      {pagar.error && (
        <p role="alert" className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">
          {mensajeError(pagar.error)}
        </p>
      )}
      <div className="flex justify-end gap-3">
        <button type="button" onClick={onClose} className="btn btn-secondary">
          Cancelar
        </button>
        <button type="submit" disabled={pagar.isPending || !caja} className="btn btn-primary">
          {pagar.isPending && <Loader2 className="size-4 animate-spin" />}
          Pagar
        </button>
      </div>
    </form>
  )
}

function AnularForm({ gasto, onClose }: { gasto: Gasto; onClose: () => void }) {
  const anular = useAnularGasto()
  const [motivo, setMotivo] = useState('')
  const valido = motivo.trim().length >= 5

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!valido) return
    anular.mutate({ p_id: gasto.id, p_motivo: motivo.trim() }, { onSuccess: onClose })
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <p className="text-sm text-slate-400">
        Se registra el comprobante inverso con fecha de hoy. Si el gasto ya se pagó con un egreso, anula primero el egreso.
      </p>
      <FormField label="Motivo *">
        <textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={2} maxLength={300} className="input" autoFocus />
      </FormField>
      {anular.error && (
        <p role="alert" className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">
          {mensajeError(anular.error)}
        </p>
      )}
      <div className="flex justify-end gap-3">
        <button type="button" onClick={onClose} className="btn btn-secondary">
          Cancelar
        </button>
        <button type="submit" disabled={anular.isPending || !valido} className="btn btn-danger">
          {anular.isPending && <Loader2 className="size-4 animate-spin" />}
          Anular gasto
        </button>
      </div>
    </form>
  )
}
