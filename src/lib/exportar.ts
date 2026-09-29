import type { ReactNode } from 'react'

export type Celda = string | number | null | undefined
export type FormatoExportacion = 'excel' | 'pdf' | 'word'

/** Lo mínimo que necesita una columna para exportarse (la Columna de los reportes lo cumple) */
export interface ColumnaExportable<T> {
  titulo: string
  /** Valor crudo: va al Excel */
  valor: (fila: T) => Celda
  /** Si devuelve texto (p. ej. un precio con formato), es lo que va al PDF y al Word */
  mostrar?: (fila: T) => ReactNode
  numerica?: boolean
  /** Si existe, la columna se suma en la fila de totales */
  total?: (suma: number) => ReactNode
}

export interface DatosTabla {
  columnas: { titulo: string; numerica: boolean }[]
  /** Valores crudos, para el Excel */
  crudas: Celda[][]
  /** Valores con formato, para el PDF y el Word */
  textos: string[][]
  totales: string[] | null
}

export interface DocumentoExportable extends DatosTabla {
  /** Nombre del archivo sin extensión ni fecha */
  archivo: string
  titulo: string
  subtitulo?: string
}

const EMPRESA = 'Net&Sec Suministros'
const numero = (n: number) => n.toLocaleString('es-CO')

/** Fecha local en formato YYYY-MM-DD, para nombres de archivo y valores por defecto de filtros */
export const fechaIso = (fecha: Date) =>
  `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}-${String(fecha.getDate()).padStart(2, '0')}`

/** Una misma definición de columnas alimenta la tabla en pantalla y los tres formatos de exportación */
export function tablaDesdeColumnas<T>(columnas: ColumnaExportable<T>[], filas: T[]): DatosTabla {
  const texto = (c: ColumnaExportable<T>, fila: T) => {
    const mostrado = c.mostrar?.(fila)
    if (typeof mostrado === 'string') return mostrado
    const valor = c.valor(fila)
    if (valor === null || valor === undefined) return ''
    return typeof valor === 'number' ? numero(valor) : valor
  }
  const hayTotales = columnas.some((c) => c.total)

  return {
    columnas: columnas.map((c) => ({ titulo: c.titulo, numerica: Boolean(c.numerica) })),
    crudas: filas.map((fila) => columnas.map((c) => c.valor(fila))),
    textos: filas.map((fila) => columnas.map((c) => texto(c, fila))),
    totales: hayTotales
      ? columnas.map((c, i) => {
          if (!c.total) return i === 0 ? `Total (${filas.length})` : ''
          const suma = filas.reduce((s, fila) => s + (Number(c.valor(fila)) || 0), 0)
          const formateado = c.total(suma)
          return typeof formateado === 'string' ? formateado : numero(suma)
        })
      : null,
  }
}

export async function exportarDocumento(formato: FormatoExportacion, doc: DocumentoExportable) {
  const archivo = `${doc.archivo}_${fechaIso(new Date())}`
  if (formato === 'excel') return descargarCsv(archivo, doc.columnas.map((c) => c.titulo), doc.crudas)
  if (formato === 'word') return descargar(`${archivo}.doc`, new Blob(['\ufeff' + htmlWord(doc)], { type: 'application/msword' }))
  return descargar(`${archivo}.pdf`, await pdf(doc))
}

/** Imprime el mismo PDF que se exporta, para que papel y archivo sean idénticos */
export const imprimirDocumento = (doc: DocumentoExportable) => imprimirPdf(() => pdf(doc))

// En celulares el visor de PDF no se puede imprimir desde un iframe: se abre en otra pestaña
const esMovil = () =>
  /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) // iPadOS se presenta como Mac

/**
 * Genera un PDF y abre el diálogo de impresión con él. Hay que llamarla directo desde el clic:
 * en celulares la pestaña se abre antes de generar el PDF, o el navegador la bloquea como ventana emergente.
 */
