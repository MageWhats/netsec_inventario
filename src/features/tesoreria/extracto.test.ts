import { describe, expect, it } from 'vitest'
import { parsearCsv } from '@/features/productos/importar'
import { leerExtracto, leerFecha } from './extracto'

describe('leerFecha', () => {
  it('reconoce los formatos comunes', () => {
    expect(leerFecha('15/10/2026')).toBe('2026-10-15')
    expect(leerFecha('2026-10-05')).toBe('2026-10-05')
    expect(leerFecha('5-1-2026')).toBe('2026-01-05')
    expect(leerFecha(new Date('2026-10-15T00:00:00Z'))).toBe('2026-10-15')
    expect(leerFecha('Saldo final')).toBeNull()
  })
})

describe('leerExtracto', () => {
  it('con débitos y créditos, ignorando el encabezado del banco y los totales', () => {
    const csv = [
      'Banco de prueba;Extracto de octubre',
      'Fecha;Descripción;Documento;Débitos;Créditos',
      '01/10/2026;Transferencia cliente;123;;975.000',
      '03/10/2026;Cuota de manejo;;12.000;',
      ';Totales;;12.000;975.000',
    ].join('\n')
    const r = leerExtracto(parsearCsv(csv))
    expect(r.errores).toEqual([])
    expect(r.lineas).toEqual([
      { fecha: '2026-10-01', descripcion: 'Transferencia cliente', referencia: '123', valor: 975_000 },
      { fecha: '2026-10-03', descripcion: 'Cuota de manejo', referencia: '', valor: -12_000 },
    ])
  })

  it('con una sola columna de valor', () => {
    const r = leerExtracto([
      ['Fecha', 'Concepto', 'Valor'],
      ['2026-10-02', 'Consignación', 500000],
      ['2026-10-04', 'Pago proveedor', -200000.5],
    ])
    expect(r.lineas.map((l) => l.valor)).toEqual([500_000, -200_000.5])
  })

  it('avisa si falta el valor o la fecha', () => {
    expect(leerExtracto([['Fecha', 'Concepto']]).errores[0]).toMatch(/valor/)
    expect(leerExtracto([['Concepto', 'Valor']]).errores[0]).toMatch(/fecha/)
  })
})
