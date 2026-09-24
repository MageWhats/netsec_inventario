import { createBrowserRouter } from 'react-router-dom'
import { DashboardPage } from '@/features/dashboard/DashboardPage'
import { NotFoundPage } from '@/app/NotFoundPage'

export const router = createBrowserRouter([
  { path: '/', element: <DashboardPage /> },
  { path: '*', element: <NotFoundPage /> },
])
