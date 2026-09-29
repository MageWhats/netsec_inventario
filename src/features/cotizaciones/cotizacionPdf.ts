import type { Tables } from '@/types/database'
import { etiquetaDocumento } from '@/features/clientes/schema'
import { descargar, latin1, logoPng } from '@/lib/exportar'
import { formatearPrecio } from '@/lib/format'
import { formatearFechaCorta } from '@/lib/garantia'
import { formatearCotizacion, type CotizacionDetalle } from './api'

const AZUL: [number, number, number] = [4, 42, 103]
const TINTA: [number, number, number] = [17, 24, 39]
const GRIS: [number, number, number] = [107, 114, 128]

/** Cotización en PDF, para enviársela al cliente */
export async function generarCotizacion(cotizacion: CotizacionDetalle, empresa: Tables<'empresa'> | null | undefined) {
  const [{ jsPDF }, { autoTable }, logo] = await Promise.all([import('jspdf'), import('jspdf-autotable'), logoPng()])
  const pdf = new jsPDF({ unit: 'pt', format: 'a4' })
  const ancho = pdf.internal.pageSize.getWidth()
  const alto = pdf.internal.pageSize.getHeight()
  const margen = 40
  const t = (texto: string | null | undefined) => latin1(texto ?? '')

  // ---- Encabezado: empresa a la izquierda, número y fechas a la derecha
  let y = margen
  if (logo) pdf.addImage(logo.data, 'PNG', margen, y, (logo.ancho / logo.alto) * 58, 58)
  const x = margen + (logo ? 58 : 0)
  pdf
    .setFont('helvetica', 'bold')
    .setFontSize(12)
    .setTextColor(...AZUL)
    .text(t(empresa?.nombre ?? 'Net&Sec Suministros'), x, y + 12)
  pdf
    .setFont('helvetica', 'normal')
    .setFontSize(8)
    .setTextColor(...GRIS)
  ;[
    empresa?.nit && `NIT ${empresa.nit}`,
    [empresa?.direccion, empresa?.ciudad].filter(Boolean).join(', '),
    [empresa?.telefono && `Tel. ${empresa.telefono}`, empresa?.email].filter(Boolean).join(' · '),
  ]
    .filter((l): l is string => Boolean(l))
    .forEach((linea, i) => pdf.text(t(linea), x, y + 25 + i * 10))

  pdf
    .setFont('helvetica', 'bold')
    .setFontSize(15)
    .setTextColor(...TINTA)
    .text(t('COTIZACIÓN'), ancho - margen, y + 12, { align: 'right' })
  pdf
    .setFontSize(12)
    .setTextColor(...AZUL)
    .text(formatearCotizacion(cotizacion), ancho - margen, y + 28, {
      align: 'right',
    })
  pdf
    .setFont('helvetica', 'normal')
    .setFontSize(9)
    .setTextColor(...GRIS)
  pdf.text(t(`Fecha: ${formatearFechaCorta(cotizacion.created_at)}`), ancho - margen, y + 41, { align: 'right' })
  pdf.text(t(`Válida hasta: ${formatearFechaCorta(`${cotizacion.valida_hasta}T12:00:00`)}`), ancho - margen, y + 52, {
    align: 'right',
  })

  y += 72
  pdf
    .setDrawColor(...AZUL)
    .setLineWidth(1.5)
    .line(margen, y, ancho - margen, y)
  y += 16

  // ---- Cliente
  const c = cotizacion.cliente
  const datos: [string, string][] = [['Cliente', cotizacion.cliente_nombre]]
  if (c) {
    datos.push(['Documento', etiquetaDocumento(c)])
    const contacto = [c.telefono && `Tel. ${c.telefono}`, c.email].filter(Boolean).join(' · ')
    if (contacto) datos.push(['Contacto', contacto])
    const direccion = [c.direccion, c.ciudad].filter(Boolean).join(', ')
    if (direccion) datos.push(['Dirección', direccion])
  }
  if (cotizacion.usuario) datos.push(['Asesor', cotizacion.usuario])

  const mitad = (ancho - margen * 2) / 2
  datos.forEach(([etiqueta, valor], i) => {
    const xDato = margen + (i % 2) * mitad
    const fila = y + Math.floor(i / 2) * 26
    pdf
      .setFont('helvetica', 'normal')
      .setFontSize(7.5)
      .setTextColor(...GRIS)
      .text(t(etiqueta.toUpperCase()), xDato, fila)
    pdf
      .setFont('helvetica', 'bold')
      .setFontSize(9.5)
      .setTextColor(...TINTA)
    pdf.text(pdf.splitTextToSize(t(valor), mitad - 12)[0] ?? '', xDato, fila + 12)
  })
  y += Math.ceil(datos.length / 2) * 26 + 4

  // ---- Productos
  const total = cotizacion.items.reduce((s, i) => s + i.cantidad * i.precio_unitario, 0)
  autoTable(pdf, {
    startY: y + 4,
    margin: { left: margen, right: margen, bottom: 50 },
    head: [['#', 'Producto', 'Cant.', 'Precio unit.', 'Subtotal'].map((h) => t(h))],
    body: cotizacion.items.map((i, n) => {
      const detalle = [i.producto.marca, i.producto.modelo].filter(Boolean).join(' ')
      return [
        String(n + 1),
        t([i.producto.nombre, `SKU ${i.producto.sku}${detalle ? ` · ${detalle}` : ''}`].join('\n')),
        String(i.cantidad),
        t(formatearPrecio(i.precio_unitario)),
        t(formatearPrecio(i.cantidad * i.precio_unitario)),
      ]
    }),
    foot: [['', 'Total', String(cotizacion.unidades), '', t(formatearPrecio(total))]],
    showFoot: 'lastPage',
    styles: {
      font: 'helvetica',
      fontSize: 8.5,
      cellPadding: 5,
      textColor: TINTA,
      lineColor: [203, 213, 225],
      lineWidth: 0.5,
      valign: 'top',
    },
    headStyles: { fillColor: AZUL, textColor: 255, fontStyle: 'bold' },
    footStyles: {
      fillColor: [241, 245, 249],
      textColor: TINTA,
      fontStyle: 'bold',
    },
    columnStyles: { 0: { cellWidth: 22 }, 2: { cellWidth: 38 } },
    didParseCell: (celda) => {
      if ([0, 2, 3, 4].includes(celda.column.index)) celda.cell.styles.halign = 'right'
    },
  })
  y = (pdf as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 18

  // ---- Condiciones: las notas de la cotización y el pie de la empresa
  const nuevaPaginaSiNoCabe = (necesario: number) => {
    if (y + necesario > alto - 60) {
      pdf.addPage()
      y = margen
    }
  }
  const bloques: [string, string][] = []
  if (cotizacion.notas) bloques.push(['Condiciones', cotizacion.notas])
  bloques.push([
    'Validez',
    `Precios válidos hasta el ${formatearFechaCorta(`${cotizacion.valida_hasta}T12:00:00`)}, sujetos a disponibilidad de inventario.`,
  ])
  if (empresa?.pie_documentos) bloques.push(['', empresa.pie_documentos])
  for (const [titulo, texto] of bloques) {
    const lineas = pdf.splitTextToSize(t(texto), ancho - margen * 2)
    nuevaPaginaSiNoCabe(lineas.length * 11 + (titulo ? 22 : 10))
    if (titulo) {
      pdf
        .setFont('helvetica', 'normal')
        .setFontSize(7.5)
        .setTextColor(...GRIS)
        .text(t(titulo.toUpperCase()), margen, y)
      y += 11
    }
    pdf
      .setFont('helvetica', 'normal')
      .setFontSize(titulo ? 9 : 8)
      .setTextColor(...(titulo ? TINTA : GRIS))
      .text(lineas, margen, y)
    y += lineas.length * 11 + 10
  }

  const paginas = pdf.getNumberOfPages()
  for (let i = 1; i <= paginas; i++) {
    pdf.setPage(i)
    pdf
      .setFont('helvetica', 'normal')
      .setFontSize(7.5)
      .setTextColor(...GRIS)
    pdf.text(t(`Cotización ${formatearCotizacion(cotizacion)}`), margen, alto - 22)
    pdf.text(t(`Página ${i} de ${paginas}`), ancho - margen, alto - 22, {
      align: 'right',
    })
  }

  return pdf.output('blob')
}

export async function descargarCotizacion(
  cotizacion: CotizacionDetalle,
  empresa: Tables<'empresa'> | null | undefined,
) {
  descargar(`${formatearCotizacion(cotizacion)}.pdf`, await generarCotizacion(cotizacion, empresa))
}
