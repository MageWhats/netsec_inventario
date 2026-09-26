import { tablaDesdeColumnas, type ColumnaExportable, type DocumentoExportable } from '@/lib/exportar'
import { formatearFecha, formatearPrecio } from '@/lib/format'
import type { TomaResumen } from './api'
import type { FilaToma } from './diferencias'
import { estadosToma } from './diferencias'

function resultado(f: FilaToma) {
  if (f.contado === null) return 'Sin contar'
  if (f.sobrantes > 0 && f.faltantes > 0) return 'Sobrante y faltante'
  if (f.sobrantes > 0) return 'Sobrante'
  if (f.faltantes > 0) return 'Faltante'
  return 'Cuadra'
}

const precio = (valor: (f: FilaToma) => number): Pick<ColumnaExportable<FilaToma>, 'valor' | 'mostrar' | 'numerica'> => ({
  valor,
  mostrar: (f) => formatearPrecio(valor(f)),
  numerica: true,
})

function columnas(enCurso: boolean, verCostos: boolean): ColumnaExportable<FilaToma>[] {
  const costos: ColumnaExportable<FilaToma>[] = [
    { titulo: 'Costo unitario', ...precio((f) => f.producto.precio_costo) },
    { titulo: 'Valor sobrantes', ...precio((f) => f.sobrantes * f.producto.precio_costo), total: formatearPrecio },
    { titulo: 'Valor faltantes', ...precio((f) => f.faltantes * f.producto.precio_costo), total: formatearPrecio },
  ]
  return [
    { titulo: 'SKU', valor: (f) => f.producto.sku },
    { titulo: 'Producto', valor: (f) => f.producto.nombre },
    { titulo: 'Categoría', valor: (f) => f.producto.categoria?.nombre ?? 'Sin categoría' },
    { titulo: 'Con serial', valor: (f) => (f.producto.es_serializado ? 'Sí' : 'No') },
    { titulo: enCurso ? 'Stock sistema' : 'Stock al iniciar', valor: (f) => f.sistema, numerica: true },
    { titulo: 'Contado', valor: (f) => f.contado, numerica: true },
    { titulo: 'Resultado', valor: resultado },
    { titulo: 'Sobrantes', valor: (f) => f.sobrantes, numerica: true, total: (s) => s.toLocaleString('es-CO') },
    { titulo: 'Faltantes', valor: (f) => f.faltantes, numerica: true, total: (s) => s.toLocaleString('es-CO') },
    ...(verCostos ? costos : []),
    { titulo: 'Seriales encontrados', valor: (f) => f.seriales.map((s) => s.unidad.numero_serie).join(', ') },
  ]
}

/** El conteo completo de una toma (todos los productos, sin importar el filtro en pantalla) */
export function documentoToma(
  toma: TomaResumen,
  filas: FilaToma[],
  enCurso: boolean,
  verCostos: boolean,
): DocumentoExportable {
  const fechas = [`iniciada el ${formatearFecha(toma.created_at)}`, toma.cerrada_at && `cerrada el ${formatearFecha(toma.cerrada_at)}`]
  return {
    archivo: `toma_${toma.numero}`,
    titulo: `Toma de inventario #${toma.numero} · ${estadosToma[toma.estado].label}`,
    subtitulo: [toma.categoria_nombre ?? 'Todo el inventario', ...fechas].filter(Boolean).join(' · '),
    ...tablaDesdeColumnas(columnas(enCurso, verCostos), filas),
  }
}
