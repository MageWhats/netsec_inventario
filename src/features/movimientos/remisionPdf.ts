import type { Tables } from '@/types/database'
import { etiquetaDocumento } from '@/features/clientes/schema'
import { descargar, latin1, logoPng } from '@/lib/exportar'
import { formatearFecha, formatearPrecio } from '@/lib/format'
import { formatearFechaCorta, textoMeses, vencimientoGarantia } from '@/lib/garantia'
import type { MovimientoDetalle } from './api'
import { tituloDocumento, type GrupoProducto } from './detalle'
import { describirMotivo, esAjuste, formatearNumero } from './tipos'

// Colores de la marca (los mismos de los reportes exportados)
const AZUL: [number, number, number] = [4, 42, 103]
const TINTA: [number, number, number] = [17, 24, 39]
const GRIS: [number, number, number] = [107, 114, 128]
const LINEA: [number, number, number] = [203, 213, 225]

interface OpcionesRemision {
  movimiento: MovimientoDetalle
  grupos: GrupoProducto[]
  empresa: Tables<'empresa'> | null | undefined
  /** Precios en salidas; costos en el resto, solo para quien los ve */
  mostrarValores: boolean
}

/**
 * Remisión (salidas) o comprobante (entradas y ajustes) listo para entregar o archivar: datos de la empresa,
 * del cliente o proveedor, productos con sus seriales, garantía, totales y espacio para las firmas.
 * No incluye datos internos como el costo de lo vendido o el margen.
 */
