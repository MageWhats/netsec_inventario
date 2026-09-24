import type { EstadoToma, TomaProducto, TomaSerial } from './api'

export const estadosToma: Record<EstadoToma, { label: string; clase: string }> = {
  en_curso: { label: 'En curso', clase: 'bg-blue-500/15 text-blue-400' },
  finalizada: { label: 'Finalizada', clase: 'bg-emerald-500/15 text-emerald-400' },
  cancelada: { label: 'Cancelada', clase: 'bg-slate-500/15 text-slate-400' },
}

export interface FilaToma {
  producto: TomaProducto['producto']
  /** Stock del sistema: el actual mientras la toma está abierta; el del inicio cuando ya se cerró */
  sistema: number
  /** null = aún no se ha contado (no se ajustará) */
  contado: number | null
  seriales: TomaSerial[]
  /** Unidades que se sumarán con el ajuste + */
  sobrantes: number
  /** Unidades que se restarán con el ajuste − */
  faltantes: number
}

/**
 * Replica la lógica de finalizar_toma() para mostrar de antemano qué ajustes se generarán.
 * Con serial: sobra cada unidad encontrada que el sistema no tenía disponible (vendida, de baja...)
 * y falta cada unidad disponible que no se escaneó.
 */
export function calcularFilas(
  productos: TomaProducto[],
  seriales: TomaSerial[],
  stockActual: Map<string, number>,
  enCurso: boolean,
): FilaToma[] {
  const serialesPorProducto = new Map<string, TomaSerial[]>()
  for (const s of seriales) serialesPorProducto.set(s.producto_id, [...(serialesPorProducto.get(s.producto_id) ?? []), s])

  return productos.map((tp) => {
    const sistema = enCurso ? (stockActual.get(tp.producto_id) ?? 0) : tp.stock_inicial
    const propios = serialesPorProducto.get(tp.producto_id) ?? []
    const fila: FilaToma = { producto: tp.producto, sistema, contado: tp.contado, seriales: propios, sobrantes: 0, faltantes: 0 }
    if (tp.contado === null) return fila

    if (tp.producto.es_serializado && enCurso) {
      const encontradosDisponibles = propios.filter((s) => s.unidad.estado === 'disponible').length
      fila.sobrantes = propios.length - encontradosDisponibles
      fila.faltantes = Math.max(sistema - encontradosDisponibles, 0)
    } else {
      const diferencia = tp.contado - sistema
      fila.sobrantes = Math.max(diferencia, 0)
      fila.faltantes = Math.max(-diferencia, 0)
    }
    return fila
  })
}

export function resumir(filas: FilaToma[]) {
  const suma = (f: (fila: FilaToma) => number) => filas.reduce((total, fila) => total + f(fila), 0)
  return {
    total: filas.length,
    contados: filas.filter((f) => f.contado !== null).length,
    productosConSobrante: filas.filter((f) => f.sobrantes > 0).length,
    productosConFaltante: filas.filter((f) => f.faltantes > 0).length,
    sobrantes: suma((f) => f.sobrantes),
    faltantes: suma((f) => f.faltantes),
    valorSobrantes: suma((f) => f.sobrantes * f.producto.precio_costo),
    valorFaltantes: suma((f) => f.faltantes * f.producto.precio_costo),
  }
}
