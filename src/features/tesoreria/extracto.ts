import { leerNumero, normalizarTitulo, type Celda } from '@/features/productos/importar'

/**
 * Lectura del extracto bancario exportado en Excel o CSV. Los bancos usan títulos distintos; se reconocen los más
 * comunes. El valor viene en una sola columna (positivo entra, negativo sale) o en dos: débitos (salen) y créditos
 * (entran), desde el punto de vista del banco.
 */
const TITULOS = {
  fecha: ['fecha', 'fechamovimiento', 'fechatransaccion', 'fechaoperacion', 'date'],
  descripcion: ['descripcion', 'concepto', 'detalle', 'transaccion', 'movimiento', 'description'],
  referencia: ['referencia', 'documento', 'numerodocumento', 'ref', 'comprobante', 'oficina'],
  valor: ['valor', 'monto', 'importe', 'valortransaccion', 'amount'],
  debito: ['debito', 'debitos', 'retiro', 'retiros', 'cargo', 'cargos', 'salida', 'salidas'],
  credito: ['credito', 'creditos', 'consignacion', 'consignaciones', 'abono', 'abonos', 'entrada', 'entradas'],
} as const

type Campo = keyof typeof TITULOS

export interface LineaExtracto {
  fecha: string
  descripcion: string
  referencia: string
  valor: number
}

export interface ResultadoExtracto {
  lineas: LineaExtracto[]
  errores: string[]
  /** Título de cada columna reconocida */
  columnas: Partial<Record<Campo, string>>
}

const texto = (c: Celda) =>
  c === null || c === undefined ? '' : c instanceof Date ? c.toISOString().slice(0, 10) : String(c).trim()

/** "15/10/2026", "2026-10-15", "15-10-2026", fecha de Excel → "2026-10-15" (null si no es fecha) */
export function leerFecha(c: Celda): string | null {
  if (c instanceof Date) return c.toISOString().slice(0, 10)
  const t = texto(c)
  let m = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/.exec(t)
  if (m) return `${m[1]}-${m[2]!.padStart(2, '0')}-${m[3]!.padStart(2, '0')}`
  m = /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/.exec(t)
  if (m) return `${m[3]}-${m[2]!.padStart(2, '0')}-${m[1]!.padStart(2, '0')}`
  return null
}

export function leerExtracto(tabla: Celda[][]): ResultadoExtracto {
  // La fila de títulos es la primera que tiene una columna de fecha (los bancos ponen encabezados antes)
  const inicio = tabla.findIndex((fila) => fila.some((c) => (TITULOS.fecha as readonly string[]).includes(normalizarTitulo(texto(c)))))
  if (inicio < 0) return { lineas: [], errores: ['No se encontró la columna de fecha.'], columnas: {} }

  const titulos = tabla[inicio]!.map((c) => normalizarTitulo(texto(c)))
  const indice: Partial<Record<Campo, number>> = {}
  const columnas: Partial<Record<Campo, string>> = {}
  for (const campo of Object.keys(TITULOS) as Campo[]) {
    const i = titulos.findIndex((t) => (TITULOS[campo] as readonly string[]).includes(t))
    if (i >= 0) {
      indice[campo] = i
      columnas[campo] = texto(tabla[inicio]![i])
    }
  }

  const errores: string[] = []
  if (indice.valor === undefined && (indice.debito === undefined || indice.credito === undefined)) {
    errores.push('Falta la columna del valor (o las de débitos y créditos).')
    return { lineas: [], errores, columnas }
  }

  const lineas: LineaExtracto[] = []
  tabla.slice(inicio + 1).forEach((fila, n) => {
    if (fila.every((c) => texto(c) === '')) return
    const numeroFila = inicio + n + 2
    const fecha = leerFecha(fila[indice.fecha!])
    if (!fecha) {
      // Filas de totales o saldos al final del extracto: se ignoran si no traen fecha
      if (texto(fila[indice.fecha!]) !== '') errores.push(`Fila ${numeroFila}: fecha no reconocida (${texto(fila[indice.fecha!])}).`)
      return
    }
    const valor =
      indice.valor !== undefined
        ? leerNumero(fila[indice.valor])
        : leerNumero(fila[indice.credito!]) - leerNumero(fila[indice.debito!])
    if (!Number.isFinite(valor)) {
      errores.push(`Fila ${numeroFila}: valor no reconocido.`)
      return
    }
    if (valor === 0) return
    lineas.push({
      fecha,
      descripcion: indice.descripcion !== undefined ? texto(fila[indice.descripcion]).slice(0, 300) : '',
      referencia: indice.referencia !== undefined ? texto(fila[indice.referencia]).slice(0, 100) : '',
      valor: Math.round(valor * 100) / 100,
    })
  })
  return { lineas, errores, columnas }
}
