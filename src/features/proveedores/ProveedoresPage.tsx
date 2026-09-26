import { Pencil, Plus, Power, PowerOff, Search } from 'lucide-react'
import { useDeferredValue, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { LoadingBlock } from '@/components/ui/LoadingBlock'
import { PageHeader } from '@/components/ui/PageHeader'
import { usePermisos } from '@/features/auth/permisos'
import { mensajeError } from '@/lib/errores'
import { useCambiarActivoProveedor, useProveedores, type Proveedor } from './api'
import { ProveedorFormModal } from './components/ProveedorFormModal'

type FiltroEstado = 'activos' | 'inactivos' | 'todos'

export function ProveedoresPage() {
  const navigate = useNavigate()
  const { data: proveedores = [], isLoading, error } = useProveedores()
  const cambiarActivo = useCambiarActivoProveedor()
  const { esAdmin } = usePermisos()

  const [busqueda, setBusqueda] = useState('')
  const [estado, setEstado] = useState<FiltroEstado>('activos')
  const [formAbierto, setFormAbierto] = useState(false)
  const [editando, setEditando] = useState<Proveedor | null>(null)
  const [cambiandoActivo, setCambiandoActivo] = useState<Proveedor | null>(null)

  const termino = useDeferredValue(busqueda.trim().toLowerCase())
  const filtrados = useMemo(
    () =>
      proveedores.filter((c) => {
        if (estado === 'activos' && !c.activo) return false
        if (estado === 'inactivos' && c.activo) return false
        if (!termino) return true
        return [c.nombre, c.nit, c.contacto, c.telefono, c.email].some((v) => v?.toLowerCase().includes(termino))
      }),
    [proveedores, estado, termino],
  )

  function abrirFormulario(proveedor: Proveedor | null) {
    setEditando(proveedor)
    setFormAbierto(true)
  }

  function cerrarConfirmacion() {
    cambiarActivo.reset()
    setCambiandoActivo(null)
  }

  return (
    <>
      <PageHeader
        title="Proveedores"
        description="Empresas a las que se compra mercancía"
        actions={
          esAdmin && (
            <button onClick={() => abrirFormulario(null)} className="btn btn-primary">
              <Plus className="size-4" />
              Nuevo proveedor
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
            placeholder="Buscar por nombre, NIT, contacto, teléfono o email…"
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
          <p className="p-6 text-sm text-red-400">No se pudieron cargar los proveedores: {error.message}</p>
        ) : filtrados.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500">
            {proveedores.length === 0 ? (
              <>
                Aún no hay proveedores.
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
              'Ningún proveedor coincide con los filtros.'
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-brand-border text-left text-xs tracking-wide text-slate-400 uppercase">
                <tr>
                  <th className="px-4 py-3 font-medium">Proveedor</th>
                  <th className="px-4 py-3 font-medium">Contacto</th>
                  <th className="px-4 py-3 font-medium">Teléfono</th>
                  <th className="px-4 py-3 font-medium">Email</th>
                  <th className="px-4 py-3">
                    <span className="sr-only">Acciones</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-border">
                {filtrados.map((c) => (
                  <tr
                    key={c.id}
                    onClick={() => navigate(`/proveedores/${c.id}`)}
                    className={`cursor-pointer transition hover:bg-white/[0.03] ${c.activo ? '' : 'opacity-50'}`}
                  >
                    <td className="px-4 py-3">
                      <Link
                        to={`/proveedores/${c.id}`}
                        onClick={(e) => e.stopPropagation()}
                        className="font-medium hover:text-brand-cyan"
                      >
                        {c.nombre}
                      </Link>
                      <div className="mt-0.5 text-xs text-slate-500">
                        {c.nit ? `NIT ${c.nit}` : 'Sin NIT'}
                        {!c.activo && <span className="text-amber-400"> · Inactivo</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-300">{c.contacto ?? '—'}</td>
                    <td className="px-4 py-3 text-slate-300">{c.telefono ?? '—'}</td>
                    <td className="px-4 py-3 text-slate-300">{c.email ?? '—'}</td>
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

      {!isLoading && proveedores.length > 0 && (
        <p className="mt-3 text-xs text-slate-500">
          Mostrando {filtrados.length} de {proveedores.length} proveedores
        </p>
      )}

      <ProveedorFormModal open={formAbierto} onClose={() => setFormAbierto(false)} proveedor={editando} />
      <ConfirmDialog
        open={Boolean(cambiandoActivo)}
        title={cambiandoActivo?.activo ? 'Desactivar proveedor' : 'Reactivar proveedor'}
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
            <strong>{cambiandoActivo.nombre}</strong> no aparecerá al registrar nuevas entradas. Su historial se conserva.
          </>
        ) : (
          <>
            <strong>{cambiandoActivo?.nombre}</strong> volverá a estar disponible para nuevas entradas.
          </>
        )}
      </ConfirmDialog>
    </>
  )
}
