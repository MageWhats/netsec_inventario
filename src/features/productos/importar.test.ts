import { describe, expect, it } from 'vitest'
import { leerNumero, leerProductos, leerSiNo, parsearCsv, plantilla, type Celda } from './importar'

const contexto = {
  categorias: ['Switches', 'Cableado'],
  codigosExistentes: new Set(['111']),
  nombresExistentes: new Set(['router ax']),
}

describe('leerNumero', () => {
  it.each([
    [1500, 1500],
    ['1.234.567', 1234567],
    ['85.000', 85000],
    ['1.234,50', 1234.5],
    ['1,234.50', 1234.5],
    ['12,5', 12.5],
    ['1,234', 1234],
    ['$ 85.000', 85000],
    ['', 0],
    ['doce', Number.NaN],
  ] as [Celda, number][])('%s → %s', (entrada, esperado) => {
    expect(leerNumero(entrada)).toEqual(esperado)
  })
})

describe('leerSiNo', () => {
  it('reconoce las formas habituales', () => {
    expect(['Sí', 'si', 'X', '1', true].map((v) => leerSiNo(v))).toEqual([true, true, true, true, true])
    expect(['No', '', null, '0'].map((v) => leerSiNo(v))).toEqual([false, false, false, false])
    expect(leerSiNo('tal vez')).toBeNull()
  })
})

describe('parsearCsv', () => {
  it('detecta el separador y respeta las comillas', () => {
    expect(parsearCsv('\uFEFFNombre;Precio\r\n"Cable; UTP ""Cat6""";2.500\r\n')).toEqual([
      ['Nombre', 'Precio'],
      ['Cable; UTP "Cat6"', '2.500'],
    ])
    expect(parsearCsv('a,b\n1,2')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ])
  })
})

describe('leerProductos', () => {
  const titulos = [
    'NOMBRE',
    'Categoria',
    'Código de barras',
    'Con serial',
    'Precio de venta',
    'Costo',
    'Stock inicial',
    'Color',
  ]

  it('reconoce las columnas sin importar mayúsculas ni tildes y valida cada fila', () => {
    const { productos, faltantes, ignoradas } = leerProductos(
      [
        titulos,
        ['Switch 8p', 'switches', '222', 'No', '120.000', '85.000', '3', 'Negro'],
        ['', '', '', '', '', '', '', ''], // vacía: se ignora
        ['Cámara', 'Cámaras', '111', 'Sí', '', '', '2', ''],
        ['Router AX', 'Switches', '222', 'quizá', '100', '200', '', ''],
      ],
      contexto,
    )
    expect(faltantes).toEqual([])
    expect(ignoradas).toEqual(['Color'])
    expect(productos).toHaveLength(3)

    const [bueno, camara, router] = productos
    expect(bueno).toMatchObject({
      fila: 2,
      categoria: 'Switches',
      precio_venta: 120000,
      costo: 85000,
      stock_inicial: 3,
      errores: [],
    })
    expect(camara!.fila).toBe(4)
    expect(camara!.errores).toEqual([
      'La categoría «Cámaras» no existe.',
      'Ya hay un producto con el código de barras 111.',
      'Un producto con serial no lleva stock inicial: sus unidades entran con una entrada y sus seriales.',
    ])
    expect(router!.errores).toEqual(['El código de barras se repite en la fila 2.', '«Con serial» debe ser Sí o No.'])
    expect(router!.avisos).toEqual([
      'Ya existe un producto con este nombre.',
      'El precio de venta es menor que el costo.',
    ])
  })

  it('avisa si faltan columnas obligatorias', () => {
    expect(leerProductos([['Nombre', 'Precio']], contexto).faltantes).toEqual(['Categoría'])
  })

  it('la plantilla se puede volver a leer sin errores', () => {
    const { columnas, filas } = plantilla()
    const { productos } = leerProductos([columnas, ...filas], contexto)
    expect(productos).toHaveLength(2)
    expect(productos.flatMap((p) => p.errores)).toEqual([])
  })
})
