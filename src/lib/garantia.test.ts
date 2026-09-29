import { describe, expect, it } from 'vitest'
import { estadoGarantia, vencimientoGarantia } from './garantia'

describe('vencimientoGarantia', () => {
  it('suma los meses a la fecha de venta', () => {
    const vence = vencimientoGarantia(new Date(2026, 2, 15, 10), 12)!
    expect([vence.getFullYear(), vence.getMonth(), vence.getDate()]).toEqual([2027, 2, 15])
  })

  it('una venta del 31 vence el último día de un mes más corto', () => {
    const vence = vencimientoGarantia(new Date(2026, 0, 31), 1)!
    expect([vence.getMonth(), vence.getDate()]).toEqual([1, 28])
  })

  it('sin meses no hay garantía', () => {
    expect(vencimientoGarantia(new Date(), 0)).toBeNull()
  })
})

describe('estadoGarantia', () => {
  const venta = new Date(2026, 0, 10)

  it('vigente, con los días que faltan', () => {
    const estado = estadoGarantia(venta, 6, new Date(2026, 6, 1))
    expect(estado.tipo).toBe('vigente')
    expect(estado.tipo === 'vigente' && estado.diasRestantes).toBe(10)
  })

  it('el último día todavía está vigente', () => {
    expect(estadoGarantia(venta, 6, new Date(2026, 6, 10, 18)).tipo).toBe('vigente')
  })

  it('vencida', () => {
    expect(estadoGarantia(venta, 6, new Date(2026, 6, 11)).tipo).toBe('vencida')
  })

  it('sin garantía', () => {
    expect(estadoGarantia(venta, 0).tipo).toBe('sin_garantia')
  })
})
