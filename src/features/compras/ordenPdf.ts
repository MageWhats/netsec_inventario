import type { Tables } from '@/types/database'
import { descargar, latin1, logoPng } from '@/lib/exportar'
import { formatearPrecio } from '@/lib/format'
import { formatearFechaCorta } from '@/lib/garantia'
import { formatearOrden, type OrdenDetalle } from './api'

const AZUL: [number, number, number] = [4, 42, 103]
const TINTA: [number, number, number] = [17, 24, 39]
const GRIS: [number, number, number] = [107, 114, 128]

/** Orden de compra en PDF, para enviársela al proveedor */
export async function descargarOrdenPdf(orden: OrdenDetalle, empresa: Tables<'empresa'> | null | undefined) {
  const [{ jsPDF }, { autoTable }, logo] = await Promise.all([import('jspdf'), import('jspdf-autotable'), logoPng()])
  const pdf = new jsPDF({ unit: 'pt', format: 'a4' })
  const ancho = pdf.internal.pageSize.getWidth()
  const alto = pdf.internal.pageSize.getHeight()
  const margen = 40
  const t = (texto: string | null | undefined) => latin1(texto ?? '')

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
    .text('ORDEN DE COMPRA', ancho - margen, y + 12, { align: 'right' })
  pdf
    .setFontSize(12)
    .setTextColor(...AZUL)
    .text(formatearOrden(orden), ancho - margen, y + 28, { align: 'right' })
  pdf
    .setFont('helvetica', 'normal')
    .setFontSize(9)
    .setTextColor(...GRIS)
  pdf.text(t(formatearFechaCorta(orden.created_at)), ancho - margen, y + 41, { align: 'right' })

  y += 72
  pdf
    .setDrawColor(...AZUL)
    .setLineWidth(1.5)
    .line(margen, y, ancho - margen, y)
  y += 16

  const datos: [string, string][] = [
    ['Proveedor', orden.proveedor_nombre],
    [
      'Llegada esperada',
      orden.fecha_esperada ? formatearFechaCorta(`${orden.fecha_esperada}T12:00:00`) : 'Por definir',
    ],
  ]
  const mitad = (ancho - margen * 2) / 2
  datos.forEach(([etiqueta, valor], i) => {
    pdf
      .setFont('helvetica', 'normal')
      .setFontSize(7.5)
      .setTextColor(...GRIS)
      .text(t(etiqueta.toUpperCase()), margen + i * mitad, y)
    pdf
      .setFont('helvetica', 'bold')
      .setFontSize(9.5)
      .setTextColor(...TINTA)
      .text(t(valor), margen + i * mitad, y + 12)
  })
  y += 28
  if (orden.notas) {
    const lineas = pdf.splitTextToSize(t(orden.notas), ancho - margen * 2)
    pdf
      .setFont('helvetica', 'normal')
      .setFontSize(7.5)
      .setTextColor(...GRIS)
      .text('NOTAS', margen, y)
    pdf
      .setFontSize(9)
      .setTextColor(...TINTA)
      .text(lineas, margen, y + 11)
    y += 11 + lineas.length * 11
  }

  const total = orden.items.reduce((s, i) => s + i.cantidad * i.costo_unitario, 0)
  autoTable(pdf, {
    startY: y + 6,
    margin: { left: margen, right: margen, bottom: 50 },
    head: [['#', 'Producto', 'Referencia', 'Cant.', 'Costo unit.', 'Subtotal']],
    body: orden.items.map((i, n) => [
      String(n + 1),
      t(i.producto.nombre),
      t(i.producto.sku),
      String(i.cantidad),
      t(formatearPrecio(i.costo_unitario)),
      t(formatearPrecio(i.cantidad * i.costo_unitario)),
    ]),
    foot: [['', 'Total', '', String(orden.unidades), '', t(formatearPrecio(total))]],
    showFoot: 'lastPage',
    styles: {
      font: 'helvetica',
      fontSize: 8.5,
      cellPadding: 5,
      textColor: TINTA,
      lineColor: [203, 213, 225],
      lineWidth: 0.5,
    },
    headStyles: { fillColor: AZUL, textColor: 255, fontStyle: 'bold' },
    footStyles: { fillColor: [241, 245, 249], textColor: TINTA, fontStyle: 'bold' },
    columnStyles: { 0: { cellWidth: 22 } },
    didParseCell: (celda) => {
      if ([0, 3, 4, 5].includes(celda.column.index)) celda.cell.styles.halign = 'right'
    },
  })

  const paginas = pdf.getNumberOfPages()
  for (let i = 1; i <= paginas; i++) {
    pdf.setPage(i)
    pdf
      .setFont('helvetica', 'normal')
      .setFontSize(7.5)
      .setTextColor(...GRIS)
    pdf.text(t(`Orden de compra ${formatearOrden(orden)}`), margen, alto - 22)
    pdf.text(`Página ${i} de ${paginas}`, ancho - margen, alto - 22, { align: 'right' })
  }

  descargar(`${formatearOrden(orden)}.pdf`, pdf.output('blob'))
}
