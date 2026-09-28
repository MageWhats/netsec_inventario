export const EVENTO_SPLASH = 'netsec:mostrar-splash'

/** Vuelve a mostrar la animación de bienvenida (p. ej. al iniciar sesión, mientras carga el dashboard) */
export function mostrarSplash() {
  window.dispatchEvent(new Event(EVENTO_SPLASH))
}
