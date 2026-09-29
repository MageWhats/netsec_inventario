import { describe, expect, it } from 'vitest'
import type { TipoMovimiento } from '@/features/movimientos/tipos'
import { trazarKardex, type ItemTrazable } from './trazabilidad'

let secuencia = 0
const item = (movimiento: string, tipo: TipoMovimiento, cantidad: number, unidad_id: string | null = null): ItemTrazable => {
  secuencia++
  const creado = `2026-09-28T10:${String(secuencia).padStart(2, '0')}:00Z`
  return {
    id: `i${secuencia}`,
    cantidad,
    unidad_id,
    movimiento: { id: movimiento, numero: secuencia, tipo, fecha: '2026-09-28T10:00:00Z', created_at: creado },
  }
}

const cantidades = (vinculos: { id: string; cantidad: number }[] | undefined) =>
  Object.fromEntries((vinculos ?? []).map((v) => [v.id, v.cantidad]))

describe('trazarKardex', () => {
  it('por cantidad: la salida consume las entradas más antiguas (PEPS)', () => {
    const { vinculos, quedan } = trazarKardex([
      item('E1', 'entrada', 10),
      item('E2', 'entrada', 5),
      item('S1', 'salida', 12),
    ])
    expect(cantidades(vinculos.get('S1'))).toEqual({ E1: 10, E2: 2 })
    expect(cantidades(vinculos.get('E1'))).toEqual({ S1: 10 })
    expect(quedan.get('E1')).toBeUndefined()
    expect(quedan.get('E2')).toBe(3)
  })

  it('con serial: cada unidad sale de la última entrada en la que ingresó', () => {
    const { vinculos, quedan } = trazarKardex([
      item('E1', 'entrada', 1, 'u1'),
      item('E1', 'entrada', 1, 'u2'),
      item('E2', 'entrada', 1, 'u3'),
      item('S1', 'salida', 1, 'u3'),
      item('S1', 'salida', 1, 'u1'),
      item('A1', 'ajuste_entrada', 1, 'u1'), // devolución
      item('S2', 'salida', 1, 'u1'),
    ])
    expect(cantidades(vinculos.get('S1'))).toEqual({ E2: 1, E1: 1 })
    expect(cantidades(vinculos.get('S2'))).toEqual({ A1: 1 })
    expect(quedan.get('E1')).toBe(1)
    expect(quedan.get('E2')).toBeUndefined()
  })
})
