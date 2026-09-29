import { describe, expect, it } from 'vitest'
import { formatearNumero, parsearNumeroMovimiento } from './tipos'

describe('parsearNumeroMovimiento', () => {
  it('sin prefijo busca en todas las series', () => {
    expect(parsearNumeroMovimiento('12')).toEqual({ numero: 12, tipos: [] })
  })

  it('con prefijo busca en su serie (los ajustes + y − comparten la A)', () => {
    expect(parsearNumeroMovimiento('NetS-000012')).toEqual({ numero: 12, tipos: ['salida'] })
    expect(parsearNumeroMovimiento('e7')).toEqual({ numero: 7, tipos: ['entrada'] })
    expect(parsearNumeroMovimiento('#A-3')).toEqual({ numero: 3, tipos: ['ajuste_entrada', 'ajuste_salida'] })
  })

  it('lo que no es un número de movimiento', () => {
    expect(parsearNumeroMovimiento('switch')).toBeNull()
    expect(parsearNumeroMovimiento('0')).toBeNull()
  })

  it('lee lo que escribe formatearNumero', () => {
    expect(parsearNumeroMovimiento(formatearNumero({ tipo: 'entrada', numero: 45 }))).toEqual({
      numero: 45,
      tipos: ['entrada'],
    })
  })
})
