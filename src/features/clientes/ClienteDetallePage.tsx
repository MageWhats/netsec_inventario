import { ArrowLeft, ArrowUpFromLine, Pencil } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Dato } from '@/components/ui/Dato'
import { LoadingBlock } from '@/components/ui/LoadingBlock'
import { usePermisos } from '@/features/auth/permisos'
import { formatearFecha } from '@/lib/format'
import { EstadoUnidadBadge } from '@/features/productos/components/badges'
import { useMovimientos } from '@/features/movimientos/api'
import { MovimientosTabla } from '@/features/movimientos/components/MovimientosTabla'
import { formatearNumero } from '@/features/movimientos/tipos'
import { useCliente, useSerialesCliente } from './api'
import { ClienteFormModal } from './components/ClienteFormModal'
import { etiquetaDocumento } from './schema'

export function ClienteDetallePage() {
  const { id = '' } = useParams()
  const { data: cliente, isLoading, error } = useCliente(id)
  const [editando, setEditando] = useState(false)
  const { esAdmin, puedeOperar } = usePermisos()

  if (isLoading) return <LoadingBlock />

  if (error || !cliente) {
    return (
      <div className="p-10 text-center">
        <p className="text-slate-400">{error ? `Error al cargar el cliente: ${error.message}` : 'El cliente no existe.'}</p>
        <Link to="/clientes" className="mt-4 inline-block text-brand-cyan hover:underline">
          Volver a clientes
        </Link>
      </div>
    )
  }

  return (
    <>
      <Link to="/clientes" className="mb-4 inline-flex items-center gap-1 text-sm text-slate-400 hover:text-slate-200">
        <ArrowLeft className="size-4" />
        Clientes
      </Link>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold">{cliente.nombre}</h1>
            {!cliente.activo && (
              <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs text-amber-400">Inactivo</span>
            )}
          </div>
          <p className="mt-1 text-sm text-slate-400">{etiquetaDocumento(cliente)}</p>
        </div>
        <div className="flex gap-2">
          {cliente.activo && puedeOperar && (
            <Link to={`/movimientos/nuevo/salida?cliente=${cliente.id}`} className="btn btn-secondary">
              <ArrowUpFromLine className="size-4" />
              Nueva salida
            </Link>
          )}
          {esAdmin && (
            <button onClick={() => setEditando(true)} className="btn btn-primary">
              <Pencil className="size-4" />
              Editar
            </button>
          )}
        </div>
      </div>

      <section className="mb-6 rounded-2xl border border-brand-border bg-brand-card p-6">
        <h2 className="mb-4 font-semibold">Datos de contacto</h2>
        <dl className="grid gap-x-6 gap-y-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <Dato label="Teléfono">{cliente.telefono}</Dato>
          <Dato label="Email">{cliente.email}</Dato>
          <Dato label="Dirección">{cliente.direccion}</Dato>
          <Dato label="Ciudad">{cliente.ciudad}</Dato>
          <Dato label="Notas" className="sm:col-span-2 lg:col-span-4">
            {cliente.notas && <span className="whitespace-pre-line">{cliente.notas}</span>}
          </Dato>
        </dl>
      </section>

      <HistorialSalidas clienteId={cliente.id} />
      <SerialesVendidos clienteId={cliente.id} />

      <ClienteFormModal open={editando} onClose={() => setEditando(false)} cliente={cliente} />
    </>
  )
}

function HistorialSalidas({ clienteId }: { clienteId: string }) {
  const { data, isLoading, error } = useMovimientos({ clienteId, limite: 100 })

  return (
    <section className="mb-6 overflow-hidden rounded-2xl border border-brand-border bg-brand-card">
      <h2 className="border-b border-brand-border p-6 font-semibold">Salidas al cliente</h2>
      {isLoading ? (
        <LoadingBlock />
      ) : error ? (
        <p className="p-6 text-sm text-red-400">No se pudo cargar el historial: {error.message}</p>
      ) : !data?.movimientos.length ? (
        <p className="p-10 text-center text-sm text-slate-500">Este cliente todavía no tiene salidas registradas.</p>
      ) : (
        <MovimientosTabla movimientos={data.movimientos} />
      )}
    </section>
  )
}

function SerialesVendidos({ clienteId }: { clienteId: string }) {
  const { data: seriales = [], isLoading, error } = useSerialesCliente(clienteId)

  if (!isLoading && !error && seriales.length === 0) return null

  return (
    <section className="overflow-hidden rounded-2xl border border-brand-border bg-brand-card">
      <div className="border-b border-brand-border p-6">
        <h2 className="font-semibold">Equipos entregados (con serial)</h2>
        <p className="mt-1 text-sm text-slate-400">Para consultar garantías: qué serial se entregó, cuándo y en qué salida.</p>
      </div>
      {isLoading ? (
        <LoadingBlock />
      ) : error ? (
        <p className="p-6 text-sm text-red-400">No se pudieron cargar los seriales: {error.message}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-brand-border text-left text-xs tracking-wide text-slate-400 uppercase">
              <tr>
                <th className="px-4 py-3 font-medium">Producto</th>
                <th className="px-4 py-3 font-medium">Serial</th>
                <th className="px-4 py-3 font-medium">MAC</th>
                <th className="px-4 py-3 font-medium">Estado actual</th>
                <th className="px-4 py-3 font-medium">Salida</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-border">
              {seriales.map((s) => (
                <tr key={s.id}>
                  <td className="px-4 py-3">
                    {s.producto && (
                      <Link to={`/productos/${s.producto.id}`} className="hover:text-brand-cyan">
                        {s.producto.nombre}
                      </Link>
                    )}
                  </td>
                  <td className="px-4 py-3 font-mono">{s.unidad.numero_serie}</td>
                  <td className="px-4 py-3 font-mono text-slate-300">{s.unidad.mac ?? '—'}</td>
                  <td className="px-4 py-3">
                    <EstadoUnidadBadge estado={s.unidad.estado} />
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <Link to={`/movimientos/${s.movimiento.id}`} className="font-mono hover:text-brand-cyan">
                      {formatearNumero(s.movimiento)}
                    </Link>
                    <span className="ml-2 text-xs text-slate-500">{formatearFecha(s.movimiento.fecha)}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
