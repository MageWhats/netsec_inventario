/*
 * Importación de productos desde Excel (.xlsx) o CSV: lee la tabla, reconoce las columnas por su título
 * (sin importar mayúsculas ni tildes), convierte números y "Sí/No" y valida cada fila antes de enviarla
 * a importar_productos() (migración 0018), que vuelve a validar todo en el servidor.
 */

export type Celda = string | number | boolean | Date | null | undefined

interface InfoColumna {
  titulo: string
  /** Títulos que se aceptan (normalizados: minúsculas, sin tildes ni espacios) */
  alias: string[]
  obligatoria?: boolean
  ejemplo: [string, string]
}

export const COLUMNAS = {
  nombre: {
    titulo: 'Nombre',
    alias: ['nombre', 'producto', 'nombredelproducto'],
    obligatoria: true,
    ejemplo: ['Switch 8 puertos Gigabit', 'Cable UTP Cat6 (metro)'],
  },
  categoria: { titulo: 'Categoría', alias: ['categoria'], obligatoria: true, ejemplo: ['Switches', 'Cableado'] },
  marca: { titulo: 'Marca', alias: ['marca'], ejemplo: ['TP-Link', 'Nexxt'] },
  modelo: { titulo: 'Modelo', alias: ['modelo', 'referencia'], ejemplo: ['TL-SG108', ''] },
  descripcion: { titulo: 'Descripción', alias: ['descripcion', 'detalle'], ejemplo: ['', 'Se vende por metro'] },
  codigo_barras: {
    titulo: 'Código de barras',
    alias: ['codigodebarras', 'codigobarras', 'ean', 'codigo'],
    ejemplo: ['6935364050', ''],
  },
  es_serializado: {
    titulo: 'Con serial',
    alias: ['conserial', 'serial', 'serializado', 'esserializado'],
    ejemplo: ['Sí', 'No'],
  },
  precio_venta: {
    titulo: 'Precio de venta',
    alias: ['preciodeventa', 'precioventa', 'precio', 'pventa'],
    ejemplo: ['120000', '2500'],
  },
  costo: {
    titulo: 'Costo',
    alias: ['costo', 'costounitario', 'preciodecosto', 'costoinicial'],
    ejemplo: ['85000', '1200'],
  },
  stock_minimo: { titulo: 'Stock mínimo', alias: ['stockminimo', 'minimo'], ejemplo: ['2', '100'] },
  stock_inicial: {
    titulo: 'Stock inicial',
    alias: ['stockinicial', 'stock', 'cantidad', 'existencias'],
    ejemplo: ['', '500'],
  },
} satisfies Record<string, InfoColumna>

export type ClaveColumna = keyof typeof COLUMNAS
const CLAVES = Object.keys(COLUMNAS) as ClaveColumna[]

export interface ProductoImportado {
  /** Número de fila en el archivo (la 1 es la de títulos) */
  fila: number
  nombre: string
  categoria: string
  marca: string
  modelo: string
  descripcion: string
  codigo_barras: string
  es_serializado: boolean
  precio_venta: number
  costo: number
  stock_minimo: number
  stock_inicial: number
  /** Impiden importar */
  errores: string[]
  /** Solo avisan */
  avisos: string[]
}

export interface ResultadoLectura {
  productos: ProductoImportado[]
  /** Columnas obligatorias que no están en el archivo */
  faltantes: string[]
  /** Títulos del archivo que no se reconocieron (se ignoran) */
  ignoradas: string[]
}

export const normalizarTitulo = (texto: string) =>
  texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')

const texto = (c: Celda) =>
  c === null || c === undefined ? '' : c instanceof Date ? c.toISOString().slice(0, 10) : String(c).trim()

/**
 * Número escrito como en Colombia o como en inglés: "1.234.567", "1.234,50", "1234.5", "$ 85.000".
 * Devuelve NaN si no es un número.
 */
