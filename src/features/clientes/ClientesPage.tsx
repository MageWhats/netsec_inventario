import { Pencil, Plus, Power, PowerOff, Search } from 'lucide-react'
import { useDeferredValue, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { LoadingBlock } from '@/components/ui/LoadingBlock'
import { PageHeader } from '@/components/ui/PageHeader'
import { usePermisos } from '@/features/auth/permisos'
import { mensajeError } from '@/lib/errores'
import { useCambiarActivoCliente, useClientes, type Cliente } from './api'
import { ClienteFormModal } from './components/ClienteFormModal'
import { etiquetaDocumento } from './schema'

type FiltroEstado = 'activos' | 'inactivos' | 'todos'

export function ClientesPage() {
  const navigate = useNavigate()
  const { data: clientes = [], isLoading, error } = useClientes()
  const cambiarActivo = useCambiarActivoCliente()
  const { esAdmin } = usePermisos()

  const [busqueda, setBusqueda] = useState('')
  const [estado, setEstado] = useState<FiltroEstado>('activos')
  const [formAbierto, setFormAbierto] = useState(false)
  const [editando, setEditando] = useState<Cliente | null>(null)
  const [cambiandoActivo, setCambiandoActivo] = useState<Cliente | null>(null)

  const termino = useDeferredValue(busqueda.trim().toLowerCase())
  const filtrados = useMemo(
    () =>
      clientes.filter((c) => {
        if (estado === 'activos' && !c.activo) return false
        if (estado === 'inactivos' && c.activo) return false
        if (!termino) return true
        return [c.nombre, c.documento, c.telefono, c.email, c.ciudad].some((v) => v?.toLowerCase().includes(termino))
      }),
    [clientes, estado, termino],
  )

  function abrirFormulario(cliente: Cliente | null) {
    setEditando(cliente)
    setFormAbierto(true)
  }

  function cerrarConfirmacion() {
    cambiarActivo.reset()
    setCambiandoActivo(null)
  }

  return (
    <>
      <PageHeader
        title="Clientes"
        description="Personas y empresas a las que se despacha mercancía"
        actions={
          esAdmin && (
            <button onClick={() => abrirFormulario(null)} className="btn btn-primary">
              <Plus className="size-4" />
              Nuevo cliente
            </button>
          )
        }
      />

      <div className="mb-4 grid gap-3 md:grid-cols-[1fr_auto]">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-500" />
          <input
            type="search"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por nombre, documento, teléfono, email o ciudad…"
            className="input pl-9"
          />
        </div>
        <select
          value={estado}
          onChange={(e) => setEstado(e.target.value as FiltroEstado)}
          className="input md:w-36"
        >
          <option value="activos">Activos</option>
          <option value="inactivos">Inactivos</option>
          <option value="todos">Todos</option>
        </select>
      </div>

      <div className="overflow-hidden rounded-2xl border border-brand-border bg-brand-card">
        {isLoading ? (
          <LoadingBlock />
        ) : error ? (
          <p className="p-6 text-sm text-red-400">No se pudieron cargar los clientes: {error.message}</p>
        ) : filtrados.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500">
            {clientes.length === 0 ? (
              <>
                Aún no hay clientes.
                {esAdmin && (
                  <>
                    {' '}
                    <button onClick={() => abrirFormulario(null)} className="text-brand-cyan hover:underline">
                      Crea el primero
                    </button>
                  </>
                )}
              </>
            ) : (
              'Ningún cliente coincide con los filtros.'
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-brand-border text-left text-xs tracking-wide text-slate-400 uppercase">
                <tr>
                  <th className="px-4 py-3 font-medium">Cliente</th>
                  <th className="px-4 py-3 font-medium">Teléfono</th>
                  <th className="px-4 py-3 font-medium">Email</th>
                  <th className="px-4 py-3 font-medium">Ciudad</th>
                  <th className="px-4 py-3">
                    <span className="sr-only">Acciones</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-border">
                {filtrados.map((c) => (
                  <tr
                    key={c.id}
                    onClick={() => navigate(`/clientes/${c.id}`)}
                    className={`cursor-pointer transition hover:bg-white/[0.03] ${c.activo ? '' : 'opacity-50'}`}
                  >
                    <td className="px-4 py-3">
                      <Link
                        to={`/clientes/${c.id}`}
                        onClick={(e) => e.stopPropagation()}
                        className="font-medium hover:text-brand-cyan"
                      >
                        {c.nombre}
                      </Link>
                      <div className="mt-0.5 text-xs text-slate-500">
                        {etiquetaDocumento(c)}
                        {!c.activo && <span className="text-amber-400"> · Inactivo</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-300">{c.telefono ?? '—'}</td>
                    <td className="px-4 py-3 text-slate-300">{c.email ?? '—'}</td>
                    <td className="px-4 py-3 text-slate-300">{c.ciudad ?? '—'}</td>
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      {esAdmin && (
                        <div className="flex justify-end gap-1">
                          <button
                            onClick={() => abrirFormulario(c)}
                            className="rounded-lg p-2 text-slate-400 hover:bg-white/5 hover:text-slate-200"
                            title="Editar"
                            aria-label={`Editar ${c.nombre}`}
                          >
                            <Pencil className="size-4" />
                          </button>
                          <button
                            onClick={() => setCambiandoActivo(c)}
                            className={`rounded-lg p-2 text-slate-400 hover:bg-white/5 ${
                              c.activo ? 'hover:text-red-400' : 'hover:text-emerald-400'
                            }`}
                            title={c.activo ? 'Desactivar' : 'Reactivar'}
                            aria-label={`${c.activo ? 'Desactivar' : 'Reactivar'} ${c.nombre}`}
                          >
                            {c.activo ? <PowerOff className="size-4" /> : <Power className="size-4" />}
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {!isLoading && clientes.length > 0 && (
        <p className="mt-3 text-xs text-slate-500">
          Mostrando {filtrados.length} de {clientes.length} clientes
        </p>
      )}

      <ClienteFormModal open={formAbierto} onClose={() => setFormAbierto(false)} cliente={editando} />
      <ConfirmDialog
        open={Boolean(cambiandoActivo)}
        title={cambiandoActivo?.activo ? 'Desactivar cliente' : 'Reactivar cliente'}
        confirmLabel={cambiandoActivo?.activo ? 'Desactivar' : 'Reactivar'}
        danger={cambiandoActivo?.activo}
        pending={cambiarActivo.isPending}
        error={cambiarActivo.error && mensajeError(cambiarActivo.error)}
        onClose={cerrarConfirmacion}
        onConfirm={() =>
          cambiandoActivo &&
          cambiarActivo.mutate(
            { id: cambiandoActivo.id, activo: !cambiandoActivo.activo },
            { onSuccess: cerrarConfirmacion },
          )
        }
      >
        {cambiandoActivo?.activo ? (
          <>
            <strong>{cambiandoActivo.nombre}</strong> no aparecerá al registrar nuevas salidas. Su historial se conserva.
          </>
        ) : (
          <>
            <strong>{cambiandoActivo?.nombre}</strong> volverá a estar disponible para nuevas salidas.
          </>
        )}
      </ConfirmDialog>
    </>
  )
}
