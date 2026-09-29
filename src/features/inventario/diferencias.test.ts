import { describe, expect, it } from 'vitest'
import type { TomaProducto, TomaSerial } from './api'
import { calcularFilas, resumir } from './diferencias'

function tomaProducto(
  id: string,
  contado: number | null,
  datos: { serializado?: boolean; stockInicial?: number } = {},
): TomaProducto {
  return {
    producto_id: id,
    stock_inicial: datos.stockInicial ?? 0,
    contado,
    producto: {
      id,
      sku: `SKU-${id}`,
      nombre: `Producto ${id}`,
      codigo_barras: null,
      es_serializado: datos.serializado ?? false,
      activo: true,
      categoria: null,
      precio_costo: 100,
    },
  }
}

const serial = (productoId: string, estado: TomaSerial['unidad']['estado']): TomaSerial =>
  ({
    producto_id: productoId,
    created_at: '',
    unidad: { id: crypto.randomUUID(), numero_serie: 'S', mac: null, estado },
  }) as TomaSerial

describe('calcularFilas', () => {
  it('por cantidad: la diferencia con el stock actual es sobrante o faltante', () => {
    const stock = new Map([
      ['a', 10],
      ['b', 10],
    ])
    const [a, b] = calcularFilas([tomaProducto('a', 12), tomaProducto('b', 7)], [], stock, true)
    expect(a).toMatchObject({ sistema: 10, sobrantes: 2, faltantes: 0 })
    expect(b).toMatchObject({ sistema: 10, sobrantes: 0, faltantes: 3 })
  })

  it('un producto sin contar no se ajusta', () => {
    const [fila] = calcularFilas([tomaProducto('a', null)], [], new Map([['a', 4]]), true)
    expect(fila).toMatchObject({ contado: null, sobrantes: 0, faltantes: 0 })
  })

  it('con serial: sobran las unidades no disponibles encontradas y faltan las disponibles no escaneadas', () => {
    const seriales = [serial('c', 'disponible'), serial('c', 'disponible'), serial('c', 'vendida')]
    const [fila] = calcularFilas([tomaProducto('c', 3, { serializado: true })], seriales, new Map([['c', 4]]), true)
    // 4 disponibles en el sistema, se encontraron 2 de ellas: faltan 2. La vendida que apareció sobra.
    expect(fila).toMatchObject({ sobrantes: 1, faltantes: 2 })
  })

  it('una toma cerrada compara con el stock del inicio', () => {
    const [fila] = calcularFilas([tomaProducto('a', 5, { stockInicial: 8 })], [], new Map([['a', 100]]), false)
    expect(fila).toMatchObject({ sistema: 8, faltantes: 3 })
  })
})

describe('resumir', () => {
  it('suma unidades y valor a costo', () => {
    const stock = new Map([
      ['a', 10],
      ['b', 10],
      ['c', 1],
    ])
    const filas = calcularFilas([tomaProducto('a', 12), tomaProducto('b', 7), tomaProducto('c', null)], [], stock, true)
    expect(resumir(filas)).toEqual({
      total: 3,
      contados: 2,
      productosConSobrante: 1,
      productosConFaltante: 1,
      sobrantes: 2,
      faltantes: 3,
      valorSobrantes: 200,
      valorFaltantes: 300,
    })
  })
})
