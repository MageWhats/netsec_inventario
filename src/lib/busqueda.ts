/** Evento para abrir la búsqueda global (BusquedaGlobal) desde un botón; el atajo Ctrl + K lo escucha ella misma */
export const ABRIR_BUSQUEDA = 'netsec:abrir-busqueda'

export const abrirBusqueda = () => window.dispatchEvent(new Event(ABRIR_BUSQUEDA))

/** "⌘ K" en Mac y "Ctrl K" en el resto */
export const atajoBusqueda = () => (/Mac|iPhone|iPad/.test(navigator.platform) ? '⌘ K' : 'Ctrl K')
