/**
 * Garantía de una unidad vendida: los meses de su categoría (migración 0016) contados desde la venta.
 * Si la venta fue un 31 y el mes de vencimiento es más corto, vence el último día de ese mes.
 */
export function vencimientoGarantia(fechaVenta: string | Date, meses: number): Date | null {
  if (meses <= 0) return null
  const venta = new Date(fechaVenta)
  const vence = new Date(venta.getFullYear(), venta.getMonth() + meses, 1)
  const ultimoDia = new Date(vence.getFullYear(), vence.getMonth() + 1, 0).getDate()
  vence.setDate(Math.min(venta.getDate(), ultimoDia))
  vence.setHours(23, 59, 59, 999)
  return vence
}

export type EstadoGarantia =
  { tipo: 'sin_garantia' } | { tipo: 'vigente'; vence: Date; diasRestantes: number } | { tipo: 'vencida'; vence: Date }

export function estadoGarantia(fechaVenta: string | Date, meses: number, hoy = new Date()): EstadoGarantia {
  const vence = vencimientoGarantia(fechaVenta, meses)
  if (!vence) return { tipo: 'sin_garantia' }
  if (vence.getTime() < hoy.getTime()) return { tipo: 'vencida', vence }
  const diasRestantes = Math.ceil((vence.getTime() - hoy.getTime()) / 86_400_000)
  return { tipo: 'vigente', vence, diasRestantes }
}

export const textoMeses = (meses: number) => `${meses} ${meses === 1 ? 'mes' : 'meses'}`

const fechaCorta = new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium' })
export const formatearFechaCorta = (fecha: Date | string) => fechaCorta.format(new Date(fecha))
