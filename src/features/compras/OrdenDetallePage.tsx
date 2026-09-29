import { ArrowLeft, Ban, FileDown, Loader2, PackageCheck, Pencil } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Dato } from '@/components/ui/Dato'
import { LoadingBlock } from '@/components/ui/LoadingBlock'
import { usePermisos } from '@/features/auth/permisos'
import { useEmpresa } from '@/features/configuracion/api'
import { formatearNumero } from '@/features/movimientos/tipos'
import { mensajeError } from '@/lib/errores'
import { formatearFecha, formatearPrecio } from '@/lib/format'
import { formatearFechaCorta } from '@/lib/garantia'
import { estaAtrasada, formatearOrden, useCancelarOrden, useOrden } from './api'
import { AvanceOrden, EstadoOrdenBadge } from './components/badges'

export function OrdenDetallePage() {
  const { id = '' } = useParams()
  const { data: orden, isLoading, error } = useOrden(id)
  const { data: empresa } = useEmpresa()
  const cancelar = useCancelarOrden()
  const { esAdmin } = usePermisos()
  const [confirmarCancelar, setConfirmarCancelar] = useState(false)
  const [generandoPdf, setGenerandoPdf] = useState(false)

  if (isLoading) return <LoadingBlock />
  if (error || !orden) {
    return (
      <div className="p-10 text-center">
        <p className="text-slate-400">{error ? mensajeError(error) : 'La orden de compra no existe.'}</p>
        <Link to="/compras" className="mt-4 inline-block text-brand-cyan hover:underline">
          Volver a órdenes de compra
        </Link>
      </div>
    )
  }

  const abierta = orden.estado === 'abierta'
  const pendientes = orden.items.filter((i) => i.recibido < i.cantidad)

  async function descargarPdf() {
    if (!orden) return
    setGenerandoPdf(true)
    try {
      const { descargarOrdenPdf } = await import('./ordenPdf')
      await descargarOrdenPdf(orden, empresa)
    } finally {
      setGenerandoPdf(false)
    }
  }

  return (
    <>
      <Link to="/compras" className="mb-4 inline-flex items-center gap-1 text-sm text-slate-400 hover:text-slate-200">
        <ArrowLeft className="size-4" />
        Órdenes de compra
      </Link>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="font-mono text-2xl font-bold">{formatearOrden(orden)}</h1>
            <EstadoOrdenBadge estado={orden.estado} />
          </div>
          <p className="mt-1 text-sm text-slate-400">Creada el {formatearFecha(orden.created_at)}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {esAdmin && abierta && orden.entregas.length === 0 && (
            <Link to={`/compras/${orden.id}/editar`} className="btn btn-secondary">
              <Pencil className="size-4" />
              Editar
            </Link>
          )}
          {esAdmin && abierta && (
            <button onClick={() => setConfirmarCancelar(true)} className="btn btn-secondary">
              <Ban className="size-4" />
              Cancelar orden
            </button>
          )}
          <button onClick={descargarPdf} disabled={generandoPdf} className="btn btn-secondary">
            {generandoPdf ? <Loader2 className="size-4 animate-spin" /> : <FileDown className="size-4" />}
            PDF
          </button>
          {esAdmin && abierta && (
            <Link to={`/movimientos/nuevo/entrada?orden=${orden.id}`} className="btn btn-primary">
              <PackageCheck className="size-4" />
              Recibir mercancía
            </Link>
          )}
        </div>
      </div>

      <section className="mb-6 rounded-2xl border border-brand-border bg-brand-card p-6">
        <dl className="grid gap-x-6 gap-y-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <Dato label="Proveedor">
            <Link to={`/proveedores/${orden.proveedor_id}`} className="hover:text-brand-cyan">
              {orden.proveedor_nombre}
            </Link>
          </Dato>
          <Dato label="Llegada esperada">
            {orden.fecha_esperada && formatearFechaCorta(`${orden.fecha_esperada}T12:00:00`)}
            {estaAtrasada(orden) && <span className="ml-2 text-xs font-medium text-red-400">Atrasada</span>}
          </Dato>
          <Dato label="Recibido">
            <AvanceOrden recibidas={orden.recibidas} unidades={orden.unidades} />
          </Dato>
          <Dato label="Total">{formatearPrecio(orden.total)}</Dato>
          {orden.notas && (
            <Dato label="Notas" className="sm:col-span-2 lg:col-span-4">
              <span className="whitespace-pre-line">{orden.notas}</span>
            </Dato>
          )}
        </dl>
      </section>

      <section className="mb-6 overflow-hidden rounded-2xl border border-brand-border bg-brand-card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-brand-border text-left text-xs tracking-wide text-slate-400 uppercase">
              <tr>
                <th className="px-4 py-3 font-medium">Producto</th>
                <th className="px-4 py-3 text-right font-medium">Pedido</th>
                <th className="px-4 py-3 text-right font-medium">Recibido</th>
                <th className="px-4 py-3 text-right font-medium">Pendiente</th>
                <th className="px-4 py-3 text-right font-medium">Costo unit.</th>
                <th className="px-4 py-3 text-right font-medium">Subtotal</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-border">
              {orden.items.map((i) => {
                const pendiente = Math.max(i.cantidad - i.recibido, 0)
                return (
                  <tr key={i.id}>
                    <td className="px-4 py-3">
                      <Link to={`/productos/${i.producto.id}`} className="font-medium hover:text-brand-cyan">
                        {i.producto.nombre}
                      </Link>
                      <div className="font-mono text-xs text-slate-500">{i.producto.sku}</div>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{i.cantidad}</td>
                    <td className="px-4 py-3 text-right text-slate-300 tabular-nums">{i.recibido}</td>
                    <td
                      className={`px-4 py-3 text-right tabular-nums ${pendiente > 0 && abierta ? 'text-amber-400' : 'text-slate-500'}`}
                    >
                      {pendiente}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap text-slate-300">
                      {formatearPrecio(i.costo_unitario)}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      {formatearPrecio(i.cantidad * i.costo_unitario)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-2xl border border-brand-border bg-brand-card p-6">
        <h2 className="mb-3 font-semibold">Entregas</h2>
        {orden.entregas.length === 0 ? (
          <p className="text-sm text-slate-500">
            Todavía no ha llegado nada.{' '}
            {abierta && pendientes.length > 0 && 'Cuando llegue la mercancía, usa «Recibir mercancía».'}
          </p>
        ) : (
          <ul className="space-y-2 text-sm">
            {orden.entregas.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center gap-x-3">
                <Link to={`/movimientos/${m.id}`} className="font-mono font-medium hover:text-brand-cyan">
                  {formatearNumero(m)}
                </Link>
                <span className="text-slate-400">{formatearFecha(m.fecha)}</span>
                {m.referencia && <span className="text-slate-500">Factura {m.referencia}</span>}
                {m.anulado_at && (
                  <span className="rounded-full bg-red-500/15 px-2 py-0.5 text-xs text-red-400">
                    Anulada: no cuenta
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <ConfirmDialog
        open={confirmarCancelar}
        title={`Cancelar ${formatearOrden(orden)}`}
        confirmLabel="Cancelar orden"
        danger
        pending={cancelar.isPending}
        error={cancelar.error && mensajeError(cancelar.error)}
        onConfirm={() => cancelar.mutate(orden.id, { onSuccess: () => setConfirmarCancelar(false) })}
        onClose={() => {
          cancelar.reset()
          setConfirmarCancelar(false)
        }}
      >
        {orden.entregas.length > 0
          ? 'Lo que ya se recibió queda registrado; lo pendiente ya no se podrá recibir con esta orden.'
          : 'La orden quedará cancelada y no se podrá recibir.'}
      </ConfirmDialog>
    </>
  )
}
