import { createBrowserRouter } from 'react-router-dom'
import { AppLayout } from '@/app/AppLayout'
import { NotFoundPage } from '@/app/NotFoundPage'
import { LoginPage } from '@/features/auth/LoginPage'
import { ProtectedRoute } from '@/features/auth/ProtectedRoute'
import { ClienteDetallePage } from '@/features/clientes/ClienteDetallePage'
import { ClientesPage } from '@/features/clientes/ClientesPage'
import { DashboardPage } from '@/features/dashboard/DashboardPage'
import { MovimientoDetallePage } from '@/features/movimientos/MovimientoDetallePage'
import { MovimientosPage } from '@/features/movimientos/MovimientosPage'
import { NuevoMovimientoPage } from '@/features/movimientos/NuevoMovimientoPage'
import { ProductoDetallePage } from '@/features/productos/ProductoDetallePage'
import { ProductosPage } from '@/features/productos/ProductosPage'
import { ProveedorDetallePage } from '@/features/proveedores/ProveedorDetallePage'
import { ProveedoresPage } from '@/features/proveedores/ProveedoresPage'

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
          { path: 'productos/:id', element: <ProductoDetallePage /> },
          { path: 'movimientos', element: <MovimientosPage /> },
          { path: 'movimientos/nuevo/:tipo', element: <NuevoMovimientoPage /> },
          { path: 'movimientos/:id', element: <MovimientoDetallePage /> },
          { path: 'clientes', element: <ClientesPage /> },
          { path: 'clientes/:id', element: <ClienteDetallePage /> },
          { path: 'proveedores', element: <ProveedoresPage /> },
          { path: 'proveedores/:id', element: <ProveedorDetallePage /> },
        ],
      },
    ],
  },
  { path: '*', element: <NotFoundPage /> },
])
