const moneda = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 })
const fecha = new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium', timeStyle: 'short' })

export const formatearPrecio = (valor: number) => moneda.format(valor)
export const formatearFecha = (iso: string) => fecha.format(new Date(iso))

const monedaCompacta = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  notation: 'compact',
  maximumFractionDigits: 1,
})

/** Para ejes de gráficas y cifras grandes: $ 1,2 M */
export const formatearPrecioCompacto = (valor: number) => monedaCompacta.format(valor)
