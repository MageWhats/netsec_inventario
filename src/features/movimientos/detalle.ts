import type { MovimientoDetalle } from './api'

export interface GrupoProducto {
  producto: NonNullable<MovimientoDetalle['items'][number]['producto']>
  cantidad: number
  valorUnitario: number | null
  subtotal: number
  seriales: { numero_serie: string; mac: string | null }[]
  /** Meses de garantía de la categoría del producto (0 = sin garantía) */
  garantiaMeses: number
}

/** Agrupa las líneas por producto (los serializados tienen una línea por unidad) */
export function agruparPorProducto(movimiento: MovimientoDetalle): GrupoProducto[] {
  const usaPrecio = movimiento.tipo === 'salida'
  const grupos = new Map<string, GrupoProducto>()

  for (const item of movimiento.items) {
    if (!item.producto) continue
    const valor = usaPrecio ? item.precio_unitario : item.costo_unitario
    const grupo = grupos.get(item.producto.id) ?? {
      producto: item.producto,
      cantidad: 0,
      valorUnitario: valor,
      subtotal: 0,
      seriales: [],
      garantiaMeses: item.producto.categoria?.garantia_meses ?? 0,
    }
    grupo.cantidad += item.cantidad
    grupo.subtotal += item.cantidad * (valor ?? 0)
    if (grupo.valorUnitario !== valor) grupo.valorUnitario = null // valores distintos en el mismo producto
    if (item.unidad) grupo.seriales.push({ numero_serie: item.unidad.numero_serie, mac: item.unidad.mac })
    grupos.set(item.producto.id, grupo)
  }
  return [...grupos.values()].sort((a, b) => a.producto.nombre.localeCompare(b.producto.nombre))
}

/** Título del documento según el tipo de movimiento */
export function tituloDocumento(tipo: MovimientoDetalle['tipo']) {
  if (tipo === 'salida') return 'Remisión'
  if (tipo === 'entrada') return 'Comprobante de entrada'
  return 'Comprobante de ajuste de inventario'
}
