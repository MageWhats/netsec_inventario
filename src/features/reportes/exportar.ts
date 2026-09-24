import type { Columna } from './components/TablaReporte'

export type Celda = string | number | null | undefined

/**
 * Descarga un CSV que Excel en español abre bien con doble clic:
 * separador ";" (la coma es el separador decimal) y BOM para que respete tildes y ñ.
 * Los números van sin separador de miles y con coma decimal.
 */
export function descargarCsv(nombreArchivo: string, columnas: string[], filas: Celda[][]) {
  const lineas = [columnas, ...filas].map((fila) => fila.map(formatearCelda).join(';'))
  const blob = new Blob(['﻿' + lineas.join('\r\n')], { type: 'text/csv;charset=utf-8' })

  const url = URL.createObjectURL(blob)
  const enlace = document.createElement('a')
  enlace.href = url
  enlace.download = `${nombreArchivo}.csv`
  enlace.click()
  URL.revokeObjectURL(url)
}

function formatearCelda(valor: Celda): string {
  if (valor === null || valor === undefined) return ''
  if (typeof valor === 'number') return String(valor).replace('.', ',')
  return /[;"\r\n]/.test(valor) ? `"${valor.replace(/"/g, '""')}"` : valor
}

/** Fecha local en formato YYYY-MM-DD, para nombres de archivo y valores por defecto de filtros */
export const fechaIso = (fecha: Date) =>
  `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}-${String(fecha.getDate()).padStart(2, '0')}`

/** Exporta un reporte usando las mismas columnas que la tabla en pantalla */
export function exportarCsv<T>(nombre: string, columnas: Columna<T>[], filas: T[]) {
  descargarCsv(
    `${nombre}_${fechaIso(new Date())}`,
    columnas.map((c) => c.titulo),
    filas.map((fila) => columnas.map((c) => c.valor(fila))),
  )
}
