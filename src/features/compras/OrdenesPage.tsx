import { ClipboardList, Plus } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { EstadoVacio } from '@/components/ui/EstadoVacio'
import { LoadingBlock } from '@/components/ui/LoadingBlock'
import { PageHeader } from '@/components/ui/PageHeader'
import { usePermisos } from '@/features/auth/permisos'
import { mensajeError } from '@/lib/errores'
import { formatearPrecio } from '@/lib/format'
import { formatearFechaCorta } from '@/lib/garantia'
import { estaAtrasada, estadosOrden, formatearOrden, useOrdenes, type EstadoOrden } from './api'
import { AvanceOrden, EstadoOrdenBadge } from './components/badges'

const FILTROS: { valor: EstadoOrden | ''; label: string }[] = [
  { valor: 'abierta', label: 'Abiertas' },
  { valor: 'recibida', label: 'Recibidas' },
  { valor: 'cancelada', label: 'Canceladas' },
  { valor: '', label: 'Todas' },
]

export function OrdenesPage() {
  const [estado, setEstado] = useState<EstadoOrden | ''>('abierta')
  const { data: ordenes = [], isLoading, error } = useOrdenes(estado)
  const { esAdmin } = usePermisos()
  const navigate = useNavigate()

  return (
    <>
      <PageHeader
        title="Órdenes de compra"
        description="Lo que se le pide a cada proveedor y lo que ya ha llegado"
        actions={
          esAdmin && (
            <Link to="/compras/nueva" className="btn btn-primary">
              <Plus className="size-4" />
              Nueva orden
            </Link>
          )
        }
      />

      <div className="mb-4 flex gap-1 overflow-x-auto" role="tablist">
        {FILTROS.map((f) => (
          <button
            key={f.label}
            role="tab"
            aria-selected={estado === f.valor}
            onClick={() => setEstado(f.valor)}
            className={`rounded-full px-3 py-1.5 text-sm whitespace-nowrap transition ${
              estado === f.valor
                ? 'bg-brand-accent/15 text-brand-accent'
                : 'text-slate-400 hover:bg-tinte/5 hover:text-slate-200'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="overflow-hidden rounded-2xl border border-brand-border bg-brand-card">
        {isLoading ? (
          <LoadingBlock />
        ) : error ? (
          <p className="p-6 text-sm text-red-400">{mensajeError(error)}</p>
        ) : ordenes.length === 0 ? (
          <EstadoVacio
            icono={ClipboardList}
            titulo={
              estado ? `No hay órdenes ${estadosOrden[estado].label.toLowerCase()}s` : 'Aún no hay órdenes de compra'
            }
            descripcion="Crea una orden con lo que le pides a un proveedor. Cuando llegue la mercancía, la recibes y se registra la entrada."
            accion={
              esAdmin && (
                <Link to="/compras/nueva" className="btn btn-primary">
                  <Plus className="size-4" />
                  Nueva orden
                </Link>
              )
            }
          />
        ) : (
          <table className="tabla-tarjetas w-full text-sm">
            <thead className="border-b border-brand-border text-left text-xs tracking-wide text-slate-400 uppercase">
              <tr>
                <th className="px-4 py-3 font-medium">Orden</th>
                <th className="px-4 py-3 font-medium">Proveedor</th>
                <th className="px-4 py-3 font-medium">Creada</th>
                <th className="px-4 py-3 font-medium">Llegada esperada</th>
                <th className="px-4 py-3 font-medium">Recibido</th>
                <th className="px-4 py-3 text-right font-medium">Total</th>
                <th className="px-4 py-3 font-medium">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-border">
              {ordenes.map((o) => (
                <tr
                  key={o.id}
                  onClick={() => navigate(`/compras/${o.id}`)}
                  className="cursor-pointer transition hover:bg-tinte/[0.03]"
                >
                  <td data-principal className="px-4 py-3">
                    <Link
                      to={`/compras/${o.id}`}
                      onClick={(e) => e.stopPropagation()}
                      className="font-mono font-medium hover:text-brand-cyan"
                    >
                      {formatearOrden(o)}
                    </Link>
                  </td>
                  <td data-label="Proveedor" className="max-w-xs truncate px-4 py-3 text-slate-300">
                    {o.proveedor_nombre}
                  </td>
                  <td data-label="Creada" className="px-4 py-3 whitespace-nowrap text-slate-400">
                    {formatearFechaCorta(o.created_at)}
                  </td>
                  <td data-label="Llegada esperada" className="px-4 py-3 whitespace-nowrap text-slate-400">
                    {o.fecha_esperada ? formatearFechaCorta(`${o.fecha_esperada}T12:00:00`) : '—'}
                    {estaAtrasada(o) && <span className="ml-2 text-xs font-medium text-red-400">Atrasada</span>}
                  </td>
                  <td data-label="Recibido" className="px-4 py-3">
                    <AvanceOrden recibidas={o.recibidas} unidades={o.unidades} />
                  </td>
                  <td data-label="Total" className="px-4 py-3 text-right whitespace-nowrap text-slate-300">
                    {formatearPrecio(o.total)}
                  </td>
                  <td data-label="Estado" className="px-4 py-3">
                    <EstadoOrdenBadge estado={o.estado} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  )
}
