import { RefreshCw, WifiOff, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'

/** Cada cuánto se pregunta si hay una versión nueva (la app instalada puede quedar abierta días) */
const REVISAR_CADA_MS = 60 * 60_000

/**
 * Registra el service worker (app instalable y rápida) y avisa:
 * - cuando hay una versión nueva publicada, con un botón para actualizar;
 * - cuando el dispositivo se queda sin conexión (los datos no se pueden guardar hasta que vuelva).
 */
export function ActualizacionApp() {
  const {
    needRefresh: [hayVersionNueva, setHayVersionNueva],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registro) {
      if (registro) setInterval(() => void registro.update(), REVISAR_CADA_MS)
    },
  })
  const enLinea = useEnLinea()

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex flex-col items-center gap-2 px-4 print:hidden">
      {!enLinea && (
        <div
          role="status"
          className="pointer-events-auto flex items-center gap-2 rounded-full border border-amber-500/40 bg-brand-card px-4 py-2 text-sm text-amber-400 shadow-lg"
        >
          <WifiOff className="size-4" />
          Sin conexión: verás los últimos datos cargados, pero no podrás guardar cambios.
        </div>
      )}
      {hayVersionNueva && (
        <div
          role="status"
          className="pointer-events-auto flex items-center gap-3 rounded-2xl border border-brand-border bg-brand-card py-2 pr-2 pl-4 text-sm shadow-lg"
        >
          <span>Hay una versión nueva de la app.</span>
          <button onClick={() => void updateServiceWorker(true)} className="btn btn-primary py-1.5">
            <RefreshCw className="size-4" />
            Actualizar
          </button>
          <button
            onClick={() => setHayVersionNueva(false)}
            className="rounded-lg p-1.5 text-slate-400 hover:text-slate-200"
            aria-label="Más tarde"
          >
            <X className="size-4" />
          </button>
        </div>
      )}
    </div>
  )
}

function useEnLinea() {
  const [enLinea, setEnLinea] = useState(() => navigator.onLine)
  useEffect(() => {
    const actualizar = () => setEnLinea(navigator.onLine)
    window.addEventListener('online', actualizar)
    window.addEventListener('offline', actualizar)
    return () => {
      window.removeEventListener('online', actualizar)
      window.removeEventListener('offline', actualizar)
    }
  }, [])
  return enLinea
}
