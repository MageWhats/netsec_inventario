import { useEffect, useRef } from 'react'

// API mínima de Cloudflare Turnstile (https://developers.cloudflare.com/turnstile/)
interface TurnstileApi {
  render: (
    elemento: HTMLElement,
    opciones: {
      sitekey: string
      theme?: 'light' | 'dark' | 'auto'
      language?: string
      callback: (token: string) => void
      'expired-callback': () => void
      'error-callback': () => void
    },
  ) => string
  reset: (id: string) => void
  remove: (id: string) => void
}

declare global {
  interface Window {
    turnstile?: TurnstileApi
  }
}

let cargaScript: Promise<TurnstileApi> | null = null

function cargarTurnstile() {
  cargaScript ??= new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
    script.async = true
    script.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error('Turnstile no cargó')))
    script.onerror = () => {
      cargaScript = null
      reject(new Error('No se pudo cargar la verificación anti-bots'))
    }
    document.head.appendChild(script)
  })
  return cargaScript
}

interface TurnstileProps {
  siteKey: string
  /** Recibe el token de verificación, o null cuando caduca o falla */
  onToken: (token: string | null) => void
  /** Cambiar este número pide un token nuevo (cada token sirve para un solo intento) */
  reinicio: number
}

/** Verificación anti-bots de Cloudflare: casi siempre es invisible para las personas */
export function Turnstile({ siteKey, onToken, reinicio }: TurnstileProps) {
  const contenedor = useRef<HTMLDivElement>(null)
  const widget = useRef<string | null>(null)
  const onTokenRef = useRef(onToken)
  useEffect(() => {
    onTokenRef.current = onToken
  })

  useEffect(() => {
    let cancelado = false
    cargarTurnstile()
      .then((api) => {
        if (cancelado || !contenedor.current) return
        widget.current = api.render(contenedor.current, {
          sitekey: siteKey,
          theme: 'dark',
          language: 'es',
          callback: (token) => onTokenRef.current(token),
          'expired-callback': () => onTokenRef.current(null),
          'error-callback': () => onTokenRef.current(null),
        })
      })
      .catch(() => onTokenRef.current(null))
    return () => {
      cancelado = true
      if (widget.current) window.turnstile?.remove(widget.current)
      widget.current = null
    }
  }, [siteKey])

  useEffect(() => {
    if (reinicio === 0 || !widget.current) return
    onTokenRef.current(null)
    window.turnstile?.reset(widget.current)
  }, [reinicio])

  return <div ref={contenedor} className="flex min-h-16 justify-center" />
}
