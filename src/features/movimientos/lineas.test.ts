import { describe, expect, it } from 'vitest'
import type { Producto } from '@/features/productos/api'
import {
  construirItems,
  destinoPorMotivo,
  macValida,
  nuevaLinea,
  parsearSeriales,
  subtotalLinea,
  unidadesLinea,
  validarLineas,
  type Linea,
} from './lineas'

function producto(datos: Partial<Producto> = {}): Producto {
  return {
    id: 'p1',
    sku: 'NS-SW-0001',
    nombre: 'Switch 8 puertos',
    descripcion: null,
    categoria_id: null,
    marca: null,
    modelo: null,
    codigo_barras: null,
    es_serializado: false,
    precio_costo: 1000,
    precio_venta: 1500,
    stock_minimo: 0,
    activo: true,
    imagen_url: null,
    created_at: '',
    updated_at: '',
    familia_id: null,
    color: null,
    categoria: null,
    familia: null,
    stock: 5,
    ...datos,
  }
}

const linea = (datos: Partial<Linea> = {}, p = producto()): Linea => ({ ...nuevaLinea(p, 'salida'), ...datos })

describe('nuevaLinea', () => {
  it('las salidas precargan el precio de venta', () => {
    expect(nuevaLinea(producto(), 'salida').valorUnitario).toBe(1500)
  })

  it('las entradas precargan el costo promedio solo a quien lo ve', () => {
    expect(nuevaLinea(producto(), 'entrada', true).valorUnitario).toBe(1000)
    // Bodega no ve el costo: tiene que digitar el de la factura
    expect(nuevaLinea(producto(), 'entrada', false).valorUnitario).toBeNaN()
  })
})

describe('unidades y subtotal', () => {
  it('por cantidad', () => {
    const l = linea({ cantidad: 3, valorUnitario: 200 })
    expect(unidadesLinea(l)).toBe(3)
    expect(subtotalLinea(l)).toBe(600)
  })

  it('con serial cuenta seriales nuevos y unidades elegidas', () => {
    const l = linea(
      { series: [{ numero_serie: 'A', mac: '' }], unidadIds: ['u1', 'u2'], valorUnitario: 10 },
      producto({ es_serializado: true }),
    )
    expect(unidadesLinea(l)).toBe(3)
    expect(subtotalLinea(l)).toBe(30)
  })

  it('un campo vacío (NaN) cuenta como cero', () => {
    expect(subtotalLinea(linea({ cantidad: Number.NaN }))).toBe(0)
    expect(subtotalLinea(linea({ valorUnitario: Number.NaN }))).toBe(0)
  })
})

describe('validarLineas', () => {
  it('una salida no puede superar el stock', () => {
    const l = linea({ cantidad: 6 })
    expect(validarLineas('salida', [l]).get(l.key)).toMatch(/Stock insuficiente/)
    expect(validarLineas('entrada', [l]).size).toBe(0)
  })

  it('la cantidad debe ser un entero positivo', () => {
    for (const cantidad of [0, -1, 1.5, Number.NaN]) {
      const l = linea({ cantidad })
      expect(validarLineas('entrada', [l]).get(l.key)).toMatch(/entero mayor que cero/)
    }
  })

  it('exige el valor unitario', () => {
    const l = linea({ valorUnitario: Number.NaN })
    expect(validarLineas('entrada', [l]).get(l.key)).toMatch(/valor unitario/)
  })

  it('con serial exige al menos una unidad y MAC válidas', () => {
    const p = producto({ es_serializado: true })
    const vacia = linea({}, p)
    expect(validarLineas('entrada', [vacia]).get(vacia.key)).toMatch(/Agrega al menos un serial/)
    expect(validarLineas('salida', [vacia]).get(vacia.key)).toMatch(/Selecciona al menos una unidad/)

    const macMala = linea({ series: [{ numero_serie: 'S1', mac: 'xx' }] }, p)
    expect(validarLineas('entrada', [macMala]).get(macMala.key)).toMatch(/MAC/)
  })
})

describe('seriales y MAC', () => {
  it('parsea lo pegado desde Excel: uno por línea, con MAC opcional', () => {
    expect(parsearSeriales(' abc1 \nABC2;aa-bb-cc-dd-ee-ff\n\nabc3\t11:22:33:44:55:66')).toEqual([
      { numero_serie: 'ABC1', mac: '' },
      { numero_serie: 'ABC2', mac: 'AA:BB:CC:DD:EE:FF' },
      { numero_serie: 'ABC3', mac: '11:22:33:44:55:66' },
    ])
  })

  it('valida la MAC (vacía también vale)', () => {
    expect(macValida('')).toBe(true)
    expect(macValida('aa-bb-cc-dd-ee-ff')).toBe(true)
    expect(macValida('AA:BB:CC:DD:EE')).toBe(false)
  })

  it('el motivo del ajuste decide el estado de las unidades', () => {
    expect(destinoPorMotivo('producto_danado')).toBe('danada')
    expect(destinoPorMotivo('envio_garantia')).toBe('en_garantia')
    expect(destinoPorMotivo('perdida')).toBe('baja')
  })
})

describe('construirItems', () => {
  it('salidas por cantidad llevan precio de venta', () => {
    const l = linea({ cantidad: 2, valorUnitario: 1500 })
    expect(construirItems('salida', [l])).toEqual([{ producto_id: 'p1', precio_unitario: 1500, cantidad: 2 }])
  })

  it('ajustes − con serial llevan unidades y estado de destino', () => {
    const l = linea(
      { unidadIds: ['u1'], estadoDestino: 'en_garantia', valorUnitario: 1000 },
      producto({ es_serializado: true }),
    )
    expect(construirItems('ajuste_salida', [l])).toEqual([
      { producto_id: 'p1', costo_unitario: 1000, series: [], unidad_ids: ['u1'], estado_destino: 'en_garantia' },
    ])
  })

  it('las MAC vacías viajan como null', () => {
    const l = linea({ series: [{ numero_serie: 'S1', mac: '' }], valorUnitario: 5 }, producto({ es_serializado: true }))
    expect(construirItems('entrada', [l])).toEqual([
      { producto_id: 'p1', costo_unitario: 5, series: [{ numero_serie: 'S1', mac: null }], unidad_ids: [] },
    ])
  })
})