export function leerNumero(c: Celda): number {
  if (typeof c === 'number') return c
  let t = texto(c).replace(/[$\s]/g, '').replace(/COP/i, '')
  if (t === '') return 0
  const coma = t.lastIndexOf(',')
  const punto = t.lastIndexOf('.')
  if (coma >= 0 && punto >= 0) {
    // El último separador es el decimal
    t = coma > punto ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '')
  } else if (coma >= 0) {
    t = /^-?\d{1,3}(,\d{3})+$/.test(t) ? t.replace(/,/g, '') : t.replace(',', '.')
  } else if (/^-?\d{1,3}(\.\d{3})+$/.test(t)) {
    t = t.replace(/\./g, '') // 85.000 → miles
  }
  return /^-?\d+(\.\d+)?$/.test(t) ? Number(t) : Number.NaN
}

/** "Sí", "si", "x", "1", "true" → true; vacío, "No", "0" → false; otra cosa → null */
export function leerSiNo(c: Celda): boolean | null {
  if (typeof c === 'boolean') return c
  const t = normalizarTitulo(texto(c))
  if (['si', 's', 'x', '1', 'true', 'yes', 'verdadero'].includes(t)) return true
  if (['', 'no', 'n', '0', 'false', 'falso'].includes(t)) return false
  return null
}

/** CSV de Excel en español (;) o en inglés (,), o texto separado por tabuladores; respeta las comillas */
export function parsearCsv(contenido: string): Celda[][] {
  const limpio = contenido.replace(/^\uFEFF/, '')
  const primera = limpio.split(/\r?\n/, 1)[0] ?? ''
  const separador = [';', '\t', ','].reduce(
    (mejor, s) => (primera.split(s).length > primera.split(mejor).length ? s : mejor),
    ';',
  )

  const filas: Celda[][] = []
  let fila: string[] = []
  let celda = ''
  let entreComillas = false
  for (let i = 0; i < limpio.length; i++) {
    const c = limpio[i]!
    if (entreComillas) {
      if (c === '"' && limpio[i + 1] === '"') {
        celda += '"'
        i++
      } else if (c === '"') entreComillas = false
      else celda += c
    } else if (c === '"') entreComillas = true
    else if (c === separador) {
      fila.push(celda)
      celda = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && limpio[i + 1] === '\n') i++
      fila.push(celda)
      filas.push(fila)
      fila = []
      celda = ''
    } else celda += c
  }
  if (celda !== '' || fila.length > 0) {
    fila.push(celda)
    filas.push(fila)
  }
  return filas
}

/**
 * Convierte la tabla (primera fila = títulos) en productos validados.
 * categorias: nombres de las categorías existentes; codigosExistentes: códigos de barras ya usados;
 * nombresExistentes: nombres de productos que ya existen (en minúsculas), para avisar de posibles duplicados.
 */
