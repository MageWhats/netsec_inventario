import { ArrowDownToLine, ArrowLeft, Pencil } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Dato } from '@/components/ui/Dato'
import { LoadingBlock } from '@/components/ui/LoadingBlock'
import { usePermisos } from '@/features/auth/permisos'
import { useMovimientos } from '@/features/movimientos/api'
import { MovimientosTabla } from '@/features/movimientos/components/MovimientosTabla'
import { useProveedor } from './api'
import { ProveedorFormModal } from './components/ProveedorFormModal'

export function ProveedorDetallePage() {
  const { id = '' } = useParams()
  const { data: proveedor, isLoading, error } = useProveedor(id)
  const entradas = useMovimientos({ proveedorId: id, limite: 100 })
  const [editando, setEditando] = useState(false)
  const { esAdmin, puedeOperar } = usePermisos()

  if (isLoading) return <LoadingBlock />

  if (error || !proveedor) {
    return (
      <div className="p-10 text-center">
        <p className="text-slate-400">
          {error ? `Error al cargar el proveedor: ${error.message}` : 'El proveedor no existe.'}
        </p>
        <Link to="/proveedores" className="mt-4 inline-block text-brand-cyan hover:underline">
          Volver a proveedores
        </Link>
      </div>
    )
  }

  return (
    <>
      <Link to="/proveedores" className="mb-4 inline-flex items-center gap-1 text-sm text-slate-400 hover:text-slate-200">
        <ArrowLeft className="size-4" />
        Proveedores
      </Link>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold">{proveedor.nombre}</h1>
            {!proveedor.activo && (
              <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs text-amber-400">Inactivo</span>
            )}
          </div>
          <p className="mt-1 text-sm text-slate-400">{proveedor.nit ? `NIT ${proveedor.nit}` : 'Sin NIT'}</p>
        </div>
        <div className="flex gap-2">
          {proveedor.activo && puedeOperar && (
            <Link to={`/movimientos/nuevo/entrada?proveedor=${proveedor.id}`} className="btn btn-secondary">
              <ArrowDownToLine className="size-4" />
              Nueva entrada
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
          <Dato label="Contacto">{proveedor.contacto}</Dato>
          <Dato label="Teléfono">{proveedor.telefono}</Dato>
          <Dato label="Email">{proveedor.email}</Dato>
          <Dato label="Dirección">{proveedor.direccion}</Dato>
          <Dato label="Notas" className="sm:col-span-2 lg:col-span-4">
            {proveedor.notas && <span className="whitespace-pre-line">{proveedor.notas}</span>}
          </Dato>
        </dl>
      </section>

      <section className="overflow-hidden rounded-2xl border border-brand-border bg-brand-card">
        <h2 className="border-b border-brand-border p-6 font-semibold">Entradas de este proveedor</h2>
        {entradas.isLoading ? (
          <LoadingBlock />
        ) : entradas.error ? (
          <p className="p-6 text-sm text-red-400">No se pudo cargar el historial: {entradas.error.message}</p>
        ) : !entradas.data?.movimientos.length ? (
          <p className="p-10 text-center text-sm text-slate-500">Todavía no hay entradas de este proveedor.</p>
        ) : (
          <MovimientosTabla movimientos={entradas.data.movimientos} />
        )}
      </section>

      <ProveedorFormModal open={editando} onClose={() => setEditando(false)} proveedor={proveedor} />
    </>
  )
}
