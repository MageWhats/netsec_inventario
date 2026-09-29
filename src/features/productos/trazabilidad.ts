import { formatearNumero, tiposMovimiento, type TipoMovimiento } from '@/features/movimientos/tipos'

export interface ItemTrazable {
  id: string
  cantidad: number
  unidad_id: string | null
  movimiento: { id: string; numero: number; tipo: TipoMovimiento; fecha: string; created_at: string }
}

/** Movimiento del otro lado: la entrada de la que salió la mercancía, o la salida a la que fue */
export interface Vinculo {
  id: string
  numero: number
  tipo: TipoMovimiento
  cantidad: number
}

export interface Trazabilidad {
  /** Por id de movimiento: origen (si es salida) o destinos (si es entrada) */
  vinculos: Map<string, Vinculo[]>
  /** Por id de entrada: unidades de ese lote que siguen en stock */
  quedan: Map<string, number>
}

export const cronologico = (a: ItemTrazable, b: ItemTrazable) =>
  a.movimiento.fecha.localeCompare(b.movimiento.fecha) ||
  a.movimiento.created_at.localeCompare(b.movimiento.created_at) ||
  a.id.localeCompare(b.id)

/**
 * Relaciona las entradas y salidas del kardex de un producto:
 * - Con serial: la unidad sale de la última entrada en la que ingresó (exacto; cuenta reingresos).
 * - Por cantidad: PEPS (lo primero que entró es lo primero que sale). Una salida puede venir de varias entradas.
 */
export function trazarKardex(items: ItemTrazable[]): Trazabilidad {
  const vinculos = new Map<string, Map<string, Vinculo>>()
  const vincular = (desde: ItemTrazable['movimiento'], hacia: ItemTrazable['movimiento'], cantidad: number) => {
    const porMovimiento = vinculos.get(desde.id) ?? new Map<string, Vinculo>()
    const vinculo = porMovimiento.get(hacia.id) ?? { id: hacia.id, numero: hacia.numero, tipo: hacia.tipo, cantidad: 0 }
    vinculo.cantidad += cantidad
    porMovimiento.set(hacia.id, vinculo)
    vinculos.set(desde.id, porMovimiento)
  }

  // Entrada en la que está cada unidad serializada que sigue en stock
  const enStock = new Map<string, ItemTrazable['movimiento']>()
  // Lotes por cantidad con lo que aún queda de cada uno
  const cola: { movimiento: ItemTrazable['movimiento']; restante: number }[] = []

  for (const item of [...items].sort(cronologico)) {
    const m = item.movimiento
    if (tiposMovimiento[m.tipo].esEntrada) {
      if (item.unidad_id) enStock.set(item.unidad_id, m)
      else cola.push({ movimiento: m, restante: item.cantidad })
      continue
    }

    if (item.unidad_id) {
      const entrada = enStock.get(item.unidad_id)
      enStock.delete(item.unidad_id)
      if (entrada) {
        vincular(m, entrada, item.cantidad)
        vincular(entrada, m, item.cantidad)
      }
      continue
    }

    let pendiente = item.cantidad
    for (let lote = cola[0]; pendiente > 0 && lote; lote = cola[0]) {
      const tomado = Math.min(pendiente, lote.restante)
      vincular(m, lote.movimiento, tomado)
      vincular(lote.movimiento, m, tomado)
      lote.restante -= tomado
      pendiente -= tomado
      if (lote.restante === 0) cola.shift()
    }
  }

  const quedan = new Map<string, number>()
  for (const m of enStock.values()) quedan.set(m.id, (quedan.get(m.id) ?? 0) + 1)
  for (const lote of cola) quedan.set(lote.movimiento.id, (quedan.get(lote.movimiento.id) ?? 0) + lote.restante)

  return {
    vinculos: new Map([...vinculos].map(([id, porMovimiento]) => [id, [...porMovimiento.values()]])),
    quedan,
  }
}

/** "De NetE-000001 (2)" o "A NetS-000001 (2) · quedan 8"; vacío si no hay nada que decir */
export function describirTrazabilidad({ vinculos, quedan }: { vinculos: Vinculo[]; quedan: number | null }) {
  const lista = vinculos.map((v) => `${formatearNumero(v)} (${v.cantidad})`).join(', ')
  if (quedan === null) return lista && `De ${lista}`
  return [lista && `A ${lista}`, quedan > 0 && `quedan ${quedan}`].filter(Boolean).join(' · ')
}
