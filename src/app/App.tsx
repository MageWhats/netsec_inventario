import { RouterProvider } from 'react-router-dom'
import { ActualizacionApp } from '@/app/ActualizacionApp'
import { Providers } from '@/app/providers'
import { router } from '@/app/router'
import { SplashScreen } from '@/components/ui/SplashScreen'

export function App() {
  return (
    <Providers>
      <RouterProvider router={router} />
      <SplashScreen />
      <ActualizacionApp />
    </Providers>
  )
}
