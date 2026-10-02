import { Ban, Loader2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Dato } from '@/components/ui/Dato'
import { FormField } from '@/components/ui/FormField'
import { LoadingBlock } from '@/components/ui/LoadingBlock'
import { MenuExportar } from '@/components/ui/MenuExportar'
import { Modal } from '@/components/ui/Modal'
import { PageHeader } from '@/components/ui/PageHeader'
import { usePermisos } from '@/features/auth/permisos'
import { mensajeError } from '@/lib/errores'
import { formatearFecha } from '@/lib/format'
import { tablaDesdeColumnas } from '@/lib/exportar'
import { formatearNumero } from '@/features/movimientos/tipos'
import { TIPOS_COMPROBANTE, TIPOS_MANUALES, etiquetaComprobante, formatearDia, useAnularComprobante, useComprobante } from './api'
import { columnasLineas } from './components/columnasLineas'
import { TablaLineas } from './components/TablaLineas'

export function ComprobanteDetallePage() {
  const { id = '' } = useParams()
  const { data: comprobante, isLoading, error } = useComprobante(id)
  const { llevaContabilidad } = usePermisos()
  const [anulando, setAnulando] = useState(false)

  if (isLoading) return <LoadingBlock />
  if (error) return <p className="text-sm text-red-400">{mensajeError(error)}</p>
  if (!comprobante) return <p className="text-sm text-slate-400">El comprobante no existe.</p>

  const etiqueta = etiquetaComprobante(comprobante)
  const tipo = TIPOS_COMPROBANTE[comprobante.tipo] ?? comprobante.tipo
  const anulable =
    llevaContabilidad && comprobante.tipo in TIPOS_MANUALES && !comprobante.anulado_at && !comprobante.anula_id

  return (
    <>
      <PageHeader
        title={etiqueta}
        description={comprobante.descripcion}
        actions={
          <div className="flex gap-2">
            <MenuExportar
              documento={() => ({
                titulo: `${tipo} ${etiqueta}`,
                subtitulo: `${formatearDia(comprobante.fecha)} · ${comprobante.descripcion}`,
                archivo: `comprobante_${etiqueta}`,
                ...tablaDesdeColumnas(columnasLineas, comprobante.asientos),
              })}
            />
            {anulable && (
              <button onClick={() => setAnulando(true)} className="btn btn-secondary text-red-400">
                <Ban className="size-4" />
                Anular
              </button>
            )}
          </div>
        }
      />

      {comprobante.anulado_at && (
        <p className="mb-4 rounded-lg bg-red-500/10 px-4 py-3 text-sm text-red-400">
          Anulado el {formatearFecha(comprobante.anulado_at)}: {comprobante.motivo_anulacion}.{' '}
          {comprobante.anulacion && (
            <Link to={`/contabilidad/comprobantes/${comprobante.anulacion.id}`} className="underline">
              Ver {etiquetaComprobante(comprobante.anulacion)}
            </Link>
          )}
        </p>
      )}
      {comprobante.movimiento && (
        <p className="mb-4 rounded-lg bg-blue-500/10 px-4 py-3 text-sm text-blue-400">
          Lo generó el movimiento de inventario{' '}
          <Link to={`/movimientos/${comprobante.movimiento.id}`} className="underline">
            {formatearNumero(comprobante.movimiento)}
          </Link>
          . No se anula aquí: si el movimiento estaba errado, se anula el movimiento.
        </p>
      )}
      {comprobante.original && (
        <p className="mb-4 rounded-lg bg-amber-500/10 px-4 py-3 text-sm text-amber-400">
          Este comprobante revierte el{' '}
          <Link to={`/contabilidad/comprobantes/${comprobante.original.id}`} className="underline">
            {etiquetaComprobante(comprobante.original)}
          </Link>
          .
        </p>
      )}

      <div className="mb-4 grid gap-4 rounded-2xl border border-brand-border bg-brand-card p-4 sm:grid-cols-4">
        <Dato label="Tipo">{tipo}</Dato>
        <Dato label="Fecha">{formatearDia(comprobante.fecha)}</Dato>
        <Dato label="Registrado por">{comprobante.usuario?.nombre ?? '—'}</Dato>
        <Dato label="Registrado el">{formatearFecha(comprobante.created_at)}</Dato>
      </div>

      <div className="overflow-hidden rounded-2xl border border-brand-border bg-brand-card">
        <TablaLineas lineas={comprobante.asientos} />
      </div>

      <AnularModal
        open={anulando}
        comprobanteId={comprobante.id}
        etiqueta={etiqueta}
        onClose={() => setAnulando(false)}
      />
    </>
  )
}

function AnularModal({
  open,
  comprobanteId,
  etiqueta,
  onClose,
}: {
  open: boolean
  comprobanteId: string
  etiqueta: string
  onClose: () => void
}) {
  const anular = useAnularComprobante()
  const [motivo, setMotivo] = useState('')
  const [intento, setIntento] = useState(false)
  const errorMotivo = motivo.trim().length < 5 ? 'Explica el motivo (mínimo 5 caracteres).' : undefined

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    setIntento(true)
    if (errorMotivo) return
    anular.mutate({ p_id: comprobanteId, p_motivo: motivo.trim() }, { onSuccess: onClose })
  }

  return (
    <Modal open={open} onClose={onClose} title={`Anular ${etiqueta}`}>
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <p className="text-sm text-slate-400">
          Se registra un comprobante inverso con la misma fecha (débitos y créditos intercambiados) y este queda
          marcado como anulado. Nada se borra. El mes debe estar abierto.
        </p>
        <FormField label="Motivo *" error={intento ? errorMotivo : undefined}>
          <textarea
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            rows={3}
            maxLength={300}
            className="input"
            autoFocus
          />
        </FormField>
        {anular.error && (
          <p role="alert" className="text-sm text-red-400">
            {mensajeError(anular.error)}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="btn btn-secondary">
            Cancelar
          </button>
          <button type="submit" disabled={anular.isPending} className="btn btn-danger">
            {anular.isPending && <Loader2 className="size-4 animate-spin" />}
            Anular comprobante
          </button>
        </div>
      </form>
    </Modal>
  )
}
