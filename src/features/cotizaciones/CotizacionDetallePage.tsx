import { ArrowLeft, ArrowUpFromLine, Ban, FileDown, Loader2, Pencil, Printer } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Dato } from '@/components/ui/Dato'
import { LoadingBlock } from '@/components/ui/LoadingBlock'
import { usePermisos } from '@/features/auth/permisos'
import { etiquetaDocumento } from '@/features/clientes/schema'
import { useEmpresa } from '@/features/configuracion/api'
import { mensajeError } from '@/lib/errores'
import { imprimirPdf } from '@/lib/exportar'
import { formatearFecha, formatearPrecio } from '@/lib/format'
import { formatearFechaCorta } from '@/lib/garantia'
import { formatearCotizacion, useCotizacion, useRechazarCotizacion } from './api'
import { EstadoCotizacionBadge } from './components/EstadoCotizacionBadge'

export function CotizacionDetallePage() {
  const { id = '' } = useParams()
  const { data: cotizacion, isLoading, error } = useCotizacion(id)
  const { data: empresa } = useEmpresa()
  const rechazar = useRechazarCotizacion()
  const { puedeOperar } = usePermisos()
  const [confirmarRechazo, setConfirmarRechazo] = useState(false)
  const [generandoPdf, setGenerandoPdf] = useState<'descargar' | 'imprimir' | null>(null)
  const [errorPdf, setErrorPdf] = useState<string | null>(null)

  if (isLoading) return <LoadingBlock />
  if (error || !cotizacion) {
    return (
      <div className="p-10 text-center">
        <p className="text-slate-400">{error ? mensajeError(error) : 'La cotización no existe.'}</p>
        <Link to="/cotizaciones" className="mt-4 inline-block text-brand-cyan hover:underline">
          Volver a cotizaciones
        </Link>
      </div>
    )
  }

  const abierta = cotizacion.estado === 'abierta'

  /** Imprimir y descargar usan el mismo PDF */
  async function usarPdf(accion: 'descargar' | 'imprimir') {
    if (!cotizacion) return
    setGenerandoPdf(accion)
    setErrorPdf(null)
    try {
      const modulo = import('./cotizacionPdf')
      if (accion === 'imprimir') await imprimirPdf(async () => (await modulo).generarCotizacion(cotizacion, empresa))
      else await (await modulo).descargarCotizacion(cotizacion, empresa)
    } catch (e) {
      setErrorPdf(`No se pudo ${accion === 'imprimir' ? 'imprimir' : 'generar'} el PDF: ${mensajeError(e)}`)
    } finally {
      setGenerandoPdf(null)
    }
  }

  return (
    <>
      <Link
        to="/cotizaciones"
        className="mb-4 inline-flex items-center gap-1 text-sm text-slate-400 hover:text-slate-200"
      >
        <ArrowLeft className="size-4" />
        Cotizaciones
      </Link>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="font-mono text-2xl font-bold">{formatearCotizacion(cotizacion)}</h1>
            <EstadoCotizacionBadge cotizacion={cotizacion} />
          </div>
          <p className="mt-1 text-sm text-slate-400">
            Creada el {formatearFecha(cotizacion.created_at)}
            {cotizacion.usuario && ` por ${cotizacion.usuario}`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {puedeOperar && abierta && (
            <>
              <Link to={`/cotizaciones/${cotizacion.id}/editar`} className="btn btn-secondary">
                <Pencil className="size-4" />
                Editar
              </Link>
              <button onClick={() => setConfirmarRechazo(true)} className="btn btn-secondary">
                <Ban className="size-4" />
                Rechazada
              </button>
            </>
          )}
          <button onClick={() => usarPdf('imprimir')} disabled={generandoPdf !== null} className="btn btn-secondary">
            {generandoPdf === 'imprimir' ? <Loader2 className="size-4 animate-spin" /> : <Printer className="size-4" />}
            Imprimir
          </button>
          <button
            onClick={() => usarPdf('descargar')}
            disabled={generandoPdf !== null}
            className={`btn ${puedeOperar && abierta ? 'btn-secondary' : 'btn-primary'}`}
          >
            {generandoPdf === 'descargar' ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <FileDown className="size-4" />
            )}
            PDF
          </button>
          {puedeOperar && abierta && (
            <Link to={`/movimientos/nuevo/salida?cotizacion=${cotizacion.id}`} className="btn btn-primary">
              <ArrowUpFromLine className="size-4" />
              Convertir en venta
            </Link>
          )}
        </div>
      </div>

      {errorPdf && (
        <p role="alert" className="mb-6 rounded-lg bg-red-500/10 px-4 py-3 text-sm text-red-400">
          {errorPdf}
        </p>
      )}
      {cotizacion.vencida && (
        <p className="mb-6 rounded-lg bg-amber-500/10 px-4 py-3 text-sm text-amber-400">
          La validez de esta cotización ya pasó. Revisa los precios antes de convertirla en venta, o edítala para
          extender la fecha.
        </p>
      )}

      <section className="mb-6 rounded-2xl border border-brand-border bg-brand-card p-6">
        <dl className="grid gap-x-6 gap-y-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <Dato label="Cliente">
            {cotizacion.cliente ? (
              <Link to={`/clientes/${cotizacion.cliente.id}`} className="hover:text-brand-cyan">
                {cotizacion.cliente.nombre}
                <span className="block text-xs text-slate-500">{etiquetaDocumento(cotizacion.cliente)}</span>
              </Link>
            ) : (
              <>
                {cotizacion.cliente_nombre}
                <span className="block text-xs text-slate-500">No registrado</span>
              </>
            )}
          </Dato>
          <Dato label="Válida hasta">
            <span className={cotizacion.vencida ? 'text-amber-400' : ''}>
              {formatearFechaCorta(`${cotizacion.valida_hasta}T12:00:00`)}
            </span>
          </Dato>
          <Dato label="Total">{formatearPrecio(cotizacion.total)}</Dato>
          <Dato label={cotizacion.estado === 'aceptada' ? 'Venta' : 'Cerrada'}>
            {cotizacion.venta_id ? (
              <Link to={`/movimientos/${cotizacion.venta_id}`} className="text-brand-cyan hover:underline">
                Ver la venta
              </Link>
            ) : (
              cotizacion.cerrada_at && formatearFecha(cotizacion.cerrada_at)
            )}
          </Dato>
          {cotizacion.notas && (
            <Dato label="Condiciones" className="sm:col-span-2 lg:col-span-4">
              <span className="whitespace-pre-line">{cotizacion.notas}</span>
            </Dato>
          )}
        </dl>
      </section>

      <section className="overflow-hidden rounded-2xl border border-brand-border bg-brand-card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-brand-border text-left text-xs tracking-wide text-slate-400 uppercase">
              <tr>
                <th className="px-4 py-3 font-medium">Producto</th>
                <th className="px-4 py-3 text-right font-medium">Cantidad</th>
                <th className="px-4 py-3 text-right font-medium">Precio unit.</th>
                <th className="px-4 py-3 text-right font-medium">Subtotal</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-border">
              {cotizacion.items.map((i) => (
                <tr key={i.id}>
                  <td className="px-4 py-3">
                    <Link to={`/productos/${i.producto.id}`} className="font-medium hover:text-brand-cyan">
                      {i.producto.nombre}
                    </Link>
                    <div className="font-mono text-xs text-slate-500">{i.producto.sku}</div>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{i.cantidad}</td>
                  <td className="px-4 py-3 text-right whitespace-nowrap text-slate-300">
                    {formatearPrecio(i.precio_unitario)}
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    {formatearPrecio(i.cantidad * i.precio_unitario)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t border-brand-border font-semibold">
              <tr>
                <td className="px-4 py-3">Total</td>
                <td className="px-4 py-3 text-right">{cotizacion.unidades}</td>
                <td />
                <td className="px-4 py-3 text-right whitespace-nowrap">{formatearPrecio(cotizacion.total)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      <ConfirmDialog
        open={confirmarRechazo}
        title={`Marcar ${formatearCotizacion(cotizacion)} como rechazada`}
        confirmLabel="Marcar rechazada"
        danger
        pending={rechazar.isPending}
        error={rechazar.error && mensajeError(rechazar.error)}
        onConfirm={() =>
          rechazar.mutate(cotizacion.id, {
            onSuccess: () => setConfirmarRechazo(false),
          })
        }
        onClose={() => {
          rechazar.reset()
          setConfirmarRechazo(false)
        }}
      >
        El cliente no la aceptó o ya no aplica. Queda en el historial y ya no se podrá editar ni convertir en venta.
      </ConfirmDialog>
    </>
  )
}
