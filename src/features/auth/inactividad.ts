import { useEffect } from 'react'

/** Minutos sin usar la app tras los que se cierra la sesión */
export const MINUTOS_INACTIVIDAD = 10
const LIMITE_MS = MINUTOS_INACTIVIDAD * 60_000
/** Cada cuánto se revisa si se superó el límite */
const INTERVALO_REVISION_MS = 30_000
/** La última actividad se guarda como mucho cada 5 s (el celular puede descartar la página en segundo plano) */
const INTERVALO_GUARDADO_MS = 5_000

const CLAVE_ACTIVIDAD = 'netsec:ultima-actividad'
const CLAVE_AVISO = 'netsec:cierre-inactividad'

const EVENTOS_ACTIVIDAD = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart', 'scroll'] as const

function leer(clave: string): string | null {
  try {
    return sessionStorage.getItem(clave)
  } catch {
    return null
  }
}

function escribir(clave: string, valor: string | null) {
  try {
    if (valor === null) sessionStorage.removeItem(clave)
    else sessionStorage.setItem(clave, valor)
  } catch {
    // Sin almacenamiento: la revisión sigue funcionando en memoria
  }
}

/** Reinicia el contador (al iniciar sesión) o lo borra (al cerrarla) */
export function reiniciarActividad(activa: boolean) {
  escribir(CLAVE_ACTIVIDAD, activa ? String(Date.now()) : null)
}

/** true si la sesión anterior se cerró por inactividad; el aviso se consume con descartarAvisoInactividad */
export function huboCierrePorInactividad(): boolean {
  return leer(CLAVE_AVISO) === '1'
}

export function descartarAvisoInactividad() {
  escribir(CLAVE_AVISO, null)
}

/** Cierra la sesión si pasan MINUTOS_INACTIVIDAD sin tocar la app */
export function useCierrePorInactividad(activo: boolean, cerrarSesion: () => void) {
  useEffect(() => {
    if (!activo) return

    let ultima = Number(leer(CLAVE_ACTIVIDAD)) || Date.now()
    let guardada = 0
    let cerrada = false

    function guardar() {
      guardada = Date.now()
      escribir(CLAVE_ACTIVIDAD, String(ultima))
    }

    /** Devuelve true si cerró la sesión */
    function revisar(): boolean {
      if (cerrada || Date.now() - ultima < LIMITE_MS) return cerrada
      cerrada = true
      escribir(CLAVE_AVISO, '1')
      cerrarSesion()
      return true
    }

    function registrarActividad() {
      if (cerrada) return
      ultima = Date.now()
      if (ultima - guardada > INTERVALO_GUARDADO_MS) guardar()
    }

    // Al volver del segundo plano los temporizadores estuvieron congelados: se revisa antes de contar
    // el regreso como actividad
    function alCambiarVisibilidad() {
      if (document.visibilityState === 'visible' && !revisar()) registrarActividad()
    }

    if (revisar()) return
    guardar()

    const opciones = { passive: true, capture: true }
    for (const evento of EVENTOS_ACTIVIDAD) window.addEventListener(evento, registrarActividad, opciones)
    document.addEventListener('visibilitychange', alCambiarVisibilidad)
    const intervalo = setInterval(revisar, INTERVALO_REVISION_MS)

    return () => {
      for (const evento of EVENTOS_ACTIVIDAD) window.removeEventListener(evento, registrarActividad, opciones)
      document.removeEventListener('visibilitychange', alCambiarVisibilidad)
      clearInterval(intervalo)
    }
  }, [activo, cerrarSesion])
}
