import type { Producto } from '@/features/productos/api'

/** Utilidades de las tarjetas de resumen de los reportes */

export const num = (n: number) => n.toLocaleString('es-CO')

export const porcentaje = (valor: number, base: number) => (base > 0 ? `${((valor / base) * 100).toFixed(1)} %` : '—')

export type FiltroExistencias = 'con' | 'todas' | 'bajo' | 'agotado'

export const agotado = (p: Producto) => p.stock <= 0
/** Con existencias pero en el mínimo o por debajo (los agotados van aparte) */
export const bajoMinimo = (p: Producto) => p.stock > 0 && p.stock <= p.stock_minimo
