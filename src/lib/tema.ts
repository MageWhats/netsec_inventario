import { useSyncExternalStore } from 'react'

/** Tema de la interfaz. Oscuro es el de siempre; claro se activa con el botón del menú. */
export type Tema = 'oscuro' | 'claro'

const CLAVE = 'netsec:tema'
/** Color de la barra del sistema en el teléfono (meta theme-color) */
const COLOR_BARRA: Record<Tema, string> = { oscuro: '#0b0f19', claro: '#f3f5f9' }

const suscriptores = new Set<() => void>()

function leerGuardado(): Tema {
  try {
    return localStorage.getItem(CLAVE) === 'claro' ? 'claro' : 'oscuro'
  } catch {
    return 'oscuro' // navegación privada o almacenamiento bloqueado
  }
}

let actual: Tema = leerGuardado()

function aplicar(tema: Tema) {
  const raiz = document.documentElement
  if (tema === 'claro') raiz.dataset.theme = 'light'
  else delete raiz.dataset.theme
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', COLOR_BARRA[tema])
}

/** Se llama al arrancar (main.tsx), antes de dibujar la app, para que no se vea un destello del otro tema */
export function aplicarTemaGuardado() {
  aplicar(actual)
}

export function cambiarTema(tema: Tema) {
  actual = tema
  try {
    localStorage.setItem(CLAVE, tema)
  } catch {
    // Sin almacenamiento el tema dura hasta recargar
  }
  aplicar(tema)
  suscriptores.forEach((avisar) => avisar())
}

export function useTema(): Tema {
  return useSyncExternalStore(
    (avisar) => {
      suscriptores.add(avisar)
      return () => suscriptores.delete(avisar)
    },
    () => actual,
  )
}
