import { createBrowserRouter } from 'react-router-dom'
import { AppLayout } from '@/app/AppLayout'
import { NotFoundPage } from '@/app/NotFoundPage'
import { FullScreenLoader } from '@/components/ui/FullScreenLoader'
import { BienvenidaPage } from '@/features/auth/BienvenidaPage'
import { LoginPage } from '@/features/auth/LoginPage'
import { ProtectedRoute, RequierePermiso } from '@/features/auth/ProtectedRoute'

// Cada página se descarga al visitarla por primera vez: el teléfono no baja de entrada
// el código de las gráficas, los reportes o el escáner.
// RequierePermiso solo decide qué se muestra: la base de datos aplica los permisos por su cuenta.
export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  // Destino de los enlaces de invitación: ahí se crea la contraseña
  { path: '/bienvenida', element: <BienvenidaPage /> },
  {
    element: <ProtectedRoute />,
    hydrateFallbackElement: <FullScreenLoader />,
    children: [
      {
        element: <AppLayout />,
        children: [
          {
            index: true,
            lazy: () => import('@/features/dashboard/DashboardPage').then((m) => ({ Component: m.DashboardPage })),
          },
          {
            path: 'productos',
            lazy: () => import('@/features/productos/ProductosPage').then((m) => ({ Component: m.ProductosPage })),
          },
          {
            path: 'productos/:id',
            lazy: () =>
              import('@/features/productos/ProductoDetallePage').then((m) => ({ Component: m.ProductoDetallePage })),
          },
          {
            path: 'movimientos',
            lazy: () => import('@/features/movimientos/MovimientosPage').then((m) => ({ Component: m.MovimientosPage })),
          },
          {
            path: 'movimientos/nuevo/:tipo',
            element: <RequierePermiso permiso="puedeOperar" />,
            children: [
              {
                index: true,
                lazy: () =>
                  import('@/features/movimientos/NuevoMovimientoPage').then((m) => ({
                    Component: m.NuevoMovimientoPage,
                  })),
              },
            ],
          },
          {
            path: 'movimientos/:id',
            lazy: () =>
              import('@/features/movimientos/MovimientoDetallePage').then((m) => ({
                Component: m.MovimientoDetallePage,
              })),
          },
          {
            path: 'clientes',
            lazy: () => import('@/features/clientes/ClientesPage').then((m) => ({ Component: m.ClientesPage })),
          },
          {
            path: 'clientes/:id',
            lazy: () => import('@/features/clientes/ClienteDetallePage').then((m) => ({ Component: m.ClienteDetallePage })),
          },
          {
            path: 'proveedores',
            lazy: () => import('@/features/proveedores/ProveedoresPage').then((m) => ({ Component: m.ProveedoresPage })),
          },
          {
            path: 'proveedores/:id',
            lazy: () =>
              import('@/features/proveedores/ProveedorDetallePage').then((m) => ({ Component: m.ProveedorDetallePage })),
          },
          {
            path: 'inventario',
            lazy: () => import('@/features/inventario/TomasPage').then((m) => ({ Component: m.TomasPage })),
          },
          {
            path: 'inventario/:id',
            lazy: () => import('@/features/inventario/TomaDetallePage').then((m) => ({ Component: m.TomaDetallePage })),
          },
          {
            path: 'reportes',
            element: <RequierePermiso permiso="verCostos" />,
            children: [
              {
                index: true,
                lazy: () => import('@/features/reportes/ReportesPage').then((m) => ({ Component: m.ReportesPage })),
              },
            ],
          },
          {
            path: 'configuracion',
            element: <RequierePermiso permiso="esAdmin" />,
            children: [
              {
                index: true,
                lazy: () =>
                  import('@/features/configuracion/ConfiguracionPage').then((m) => ({
                    Component: m.ConfiguracionPage,
                  })),
              },
            ],
          },
        ],
      },
    ],
  },
  { path: '*', element: <NotFoundPage /> },
])
