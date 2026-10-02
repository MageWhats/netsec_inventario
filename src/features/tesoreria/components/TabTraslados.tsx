import { ArrowRightLeft, Ban, Loader2, Plus } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { EstadoVacio } from '@/components/ui/EstadoVacio'
import { FormField } from '@/components/ui/FormField'
import { Modal } from '@/components/ui/Modal'
import { usePermisos } from '@/features/auth/permisos'
import { formatearDia, formatearValor } from '@/features/contabilidad/api'
import { RangoFechas } from '@/features/reportes/components/RangoFechas'
import { Reporte, TablaReporte, type Columna } from '@/features/reportes/components/TablaReporte'
import { describirRango, rangoEsteMes, type Rango } from '@/features/reportes/rangos'
import { mensajeError } from '@/lib/errores'
import { fechaIso, tablaDesdeColumnas } from '@/lib/exportar'
import { etiquetaDocumento, useRegistrarTraslado, useTraslados, type Traslado } from '../api'
import { AnularDocumentoModal, BadgeAnulado, SelectorCaja } from './Comunes'

/** Dinero que pasa de una caja o banco a otro: consignar el efectivo, retirar del banco… */
export function TabTraslados() {
  const { llevaContabilidad } = usePermisos()
  const [rango, setRango] = useState<Rango>(rangoEsteMes)
  const { data = [], isLoading, error } = useTraslados(rango.desde, rango.hasta)
  const [nuevo, setNuevo] = useState(false)
  const [anulando, setAnulando] = useState<Traslado | null>(null)

  const columnas: Columna<Traslado>[] = [
    {
      titulo: 'Traslado',
      valor: (t) => etiquetaDocumento('TR', t.numero),
      mostrar: (t) => (
        <span className="flex items-center gap-2 font-mono">
          {etiquetaDocumento('TR', t.numero)}
          {t.anulado_at && <BadgeAnulado />}
        </span>
      ),
      className: 'whitespace-nowrap text-slate-200',
    },
    { titulo: 'Fecha', valor: (t) => t.fecha, mostrar: (t) => formatearDia(t.fecha), className: 'whitespace-nowrap text-slate-400' },
    { titulo: 'De', valor: (t) => t.origen?.nombre ?? '' },
    { titulo: 'A', valor: (t) => t.destino?.nombre ?? '' },
    { titulo: 'Notas', valor: (t) => t.notas, className: 'text-slate-400' },
    {
      titulo: 'Valor',
      valor: (t) => (t.anulado_at ? 0 : t.valor),
      mostrar: (t) => <span className={t.anulado_at ? 'line-through opacity-60' : ''}>{formatearValor(t.valor)}</span>,
      numerica: true,
    },
    ...(llevaContabilidad
      ? [
          {
            titulo: '',
            valor: () => null,
            mostrar: (t: Traslado) =>
              !t.anulado_at && (
                <button
                  onClick={() => setAnulando(t)}
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-tinte/5 hover:text-red-400"
                  aria-label={`Anular ${etiquetaDocumento('TR', t.numero)}`}
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
        titulo="Traslados entre cajas y bancos"
        subtitulo={describirRango(rango)}
        cargando={isLoading}
        error={error}
        puedeExportar={data.length > 0}
        exportar={() => ({
          archivo: `traslados_${rango.desde}_a_${rango.hasta}`,
          ...tablaDesdeColumnas(columnas.filter((c) => c.titulo), data),
        })}
        filtros={
          <>
            <RangoFechas valor={rango} onChange={setRango} />
            {llevaContabilidad && (
              <button onClick={() => setNuevo(true)} className="btn btn-primary">
                <Plus className="size-4" />
                Nuevo traslado
              </button>
            )}
          </>
        }
      >
        {data.length === 0 ? (
          <EstadoVacio icono={ArrowRightLeft} titulo="No hay traslados en este período" compacto />
        ) : (
          <TablaReporte columnas={columnas} filas={data} clave={(t) => t.id} vacio="" />
        )}
      </Reporte>

      <Modal open={nuevo} onClose={() => setNuevo(false)} title="Nuevo traslado">
        {nuevo && <TrasladoForm onClose={() => setNuevo(false)} />}
      </Modal>
      <AnularDocumentoModal
        documento={anulando && { tabla: 'traslados', id: anulando.id, etiqueta: etiquetaDocumento('TR', anulando.numero) }}
        onClose={() => setAnulando(null)}
      />
    </>
  )
}

function TrasladoForm({ onClose }: { onClose: () => void }) {
  const registrar = useRegistrarTraslado()
  const hoy = fechaIso(new Date())
  const [fecha, setFecha] = useState(hoy)
  const [origen, setOrigen] = useState('')
  const [destino, setDestino] = useState('')
  const [valor, setValor] = useState(Number.NaN)
  const [notas, setNotas] = useState('')
  const [intento, setIntento] = useState(false)

  const errores = {
    origen: !origen ? 'Elige de dónde sale.' : undefined,
    destino: !destino ? 'Elige a dónde llega.' : undefined,
    valor: !Number.isFinite(valor) || valor <= 0 ? 'Escribe un valor mayor que cero.' : undefined,
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    setIntento(true)
    if (Object.values(errores).some(Boolean)) return
    registrar.mutate(
      { p_fecha: fecha, p_origen_id: origen, p_destino_id: destino, p_valor: valor, p_notas: notas.trim() || null },
      { onSuccess: onClose },
    )
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="De *" error={intento ? errores.origen : undefined}>
          <SelectorCaja value={origen} onChange={setOrigen} excluir={destino} />
        </FormField>
        <FormField label="A *" error={intento ? errores.destino : undefined}>
          <SelectorCaja value={destino} onChange={setDestino} excluir={origen} />
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
        <FormField label="Fecha *">
          <input type="date" value={fecha} max={hoy} onChange={(e) => setFecha(e.target.value)} className="input" />
        </FormField>
        <FormField label="Notas" className="sm:col-span-2">
          <input
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            maxLength={300}
            placeholder="Consignación del efectivo de la semana"
            className="input"
          />
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
          Registrar traslado
        </button>
      </div>
    </form>
  )
}
