import { FileText, Plus } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { EstadoVacio } from '@/components/ui/EstadoVacio'
import { LoadingBlock } from '@/components/ui/LoadingBlock'
import { PageHeader } from '@/components/ui/PageHeader'
import { usePermisos } from '@/features/auth/permisos'
import { mensajeError } from '@/lib/errores'
import { formatearPrecio } from '@/lib/format'
import { formatearFechaCorta } from '@/lib/garantia'
import { estadosCotizacion, formatearCotizacion, useCotizaciones, type EstadoCotizacion } from './api'
import { EstadoCotizacionBadge } from './components/EstadoCotizacionBadge'

const FILTROS: { valor: EstadoCotizacion | ''; label: string }[] = [
  { valor: 'abierta', label: 'Abiertas' },
  { valor: 'aceptada', label: 'Aceptadas' },
  { valor: 'rechazada', label: 'Rechazadas' },
  { valor: '', label: 'Todas' },
]

export function CotizacionesPage() {
  const [estado, setEstado] = useState<EstadoCotizacion | ''>('abierta')
  const { data: cotizaciones = [], isLoading, error } = useCotizaciones(estado)
  const { puedeOperar } = usePermisos()
  const navigate = useNavigate()

  const botonNueva = puedeOperar && (
    <Link to="/cotizaciones/nueva" className="btn btn-primary">
      <Plus className="size-4" />
      Nueva cotización
    </Link>
  )

  return (
    <>
      <PageHeader
        title="Cotizaciones"
        description="Precios que se le ofrecen a un cliente. Cuando la acepta, se convierte en venta."
        actions={botonNueva}
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
        ) : cotizaciones.length === 0 ? (
          <EstadoVacio
            icono={FileText}
            titulo={
              estado
                ? `No hay cotizaciones ${estadosCotizacion[estado].label.toLowerCase()}s`
                : 'Aún no hay cotizaciones'
            }
            descripcion="Arma una cotización con los productos y precios para el cliente y descárgala en PDF. Si la acepta, la conviertes en venta con un clic."
            accion={botonNueva}
          />
        ) : (
          <table className="tabla-tarjetas w-full text-sm">
            <thead className="border-b border-brand-border text-left text-xs tracking-wide text-slate-400 uppercase">
              <tr>
                <th className="px-4 py-3 font-medium">Cotización</th>
                <th className="px-4 py-3 font-medium">Cliente</th>
                <th className="px-4 py-3 font-medium">Fecha</th>
                <th className="px-4 py-3 font-medium">Válida hasta</th>
                <th className="px-4 py-3 text-right font-medium">Unidades</th>
                <th className="px-4 py-3 text-right font-medium">Total</th>
                <th className="px-4 py-3 font-medium">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-border">
              {cotizaciones.map((c) => (
                <tr
                  key={c.id}
                  onClick={() => navigate(`/cotizaciones/${c.id}`)}
                  className="cursor-pointer transition hover:bg-tinte/[0.03]"
                >
                  <td data-principal className="px-4 py-3">
                    <Link
                      to={`/cotizaciones/${c.id}`}
                      onClick={(e) => e.stopPropagation()}
                      className="font-mono font-medium hover:text-brand-cyan"
                    >
                      {formatearCotizacion(c)}
                    </Link>
                  </td>
                  <td data-label="Cliente" className="max-w-xs truncate px-4 py-3 text-slate-300">
                    {c.cliente_nombre}
                    {!c.cliente_id && <span className="ml-2 text-xs text-slate-500">(no registrado)</span>}
                  </td>
                  <td data-label="Fecha" className="px-4 py-3 whitespace-nowrap text-slate-400">
                    {formatearFechaCorta(c.created_at)}
                  </td>
                  <td
                    data-label="Válida hasta"
                    className={`px-4 py-3 whitespace-nowrap ${c.vencida ? 'text-amber-400' : 'text-slate-400'}`}
                  >
                    {formatearFechaCorta(`${c.valida_hasta}T12:00:00`)}
                  </td>
                  <td data-label="Unidades" className="px-4 py-3 text-right text-slate-300 tabular-nums">
                    {c.unidades}
                  </td>
                  <td data-label="Total" className="px-4 py-3 text-right whitespace-nowrap text-slate-300">
                    {formatearPrecio(c.total)}
                  </td>
                  <td data-label="Estado" className="px-4 py-3">
                    <EstadoCotizacionBadge cotizacion={c} />
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
