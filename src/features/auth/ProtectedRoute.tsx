import { ShieldOff } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link, Navigate, Outlet, useLocation } from 'react-router-dom'
import { FullScreenLoader } from '@/components/ui/FullScreenLoader'
import { useAuth } from './auth-context'
import { usePerfil, usePermisos, type Permisos } from './permisos'

export function ProtectedRoute() {
  const { session, loading, signOut } = useAuth()
  const { data: perfil, isLoading: cargandoPerfil, error } = usePerfil()
  const location = useLocation()

  if (loading) return <FullScreenLoader />
  if (!session) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  if (cargandoPerfil) return <FullScreenLoader />

  if (error || !perfil?.activo) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center">
        <ShieldOff className="size-12 text-amber-400" />
        <h1 className="text-xl font-semibold">Sin acceso</h1>
        <p className="max-w-sm text-sm text-slate-400">
          {error
            ? 'No se pudo cargar tu perfil. Revisa tu conexión e inténtalo de nuevo.'
            : 'Tu cuenta está desactivada. Si crees que es un error, habla con el administrador.'}
        </p>
        <button onClick={signOut} className="btn btn-secondary">
          Cerrar sesión
        </button>
      </div>
    )
  }

  return <Outlet />
}

/** Rutas que requieren un permiso: sin él se muestra un aviso en lugar de la página */
export function RequierePermiso({ permiso, children }: { permiso: keyof Omit<Permisos, 'rol'>; children?: ReactNode }) {
  const permisos = usePermisos()
  if (!permisos[permiso]) return <SinPermiso />
  return children ?? <Outlet />
}

export function SinPermiso() {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
      <ShieldOff className="size-10 text-slate-500" />
      <p className="text-slate-400">No tienes permisos para ver esta página.</p>
      <Link to="/" className="text-brand-cyan hover:underline">
        Volver al inicio
      </Link>
    </div>
  )
}
