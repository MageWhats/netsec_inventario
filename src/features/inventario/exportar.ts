import { descargarCsv, fechaIso } from '@/features/reportes/exportar'
import type { TomaResumen } from './api'
import type { FilaToma } from './diferencias'

/** Exporta el conteo completo de una toma (todos los productos, sin importar el filtro en pantalla) */
export function exportarToma(toma: TomaResumen, filas: FilaToma[], enCurso: boolean) {
  descargarCsv(
    `toma_${toma.numero}_${fechaIso(new Date())}`,
    [
      'SKU',
      'Producto',
      'Categoría',
      'Con serial',
      enCurso ? 'Stock sistema' : 'Stock al iniciar',
      'Contado',
      'Resultado',
      'Sobrantes',
      'Faltantes',
      'Costo unitario',
      'Valor sobrantes',
      'Valor faltantes',
      'Seriales encontrados',
    ],
    filas.map((f) => {
      const p = f.producto
      return [
        p.sku,
        p.nombre,
        p.categoria?.nombre ?? 'Sin categoría',
        p.es_serializado ? 'Sí' : 'No',
        f.sistema,
        f.contado,
        resultado(f),
        f.sobrantes,
        f.faltantes,
        p.precio_costo,
        f.sobrantes * p.precio_costo,
        f.faltantes * p.precio_costo,
        f.seriales.map((s) => s.unidad.numero_serie).join(', '),
      ]
    }),
  )
}

function resultado(f: FilaToma) {
  if (f.contado === null) return 'Sin contar'
  if (f.sobrantes > 0 && f.faltantes > 0) return 'Sobrante y faltante'
  if (f.sobrantes > 0) return 'Sobrante'
  if (f.faltantes > 0) return 'Faltante'
  return 'Cuadra'
}