export async function imprimirPdf(generar: () => Promise<Blob>) {
  const pestana = esMovil() ? window.open('', '_blank') : null
  let blob: Blob
  try {
    blob = await generar()
  } catch (e) {
    pestana?.close()
    throw e
  }
  const url = URL.createObjectURL(blob)

  if (pestana) {
    pestana.location.href = url
    return
  }

  const marco = document.createElement('iframe')
  // Sin display:none: el visor de PDF no carga en un iframe oculto así
  Object.assign(marco.style, { position: 'fixed', right: '0', bottom: '0', width: '0', height: '0', border: '0' })
  marco.src = url
  document.body.appendChild(marco)
  await new Promise<void>((resuelto) => {
    marco.onload = () => {
      // El visor necesita un momento después de cargar para poder imprimir
      setTimeout(() => {
        marco.contentWindow?.focus()
        marco.contentWindow?.print()
        resuelto()
      }, 100)
    }
  })
  // El diálogo de impresión no avisa al cerrarse: se limpia después, con margen de sobra
  setTimeout(() => {
    marco.remove()
    URL.revokeObjectURL(url)
  }, 60_000)
}

export function descargar(nombre: string, blob: Blob) {
  const url = URL.createObjectURL(blob)
  const enlace = document.createElement('a')
  enlace.href = url
  enlace.download = nombre
  enlace.click()
  URL.revokeObjectURL(url)
}

const generado = () => `Generado el ${new Date().toLocaleString('es-CO')}`
/** Tablas anchas en horizontal */
const horizontal = (doc: DatosTabla) => doc.columnas.length > 6

// ---------------------------------------------------------------------
// Excel (CSV)
// ---------------------------------------------------------------------

/**
 * Descarga un CSV que Excel en español abre bien con doble clic:
 * separador ";" (la coma es el separador decimal) y BOM para que respete tildes y ñ.
 * Los números van sin separador de miles y con coma decimal.
 */
export function descargarCsv(nombreArchivo: string, columnas: string[], filas: Celda[][]) {
  const lineas = [columnas, ...filas].map((fila) => fila.map(celdaCsv).join(';'))
  descargar(`${nombreArchivo}.csv`, new Blob(['\ufeff' + lineas.join('\r\n')], { type: 'text/csv;charset=utf-8' }))
}

function celdaCsv(valor: Celda): string {
  if (valor === null || valor === undefined) return ''
  if (typeof valor === 'number') return String(valor).replace('.', ',')
  // Inyección de fórmulas: Excel ejecutaría un texto como "=HYPERLINK(...)" o "@SUM(...)".
  // Con un apóstrofo delante se muestra como texto.
  const texto = /^[=+\-@\t\r]/.test(valor) ? `'${valor}` : valor
  return /[;"\r\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto
}

// ---------------------------------------------------------------------
// Word: HTML que Word abre como documento (sin librerías)
// ---------------------------------------------------------------------

const escapar = (texto: string) =>
  texto.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

function htmlWord(doc: DocumentoExportable) {
  const celda = (etiqueta: 'th' | 'td', texto: string, numerica: boolean) =>
    `<${etiqueta}${numerica ? ' class="num"' : ''}>${escapar(texto)}</${etiqueta}>`
  const fila = (textos: string[], etiqueta: 'th' | 'td' = 'td') =>
    `<tr>${textos.map((t, i) => celda(etiqueta, t, Boolean(doc.columnas[i]?.numerica))).join('')}</tr>`
  const pagina = horizontal(doc) ? 'size:841.9pt 595.3pt;mso-page-orientation:landscape;' : 'size:595.3pt 841.9pt;'

  return `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word">
<head><meta charset="utf-8"><title>${escapar(doc.titulo)}</title>
<style>
  @page Seccion { ${pagina} margin:1.5cm; }
  div.Seccion { page: Seccion; }
  body { font-family: Arial, sans-serif; font-size: 9pt; color: #111827; }
  table { border-collapse: collapse; width: 100%; }
  th, td { border: 1px solid #cbd5e1; padding: 3pt 5pt; vertical-align: top; }
  th { background: #042a67; color: #ffffff; text-align: left; }
  .num { text-align: right; }
  tfoot td { font-weight: bold; background: #f1f5f9; }
</style></head>
<body><div class="Seccion">
  <p style="font-size:14pt;font-weight:bold;color:#042a67;margin:0">${escapar(EMPRESA)}</p>
  <h2 style="font-size:13pt;margin:6pt 0 2pt">${escapar(doc.titulo)}</h2>
  ${doc.subtitulo ? `<p style="margin:0">${escapar(doc.subtitulo)}</p>` : ''}
  <p style="margin:0 0 8pt;color:#6b7280;font-size:8pt">${escapar(generado())}</p>
  <table>
    <thead>${fila(doc.columnas.map((c) => c.titulo), 'th')}</thead>
    <tbody>${doc.textos.map((t) => fila(t)).join('')}</tbody>
    ${doc.totales ? `<tfoot>${fila(doc.totales)}</tfoot>` : ''}
  </table>
</div></body></html>`
}

// ---------------------------------------------------------------------
// PDF (jsPDF se carga solo al exportar, para no engordar la app)
// ---------------------------------------------------------------------

/** Las fuentes estándar del PDF solo tienen Latin-1: se cambian los pocos caracteres que quedan fuera */
export const latin1 = (texto: string) =>
  texto
    .replace(/[\u2212\u2013\u2014]/g, '-')
    .replace(/\u2026/g, '...')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u202f\u2009]/g, ' ')
    // eslint-disable-next-line no-control-regex -- todo lo que está fuera de Latin-1, a propósito
    .replace(/[^\u0000-\u00ff]/g, '?')