export async function descargarRemision({ movimiento, grupos, empresa, mostrarValores }: OpcionesRemision) {
  const [{ jsPDF }, { autoTable }, logo] = await Promise.all([import('jspdf'), import('jspdf-autotable'), logoPng()])
  const pdf = new jsPDF({ unit: 'pt', format: 'a4' })
  const ancho = pdf.internal.pageSize.getWidth()
  const alto = pdf.internal.pageSize.getHeight()
  const margen = 40
  const esSalida = movimiento.tipo === 'salida'
  const t = (texto: string | null | undefined) => latin1(texto ?? '')

  // ---- Encabezado: logo y empresa a la izquierda, documento a la derecha
  let y = margen
  if (logo) {
    const altoLogo = 58
    pdf.addImage(logo.data, 'PNG', margen, y, (logo.ancho / logo.alto) * altoLogo, altoLogo)
  }
  const xEmpresa = margen + (logo ? 58 : 0)
  pdf
    .setFont('helvetica', 'bold')
    .setFontSize(12)
    .setTextColor(...AZUL)
  pdf.text(t(empresa?.nombre ?? 'Net&Sec Suministros'), xEmpresa, y + 12)
  pdf
    .setFont('helvetica', 'normal')
    .setFontSize(8)
    .setTextColor(...GRIS)
  const datosEmpresa = [
    empresa?.nit && `NIT ${empresa.nit}`,
    [empresa?.direccion, empresa?.ciudad].filter(Boolean).join(', '),
    [empresa?.telefono && `Tel. ${empresa.telefono}`, empresa?.email].filter(Boolean).join(' · '),
    empresa?.sitio_web,
  ].filter((x): x is string => Boolean(x))
  datosEmpresa.forEach((linea, i) => pdf.text(t(linea), xEmpresa, y + 25 + i * 10))

  pdf
    .setFont('helvetica', 'bold')
    .setFontSize(15)
    .setTextColor(...TINTA)
  pdf.text(t(tituloDocumento(movimiento.tipo).toUpperCase()), ancho - margen, y + 12, { align: 'right' })
  pdf.setFontSize(12).setTextColor(...AZUL)
  pdf.text(t(formatearNumero(movimiento)), ancho - margen, y + 28, { align: 'right' })
  pdf
    .setFont('helvetica', 'normal')
    .setFontSize(9)
    .setTextColor(...GRIS)
  pdf.text(t(formatearFecha(movimiento.fecha)), ancho - margen, y + 41, { align: 'right' })

  y += 72
  pdf
    .setDrawColor(...AZUL)
    .setLineWidth(1.5)
    .line(margen, y, ancho - margen, y)
  y += 16

  // ---- Datos del movimiento en dos columnas
  const datos: [string, string][] = []
  if (esSalida) {
    datos.push(['Cliente', movimiento.cliente?.nombre ?? 'Consumidor final'])
    if (movimiento.cliente) datos.push(['Documento', etiquetaDocumento(movimiento.cliente)])
    datos.push(['Factura electrónica', movimiento.referencia ?? 'Sin factura'])
  } else if (movimiento.tipo === 'entrada') {
    datos.push(['Proveedor', movimiento.proveedor?.nombre ?? 'Sin proveedor'])
    if (movimiento.proveedor?.nit) datos.push(['NIT', movimiento.proveedor.nit])
    datos.push(['Factura / remisión', movimiento.referencia ?? '—'])
  } else {
    datos.push(['Motivo', describirMotivo(movimiento) ?? '—'])
    if (movimiento.referencia) datos.push(['Referencia', movimiento.referencia])
  }
  datos.push(['Bodega', movimiento.bodega?.nombre ?? '—'])
  if (movimiento.usuario) datos.push(['Registrado por', movimiento.usuario])

  const mitad = (ancho - margen * 2) / 2
  datos.forEach(([etiqueta, valor], i) => {
    const x = margen + (i % 2) * mitad
    const fila = y + Math.floor(i / 2) * 26
    pdf
      .setFont('helvetica', 'normal')
      .setFontSize(7.5)
      .setTextColor(...GRIS)
      .text(t(etiqueta.toUpperCase()), x, fila)
    pdf
      .setFont('helvetica', 'bold')
      .setFontSize(9.5)
      .setTextColor(...TINTA)
    pdf.text(pdf.splitTextToSize(t(valor), mitad - 12)[0] ?? '', x, fila + 12)
  })
  y += Math.ceil(datos.length / 2) * 26 + 4

  const notas = !esAjuste(movimiento.tipo) ? movimiento.notas : null
  if (notas) {
    pdf
      .setFont('helvetica', 'normal')
      .setFontSize(7.5)
      .setTextColor(...GRIS)
      .text('NOTAS', margen, y)
    const lineas = pdf.splitTextToSize(t(notas), ancho - margen * 2)
    pdf
      .setFontSize(9)
      .setTextColor(...TINTA)
      .text(lineas, margen, y + 11)
    y += 11 + lineas.length * 11 + 4
  }

  // ---- Productos
  const conGarantia = esSalida && grupos.some((g) => g.garantiaMeses > 0)
  const vence = (g: GrupoProducto) => {
    const fecha = vencimientoGarantia(movimiento.fecha, g.garantiaMeses)
    return fecha ? `${textoMeses(g.garantiaMeses)}\nhasta ${formatearFechaCorta(fecha)}` : 'Sin garantía'
  }
  const cabecera = [
    '#',
    'Producto',
    'Cant.',
    ...(conGarantia ? ['Garantía'] : []),
    ...(mostrarValores ? [esSalida ? 'Precio unit.' : 'Costo unit.', 'Subtotal'] : []),
  ]
  const cuerpo = grupos.map((g, i) => {
    const seriales = g.seriales.map((s) => (s.mac ? `${s.numero_serie} (${s.mac})` : s.numero_serie))
    const producto = [
      g.producto.nombre,
      `SKU ${g.producto.sku}`,
      ...(seriales.length ? [`S/N: ${seriales.join(', ')}`] : []),
    ]
    return [
      String(i + 1),
      t(producto.join('\n')),
      String(g.cantidad),
      ...(conGarantia ? [t(vence(g))] : []),
      ...(mostrarValores
        ? [t(g.valorUnitario === null ? 'Varios' : formatearPrecio(g.valorUnitario)), t(formatearPrecio(g.subtotal))]
        : []),
    ]
  })
  const totalUnidades = grupos.reduce((s, g) => s + g.cantidad, 0)
  const total = grupos.reduce((s, g) => s + g.subtotal, 0)
  const pie = [
    '',
    'Total',
    String(totalUnidades),
    ...(conGarantia ? [''] : []),
    ...(mostrarValores ? ['', t(formatearPrecio(total))] : []),
  ]
  const numericas = new Set([0, 2, ...(mostrarValores ? [cabecera.length - 2, cabecera.length - 1] : [])])

  autoTable(pdf, {
    startY: y + 4,
    margin: { left: margen, right: margen, bottom: 50 },
    head: [cabecera.map((c) => t(c))],
    body: cuerpo,
    foot: [pie],
    showFoot: 'lastPage',
    styles: {
      font: 'helvetica',
      fontSize: 8.5,
      cellPadding: 5,
      textColor: TINTA,
      lineColor: LINEA,
      lineWidth: 0.5,
      valign: 'top',
    },
    headStyles: { fillColor: AZUL, textColor: 255, fontStyle: 'bold' },
    footStyles: { fillColor: [241, 245, 249], textColor: TINTA, fontStyle: 'bold' },
    columnStyles: { 0: { cellWidth: 22 }, 1: { cellWidth: 'auto' }, 2: { cellWidth: 38 } },
    didParseCell: (celda) => {
      if (numericas.has(celda.column.index)) celda.cell.styles.halign = 'right'
    },
  })
  y = (pdf as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 18

  // ---- Pie de la empresa (condiciones, cuentas...) y firmas
  const nuevaPaginaSiNoCabe = (necesario: number) => {
    if (y + necesario > alto - 60) {
      pdf.addPage()
      y = margen
    }
  }
  if (esSalida && empresa?.pie_documentos) {
    const lineas = pdf.splitTextToSize(t(empresa.pie_documentos), ancho - margen * 2)
    nuevaPaginaSiNoCabe(lineas.length * 10 + 10)
    pdf
      .setFont('helvetica', 'normal')
      .setFontSize(8)
      .setTextColor(...GRIS)
      .text(lineas, margen, y)
    y += lineas.length * 10 + 10
  }

  nuevaPaginaSiNoCabe(80)
  y += 40
  const firmas = esSalida ? ['Entregado por', 'Recibido por (nombre, C.C. y firma)'] : ['Entregado por', 'Recibido por']
  const anchoFirma = (ancho - margen * 2 - 40) / 2
  firmas.forEach((etiqueta, i) => {
    const x = margen + i * (anchoFirma + 40)
    pdf
      .setDrawColor(...GRIS)
      .setLineWidth(0.5)
      .line(x, y, x + anchoFirma, y)
    pdf
      .setFont('helvetica', 'normal')
      .setFontSize(8)
      .setTextColor(...GRIS)
      .text(t(etiqueta), x, y + 11)
  })

  // ---- Numeración de páginas
  const paginas = pdf.getNumberOfPages()
  for (let i = 1; i <= paginas; i++) {
    pdf.setPage(i)
    pdf
      .setFont('helvetica', 'normal')
      .setFontSize(7.5)
      .setTextColor(...GRIS)
    pdf.text(t(`${tituloDocumento(movimiento.tipo)} ${formatearNumero(movimiento)}`), margen, alto - 22)
    pdf.text(`Página ${i} de ${paginas}`, ancho - margen, alto - 22, { align: 'right' })
  }

  descargar(`${formatearNumero(movimiento)}.pdf`, pdf.output('blob'))
}
