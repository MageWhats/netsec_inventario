import { createBrowserRouter } from 'react-router-dom'
import { AppLayout } from '@/app/AppLayout'
import { NotFoundPage } from '@/app/NotFoundPage'
import { LoginPage } from '@/features/auth/LoginPage'
import { ProtectedRoute } from '@/features/auth/ProtectedRoute'
import { DashboardPage } from '@/features/dashboard/DashboardPage'
import { MovimientosPage } from '@/features/movimientos/MovimientosPage'
import { ProductosPage } from '@/features/productos/ProductosPage'

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  {
    element: <ProtectedRoute />,
    children: [
      {
        element: <AppLayout />,
        children: [
          { index: true, element: <DashboardPage /> },
          { path: 'productos', element: <ProductosPage /> },
          { path: 'movimientos', element: <MovimientosPage /> },
        ],
      },
    ],
  },
  { path: '*', element: <NotFoundPage /> },
])