export function leerProductos(
  tabla: Celda[][],
  contexto: { categorias: string[]; codigosExistentes: Set<string>; nombresExistentes: Set<string> },
): ResultadoLectura {
  const [titulos = [], ...resto] = tabla
  const indice = new Map<ClaveColumna, number>()
  const ignoradas: string[] = []
  titulos.forEach((t, i) => {
    const titulo = texto(t)
    if (!titulo) return
    const clave = CLAVES.find((k) => (COLUMNAS[k].alias as string[]).includes(normalizarTitulo(titulo)))
    if (clave && !indice.has(clave)) indice.set(clave, i)
    else ignoradas.push(titulo)
  })
  const faltantes = CLAVES.filter((k) => 'obligatoria' in COLUMNAS[k] && !indice.has(k)).map((k) => COLUMNAS[k].titulo)
  if (faltantes.length) return { productos: [], faltantes, ignoradas }

  const categorias = new Map(contexto.categorias.map((c) => [c.trim().toLowerCase(), c]))
  const codigosEnArchivo = new Map<string, number>()
  const productos: ProductoImportado[] = []

  resto.forEach((celdas, i) => {
    const valor = (k: ClaveColumna) => (indice.has(k) ? celdas[indice.get(k)!] : null)
    if (celdas.every((c) => texto(c) === '')) return // fila vacía

    const errores: string[] = []
    const avisos: string[] = []
    const fila = i + 2

    const nombre = texto(valor('nombre'))
    if (nombre.length < 2) errores.push('Falta el nombre (mínimo 2 caracteres).')
    else if (nombre.length > 150) errores.push('El nombre supera 150 caracteres.')
    else if (contexto.nombresExistentes.has(nombre.toLowerCase())) avisos.push('Ya existe un producto con este nombre.')

    const categoriaEscrita = texto(valor('categoria'))
    const categoria = categorias.get(categoriaEscrita.toLowerCase())
    if (!categoriaEscrita) errores.push('Falta la categoría.')
    else if (!categoria) errores.push(`La categoría «${categoriaEscrita}» no existe.`)

    const codigo = texto(valor('codigo_barras'))
    if (codigo.length > 50) errores.push('El código de barras supera 50 caracteres.')
    else if (codigo && contexto.codigosExistentes.has(codigo))
      errores.push(`Ya hay un producto con el código de barras ${codigo}.`)
    else if (codigo && codigosEnArchivo.has(codigo))
      errores.push(`El código de barras se repite en la fila ${codigosEnArchivo.get(codigo)}.`)
    if (codigo) codigosEnArchivo.set(codigo, fila)

    const serial = leerSiNo(valor('es_serializado'))
    if (serial === null) errores.push('«Con serial» debe ser Sí o No.')

    const numero = (k: ClaveColumna, entero: boolean) => {
      const n = leerNumero(valor(k))
      const titulo = COLUMNAS[k].titulo
      if (Number.isNaN(n)) errores.push(`«${titulo}» no es un número.`)
      else if (n < 0) errores.push(`«${titulo}» no puede ser negativo.`)
      else if (entero && !Number.isInteger(n)) errores.push(`«${titulo}» debe ser un número entero.`)
      return Number.isNaN(n) ? 0 : n
    }
    const precioVenta = numero('precio_venta', false)
    const costo = numero('costo', false)
    const stockMinimo = numero('stock_minimo', true)
    const stockInicial = numero('stock_inicial', true)

    if (serial && stockInicial > 0) {
      errores.push('Un producto con serial no lleva stock inicial: sus unidades entran con una entrada y sus seriales.')
    }
    if (precioVenta > 0 && precioVenta < costo) avisos.push('El precio de venta es menor que el costo.')
    if (stockInicial > 0 && costo === 0)
      avisos.push('Tiene stock inicial sin costo: el inventario quedará valorado en $0.')

    for (const [k, max] of [
      ['marca', 500],
      ['modelo', 500],
      ['descripcion', 500],
    ] as const) {
      if (texto(valor(k)).length > max) errores.push(`«${COLUMNAS[k].titulo}» supera ${max} caracteres.`)
    }

    productos.push({
      fila,
      nombre,
      categoria: categoria ?? categoriaEscrita,
      marca: texto(valor('marca')),
      modelo: texto(valor('modelo')),
      descripcion: texto(valor('descripcion')),
      codigo_barras: codigo,
      es_serializado: Boolean(serial),
      precio_venta: precioVenta,
      costo,
      stock_minimo: stockMinimo,
      stock_inicial: stockInicial,
      errores,
      avisos,
    })
  })

  return { productos, faltantes, ignoradas }
}

/** Filas de la plantilla que se descarga: títulos y dos ejemplos */
export function plantilla(): { columnas: string[]; filas: string[][] } {
  return {
    columnas: CLAVES.map((k) => COLUMNAS[k].titulo),
    filas: [0, 1].map((i) => CLAVES.map((k) => COLUMNAS[k].ejemplo[i]!)),
  }
}

/** Lo que recibe importar_productos(): los datos, sin los mensajes de validación */
export function paraServidor(p: ProductoImportado) {
  const { errores, avisos, ...datos } = p
  void errores
  void avisos
  return datos
}
