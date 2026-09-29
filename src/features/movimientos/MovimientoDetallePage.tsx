import { ArrowLeft, CheckCircle2, FileDown, Loader2, Printer, Undo2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { Dato } from '@/components/ui/Dato'
import { LoadingBlock } from '@/components/ui/LoadingBlock'
import { LogoImpresion } from '@/components/ui/Logo'
import { usePermisos } from '@/features/auth/permisos'
import { etiquetaDocumento } from '@/features/clientes/schema'
import { useEmpresa } from '@/features/configuracion/api'
import { mensajeError } from '@/lib/errores'
import { formatearFecha, formatearPrecio } from '@/lib/format'
import { useMovimiento, useMovimientosEnlazados } from './api'
import { TipoMovimientoBadge } from './components/MovimientosTabla'
import { agruparPorProducto, tituloDocumento } from './detalle'
import { describirMotivo, esAjuste, formatearNumero, tiposMovimiento } from './tipos'

export function MovimientoDetallePage() {
  const { id = '' } = useParams()
  const location = useLocation()
  const recienCreado = (location.state as { creado?: boolean } | null)?.creado
  const { data: movimiento, isLoading, error } = useMovimiento(id)
  const { data: enlazados } = useMovimientosEnlazados(movimiento)
  const grupos = useMemo(() => (movimiento ? agruparPorProducto(movimiento) : []), [movimiento])
  const { esAdmin, verCostos } = usePermisos()
  const { data: empresa } = useEmpresa()
  const [generandoPdf, setGenerandoPdf] = useState(false)
  const [errorPdf, setErrorPdf] = useState<string | null>(null)

  if (isLoading) return <LoadingBlock />

  if (error || !movimiento) {
    return (
      <div className="p-10 text-center">
        <p className="text-slate-400">
          {error ? `Error al cargar el movimiento: ${error.message}` : 'El movimiento no existe.'}
        </p>
        <Link to="/movimientos" className="mt-4 inline-block text-brand-cyan hover:underline">
          Volver a movimientos
        </Link>
      </div>
    )
  }

  const info = tiposMovimiento[movimiento.tipo]
  // Las salidas muestran precios de venta; el resto, costos (no visibles para el rol bodega)
  const mostrarValores = movimiento.tipo === 'salida' || verCostos
  const total = grupos.reduce((s, g) => s + g.subtotal, 0)
  const totalUnidades = grupos.reduce((s, g) => s + g.cantidad, 0)
  // Margen de la venta con el costo guardado en cada línea (solo si todas lo tienen)
  const costoVenta =
    movimiento.tipo === 'salida' && movimiento.items.every((i) => i.costo_unitario !== null)
      ? movimiento.items.reduce((s, i) => s + i.cantidad * (i.costo_unitario ?? 0), 0)
      : null

  async function descargarPdf() {
    if (!movimiento) return
    setGenerandoPdf(true)
    setErrorPdf(null)
    try {
      // El generador (jsPDF) se descarga solo al pedir el primer PDF
      const { descargarRemision } = await import('./remisionPdf')
      await descargarRemision({ movimiento, grupos, empresa, mostrarValores })
    } catch (e) {
      setErrorPdf(`No se pudo generar el PDF: ${mensajeError(e)}`)
    } finally {
      setGenerandoPdf(false)
    }
  }

  return (
    <div className="print:text-black">
      <Link
        to="/movimientos"
        className="mb-4 inline-flex items-center gap-1 text-sm text-slate-400 hover:text-slate-200 print:hidden"
      >
        <ArrowLeft className="size-4" />
        Movimientos
      </Link>

      {recienCreado && (
        <div className="mb-6 flex items-center gap-2 rounded-lg bg-emerald-500/10 px-4 py-3 text-sm text-emerald-400 print:hidden">
          <CheckCircle2 className="size-4" />
          Movimiento registrado correctamente.
        </div>
      )}

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <LogoImpresion className="mb-3" />
          <p className="hidden text-sm print:block">{tituloDocumento(movimiento.tipo)}</p>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold">
              {info.label} <span className="font-mono">{formatearNumero(movimiento)}</span>
            </h1>
            <span className="print:hidden">
              <TipoMovimientoBadge tipo={movimiento.tipo} />
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-400 print:text-black">{formatearFecha(movimiento.fecha)}</p>
        </div>
        <div className="flex flex-wrap gap-2 print:hidden">
          {movimiento.tipo === 'salida' && esAdmin && (
            <Link
              to={`/movimientos/nuevo/ajuste_entrada?motivo=devolucion_cliente&origen=${movimiento.id}`}
              className="btn btn-secondary"
            >
              <Undo2 className="size-4" />
              Registrar devolución
            </Link>
          )}
          <button onClick={() => window.print()} className="btn btn-secondary">
            <Printer className="size-4" />
            Imprimir
          </button>
          <button onClick={descargarPdf} disabled={generandoPdf} className="btn btn-primary">
            {generandoPdf ? <Loader2 className="size-4 animate-spin" /> : <FileDown className="size-4" />}
            {movimiento.tipo === 'salida' ? 'Remisión PDF' : 'Comprobante PDF'}
          </button>
        </div>
      </div>

      {errorPdf && (
        <p role="alert" className="mb-6 rounded-lg bg-red-500/10 px-4 py-3 text-sm text-red-400 print:hidden">
          {errorPdf}
        </p>
      )}

      <section className="mb-6 rounded-2xl border border-brand-border bg-brand-card p-6 print:border-slate-300 print:bg-white">
        <dl className="grid gap-x-6 gap-y-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
          {movimiento.tipo === 'entrada' && (
            <Dato label="Proveedor">
              {movimiento.proveedor && (
                <Link to={`/proveedores/${movimiento.proveedor.id}`} className="hover:text-brand-cyan">
                  {movimiento.proveedor.nombre}
                  {movimiento.proveedor.nit && (
                    <span className="block text-xs text-slate-500">NIT {movimiento.proveedor.nit}</span>
                  )}
                </Link>
              )}
            </Dato>
          )}
          {movimiento.tipo === 'salida' && (
            <Dato label="Cliente">
              {movimiento.cliente ? (
                <Link to={`/clientes/${movimiento.cliente.id}`} className="hover:text-brand-cyan">
                  {movimiento.cliente.nombre}
                  <span className="block text-xs text-slate-500">{etiquetaDocumento(movimiento.cliente)}</span>
                </Link>
              ) : (
                'Consumidor final'
              )}
            </Dato>
          )}
          <Dato label={movimiento.tipo === 'salida' ? 'Factura electrónica' : 'Referencia'}>
            {movimiento.tipo === 'salida' ? (movimiento.referencia ?? 'Sin factura') : movimiento.referencia}
          </Dato>
          <Dato label="Bodega">{movimiento.bodega?.nombre}</Dato>
          {movimiento.orden_compra_id && verCostos && (
            <Dato label="Orden de compra">
              <Link to={`/compras/${movimiento.orden_compra_id}`} className="hover:text-brand-cyan">
                Ver orden
              </Link>
            </Dato>
          )}
          <Dato label="Registrado por">{movimiento.usuario}</Dato>
          {enlazados?.origen && (
            <Dato label="Devolución de la venta">
              <Link to={`/movimientos/${enlazados.origen.id}`} className="font-mono hover:text-brand-cyan">
                {formatearNumero(enlazados.origen)}
              </Link>
            </Dato>
          )}
          {movimiento.tipo === 'salida' && enlazados && enlazados.devoluciones.length > 0 && (
            <Dato label="Devoluciones">
              {enlazados.devoluciones.map((d, i) => (
                <span key={d.id}>
                  {i > 0 && ', '}
                  <Link to={`/movimientos/${d.id}`} className="font-mono hover:text-brand-cyan">
                    {formatearNumero(d)}
                  </Link>
                </span>
              ))}
            </Dato>
          )}
          <Dato label={esAjuste(movimiento.tipo) ? 'Motivo' : 'Notas'} className="sm:col-span-2 lg:col-span-4">
            {(esAjuste(movimiento.tipo) ? describirMotivo(movimiento) : movimiento.notas) && (
              <span className="whitespace-pre-line">
                {esAjuste(movimiento.tipo) ? describirMotivo(movimiento) : movimiento.notas}
              </span>
            )}
          </Dato>
        </dl>
      </section>

      <section className="overflow-hidden rounded-2xl border border-brand-border bg-brand-card print:border-slate-300 print:bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-brand-border text-left text-xs tracking-wide text-slate-400 uppercase print:text-black">
              <tr>
                <th className="px-4 py-3 font-medium">Producto</th>
                <th className="px-4 py-3 text-right font-medium">Cantidad</th>
                {mostrarValores && (
                  <>
                    <th className="px-4 py-3 text-right font-medium">
                      {movimiento.tipo === 'salida' ? 'Precio unit.' : 'Costo unit.'}
                    </th>
                    <th className="px-4 py-3 text-right font-medium">Subtotal</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-border">
              {grupos.map((g) => (
                <tr key={g.producto.id} className="align-top">
                  <td className="px-4 py-3">
                    <Link to={`/productos/${g.producto.id}`} className="font-medium hover:text-brand-cyan">
                      {g.producto.nombre}
                    </Link>
                    <div className="font-mono text-xs text-slate-500">{g.producto.sku}</div>
                    {g.seriales.length > 0 && (
                      <ul className="mt-2 flex flex-wrap gap-1.5">
                        {g.seriales.map((s) => (
                          <li
                            key={s.numero_serie}
                            className="rounded border border-brand-border px-1.5 py-0.5 font-mono text-xs text-slate-300 print:text-black"
                          >
                            {s.numero_serie}
                            {s.mac && <span className="ml-1 text-slate-500">{s.mac}</span>}
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">{g.cantidad}</td>
                  {mostrarValores && (
                    <>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        {g.valorUnitario === null ? 'Varios' : formatearPrecio(g.valorUnitario)}
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">{formatearPrecio(g.subtotal)}</td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t border-brand-border font-semibold">
              <tr>
                <td className="px-4 py-3">Total</td>
                <td className="px-4 py-3 text-right">{totalUnidades}</td>
                {mostrarValores && (
                  <>
                    <td />
                    <td className="px-4 py-3 text-right whitespace-nowrap">{formatearPrecio(total)}</td>
                  </>
                )}
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      {/* Dato interno: no sale en el comprobante impreso que se le entrega al cliente */}
      {verCostos && costoVenta !== null && total > 0 && (
        <p className="mt-3 text-right text-sm text-slate-400 print:hidden">
          Costo de lo vendido {formatearPrecio(costoVenta)} · Margen{' '}
          <span className={total - costoVenta >= 0 ? 'text-emerald-400' : 'text-red-400'}>
            {formatearPrecio(total - costoVenta)} ({(((total - costoVenta) / total) * 100).toFixed(1)} %)
          </span>
        </p>
      )}
    </div>
  )
}
