import { describe, expect, it } from 'vitest'
import { fechaIso, tablaDesdeColumnas, type ColumnaExportable } from './exportar'

interface Fila {
  nombre: string
  cantidad: number
}

const columnas: ColumnaExportable<Fila>[] = [
  { titulo: 'Producto', valor: (f) => f.nombre },
  { titulo: 'Cantidad', valor: (f) => f.cantidad, numerica: true, total: (s) => `${s} und.` },
]

describe('tablaDesdeColumnas', () => {
  it('separa valores crudos (Excel) de textos con formato (PDF y Word) y suma los totales', () => {
    const tabla = tablaDesdeColumnas(columnas, [
      { nombre: 'Switch', cantidad: 1200 },
      { nombre: 'Router', cantidad: 3 },
    ])
    expect(tabla.crudas).toEqual([
      ['Switch', 1200],
      ['Router', 3],
    ])
    expect(tabla.textos[0]).toEqual(['Switch', (1200).toLocaleString('es-CO')])
    expect(tabla.totales).toEqual(['Total (2)', '1203 und.'])
  })

  it('sin columnas con total no hay fila de totales', () => {
    expect(tablaDesdeColumnas([columnas[0]!], []).totales).toBeNull()
  })
})

describe('fechaIso', () => {
  it('usa la fecha local, no la UTC', () => {
    expect(fechaIso(new Date(2026, 0, 5, 23, 30))).toBe('2026-01-05')
  })
})
