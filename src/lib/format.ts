const moneda = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })
const fecha = new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium', timeStyle: 'short' })

export const formatearPrecio = (valor: number) => moneda.format(valor)
export const formatearFecha = (iso: string) => fecha.format(new Date(iso))
