import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { FullScreenLoader } from '@/components/ui/FullScreenLoader'
import { useAuth } from './auth-context'

export function ProtectedRoute() {
  const { session, loading } = useAuth()
  const location = useLocation()

  if (loading) return <FullScreenLoader />
  if (!session) return <Navigate to="/login" replace state={{ from: location.pathname }} />

  return <Outlet />
}