/** El logo es SVG; jsPDF necesita PNG: se dibuja en un canvas */
export async function logoPng(): Promise<{ data: string; ancho: number; alto: number } | null> {
  // El SVG solo trae viewBox (1110 × 1450), sin ancho ni alto: se fija el tamaño a mano
  const ancho = 555
  const alto = 725
  try {
    const img = new Image(ancho, alto)
    img.src = '/brand/logo-color.svg'
    await img.decode()
    const canvas = document.createElement('canvas')
    canvas.width = ancho
    canvas.height = alto
    canvas.getContext('2d')!.drawImage(img, 0, 0, ancho, alto)
    return { data: canvas.toDataURL('image/png'), ancho, alto }
  } catch {
    return null // sin logo, el PDF se genera igual
  }
}

async function pdf(doc: DocumentoExportable) {
  const [{ jsPDF }, { autoTable }, logo] = await Promise.all([import('jspdf'), import('jspdf-autotable'), logoPng()])
  const pdf = new jsPDF({ orientation: horizontal(doc) ? 'landscape' : 'portrait', unit: 'pt', format: 'a4' })
  const margen = 36
  let y = margen

  if (logo) {
    const alto = 64
    pdf.addImage(logo.data, 'PNG', margen, y, (logo.ancho / logo.alto) * alto, alto)
    y += alto + 14
  } else {
    pdf.setFont('helvetica', 'bold').setFontSize(13).setTextColor(4, 42, 103).text(EMPRESA, margen, y + 10)
    y += 24
  }
  pdf.setFont('helvetica', 'bold').setFontSize(14).setTextColor(17, 24, 39).text(latin1(doc.titulo), margen, y)
  y += 16
  pdf.setFont('helvetica', 'normal').setFontSize(9)
  if (doc.subtitulo) {
    pdf.text(latin1(doc.subtitulo), margen, y)
    y += 12
  }
  pdf.setTextColor(107, 114, 128).text(latin1(generado()), margen, y)

  const derecha = Object.fromEntries(
    doc.columnas.flatMap((c, i) => (c.numerica ? [[i, { halign: 'right' as const }]] : [])),
  )
  autoTable(pdf, {
    startY: y + 10,
    margin: { left: margen, right: margen, bottom: margen },
    head: [doc.columnas.map((c) => latin1(c.titulo))],
    body: doc.textos.map((fila) => fila.map(latin1)),
    foot: doc.totales ? [doc.totales.map(latin1)] : undefined,
    showFoot: 'lastPage',
    styles: { font: 'helvetica', fontSize: 8, cellPadding: 4, textColor: [17, 24, 39], lineColor: [203, 213, 225], lineWidth: 0.5 },
    headStyles: { fillColor: [4, 42, 103], textColor: 255, fontStyle: 'bold' },
    footStyles: { fillColor: [241, 245, 249], textColor: [17, 24, 39], fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: derecha,
    didParseCell: (celda) => {
      if (celda.section !== 'body' && doc.columnas[celda.column.index]?.numerica) celda.cell.styles.halign = 'right'
    },
  })

  const paginas = pdf.getNumberOfPages()
  for (let i = 1; i <= paginas; i++) {
    pdf.setPage(i)
    pdf.setFont('helvetica', 'normal').setFontSize(8).setTextColor(107, 114, 128)
    pdf.text(`Página ${i} de ${paginas}`, pdf.internal.pageSize.getWidth() - margen, pdf.internal.pageSize.getHeight() - 16, {
      align: 'right',
    })
  }
  return pdf.output('blob')
}
