import { Mail, Pencil, Plus, Power, PowerOff } from 'lucide-react'
import { useState } from 'react'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { LoadingBlock } from '@/components/ui/LoadingBlock'
import { useAuth } from '@/features/auth/auth-context'
import { ROLES } from '@/features/auth/permisos'
import { formatearFecha } from '@/lib/format'
import { mensajeError } from '@/lib/errores'
import { useAccionUsuario, useUsuarios, type Usuario } from '../api'
import { UsuarioFormModal } from './UsuarioFormModal'

type Confirmacion = { usuario: Usuario; accion: 'reenviar' | 'desactivar' | 'reactivar' }

const COLOR_ROL = {
  admin: 'bg-brand-accent/15 text-brand-accent',
  bodega: 'bg-amber-500/15 text-amber-400',
  lectura: 'bg-slate-500/15 text-slate-300',
} as const

export function UsuariosTab() {
  const { user } = useAuth()
  const { data: usuarios = [], isLoading, error } = useUsuarios()
  const accion = useAccionUsuario()

  const [formAbierto, setFormAbierto] = useState(false)
  const [editando, setEditando] = useState<Usuario | null>(null)
  const [confirmando, setConfirmando] = useState<Confirmacion | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  function abrirFormulario(usuario: Usuario | null) {
    setEditando(usuario)
    setFormAbierto(true)
  }

  function cerrarConfirmacion() {
    accion.reset()
    setConfirmando(null)
  }

  function confirmar() {
    if (!confirmando) return
    const { usuario, accion: tipo } = confirmando
    accion.mutate(
      { accion: tipo, id: usuario.id },
      {
        onSuccess: () => {
          cerrarConfirmacion()
          if (tipo === 'reenviar') setAviso(`Se envió un nuevo enlace a ${usuario.email}.`)
        },
      },
    )
  }

  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-sm text-slate-400">
          Personas con acceso a la app. Se invitan por correo y cada una crea su propia contraseña.
        </p>
        <button onClick={() => abrirFormulario(null)} className="btn btn-primary shrink-0">
          <Plus className="size-4" />
          Invitar usuario
        </button>
      </div>

      {aviso && (
        <p role="status" className="mb-4 rounded-lg bg-emerald-500/10 px-3 py-2 text-sm text-emerald-400">
          {aviso}
        </p>
      )}

      <div className="overflow-hidden rounded-2xl border border-brand-border bg-brand-card">
        {isLoading ? (
          <LoadingBlock />
        ) : error ? (
          <p className="p-6 text-sm text-red-400">No se pudieron cargar los usuarios: {mensajeError(error)}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-brand-border text-left text-xs tracking-wide text-slate-400 uppercase">
                <tr>
                  <th className="px-4 py-3 font-medium">Usuario</th>
                  <th className="px-4 py-3 font-medium">Rol</th>
                  <th className="px-4 py-3 font-medium">Último ingreso</th>
                  <th className="px-4 py-3">
                    <span className="sr-only">Acciones</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-border">
                {usuarios.map((u) => {
                  const esUnoMismo = u.id === user?.id
                  return (
                    <tr key={u.id} className={u.activo ? '' : 'opacity-50'}>
                      <td className="px-4 py-3">
                        <span className="font-medium">{u.nombre ?? u.email}</span>
                        {esUnoMismo && <span className="text-xs text-slate-500"> (tú)</span>}
                        <div className="mt-0.5 text-xs text-slate-500">
                          {u.email}
                          {!u.activo && <span className="text-amber-400"> · Desactivado</span>}
                          {u.activo && u.pendiente && <span className="text-brand-cyan"> · Invitación pendiente</span>}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${COLOR_ROL[u.rol]}`}>
                          {ROLES[u.rol].label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-300">
                        {u.ultimo_ingreso ? formatearFecha(u.ultimo_ingreso) : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1">
                          <button
                            onClick={() => abrirFormulario(u)}
                            className="rounded-lg p-2 text-slate-400 hover:bg-white/5 hover:text-slate-200"
                            title="Editar nombre y rol"
                            aria-label={`Editar ${u.nombre ?? u.email}`}
                          >
                            <Pencil className="size-4" />
                          </button>
                          {u.activo && !esUnoMismo && (
                            <button
                              onClick={() => setConfirmando({ usuario: u, accion: 'reenviar' })}
                              className="rounded-lg p-2 text-slate-400 hover:bg-white/5 hover:text-brand-cyan"
                              title={u.pendiente ? 'Reenviar invitación' : 'Enviar enlace para cambiar la contraseña'}
                              aria-label={`Enviar correo a ${u.email}`}
                            >
                              <Mail className="size-4" />
                            </button>
                          )}
                          {!esUnoMismo && (
                            <button
                              onClick={() => setConfirmando({ usuario: u, accion: u.activo ? 'desactivar' : 'reactivar' })}
                              className={`rounded-lg p-2 text-slate-400 hover:bg-white/5 ${
                                u.activo ? 'hover:text-red-400' : 'hover:text-emerald-400'
                              }`}
                              title={u.activo ? 'Desactivar' : 'Reactivar'}
                              aria-label={`${u.activo ? 'Desactivar' : 'Reactivar'} ${u.nombre ?? u.email}`}
                            >
                              {u.activo ? <PowerOff className="size-4" /> : <Power className="size-4" />}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <UsuarioFormModal
        open={formAbierto}
        onClose={() => setFormAbierto(false)}
        usuario={editando}
        esUnoMismo={editando?.id === user?.id}
      />
      <ConfirmDialog
        open={Boolean(confirmando)}
        title={
          confirmando?.accion === 'reenviar'
            ? confirmando.usuario.pendiente
              ? 'Reenviar invitación'
              : 'Enviar enlace para cambiar la contraseña'
            : confirmando?.accion === 'desactivar'
              ? 'Desactivar usuario'
              : 'Reactivar usuario'
        }
        confirmLabel={
          confirmando?.accion === 'reenviar' ? 'Enviar' : confirmando?.accion === 'desactivar' ? 'Desactivar' : 'Reactivar'
        }
        danger={confirmando?.accion === 'desactivar'}
        pending={accion.isPending}
        error={accion.error && mensajeError(accion.error)}
        onClose={cerrarConfirmacion}
        onConfirm={confirmar}
      >
        {confirmando?.accion === 'reenviar' ? (
          <>
            Se enviará a <strong>{confirmando.usuario.email}</strong> un enlace para{' '}
            {confirmando.usuario.pendiente ? 'crear' : 'cambiar'} su contraseña.
          </>
        ) : confirmando?.accion === 'desactivar' ? (
          <>
            <strong>{confirmando.usuario.nombre ?? confirmando.usuario.email}</strong> perderá el acceso de inmediato.
            Todo lo que registró se conserva en el historial.
          </>
        ) : (
          <>
            <strong>{confirmando?.usuario.nombre ?? confirmando?.usuario.email}</strong> podrá volver a entrar con su
            contraseña.
          </>
        )}
      </ConfirmDialog>
    </>
  )
}
