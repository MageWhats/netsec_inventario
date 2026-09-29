import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { traerTodo } from '@/lib/paginar'
import type { TipoMovimiento } from '@/features/movimientos/tipos'
import type { LineaMovimiento } from './api'

/** Entrada (o ajuste +) de la que salió la mercancía de una línea de salida (venta o ajuste −) */
export interface Origen {
  movimientoId: string
  numero: number
  tipo: TipoMovimiento
  referencia: string | null
  proveedor: string | null
  cantidad: number
}

const TIPOS_ENTRADA: TipoMovimiento[] = ['entrada', 'ajuste_entrada']
/** Ids por consulta: .in() va en la URL y no puede crecer sin límite */
const LOTE_IDS = 150

const SELECT_ORIGEN = `
  id, cantidad, producto_id, unidad_id,
  movimiento:movimientos!inner(id, numero, tipo, fecha, created_at, referencia, proveedor:proveedores(nombre))
`

/**
 * Origen de cada línea que saca mercancía (venta o ajuste −), por id de línea; las entradas se ignoran:
 * - Con serial: la entrada en la que se registró esa unidad (exacto).
 * - Por cantidad: PEPS (lo primero que entró es lo primero que sale), recorriendo todo el kardex
 *   del producto hasta el final del período. Una línea puede salir de varias entradas.
 */
export function useOrigenLineas(todas: LineaMovimiento[], rango: { desde: string; hasta: string }, enabled: boolean) {
  const { hasta } = rango
  const lineas = todas.filter((l) => !TIPOS_ENTRADA.includes(l.movimiento.tipo))
  return useQuery({
    // Las líneas dependen del rango y del filtro de tipo; al registrar un movimiento cambia la cantidad
    queryKey: ['reportes', 'origen-lineas', rango.desde, hasta, lineas.length, lineas[0]?.id, lineas.at(-1)?.id],
    enabled: enabled && lineas.length > 0,
    queryFn: async () => {
      const origenes = new Map<string, Origen[]>()
      await Promise.all([origenSeriales(lineas, origenes), origenPeps(lineas, hasta, origenes)])
      return origenes
    },
  })
}

type ItemOrigen = Awaited<ReturnType<typeof traerItems>>[number]

function traerItems(columna: 'unidad_id' | 'producto_id', ids: string[], hasta?: string) {
  return traerTodo((desde, fin) => {
    let query = supabase.from('movimiento_items').select(SELECT_ORIGEN).in(columna, ids).order('id')
    if (hasta) query = query.lte('movimiento.fecha', new Date(`${hasta}T23:59:59.999`).toISOString())
    return query.range(desde, fin)
  }, 100_000).then((r) => r.filas)
}

async function enLotes(ids: string[], consulta: (lote: string[]) => Promise<ItemOrigen[]>) {
  const lotes = []
  for (let i = 0; i < ids.length; i += LOTE_IDS) lotes.push(ids.slice(i, i + LOTE_IDS))
  return (await Promise.all(lotes.map(consulta))).flat()
}

const cronologico = (a: ItemOrigen, b: ItemOrigen) =>
  a.movimiento.fecha.localeCompare(b.movimiento.fecha) ||
  a.movimiento.created_at.localeCompare(b.movimiento.created_at) ||
  a.id.localeCompare(b.id)

const aOrigen = (item: ItemOrigen, cantidad: number): Origen => ({
  movimientoId: item.movimiento.id,
  numero: item.movimiento.numero,
  tipo: item.movimiento.tipo,
  referencia: item.movimiento.referencia,
  proveedor: item.movimiento.proveedor?.nombre ?? null,
  cantidad,
})

async function origenSeriales(lineas: LineaMovimiento[], origenes: Map<string, Origen[]>) {
  const conSerial = lineas.filter((l) => l.unidad)
  if (conSerial.length === 0) return
  const cantidadPorLinea = new Map(conSerial.map((l) => [l.id, l.cantidad]))

  const items = await enLotes([...new Set(conSerial.map((l) => l.unidad!.id))], (lote) => traerItems('unidad_id', lote))
  // Cada unidad sale de la última entrada en la que ingresó antes de la salida (cuenta reingresos, como el kardex)
  const ultimaEntrada = new Map<string, ItemOrigen>()
  for (const item of items.sort(cronologico)) {
    if (!item.unidad_id) continue
    if (TIPOS_ENTRADA.includes(item.movimiento.tipo)) {
      ultimaEntrada.set(item.unidad_id, item)
      continue
    }
    const entrada = ultimaEntrada.get(item.unidad_id)
    const cantidad = cantidadPorLinea.get(item.id)
    if (entrada && cantidad !== undefined) origenes.set(item.id, [aOrigen(entrada, cantidad)])
  }
}

async function origenPeps(lineas: LineaMovimiento[], hasta: string, origenes: Map<string, Origen[]>) {
  const porCantidad = new Set(lineas.filter((l) => !l.producto.es_serializado).map((l) => l.id))
  if (porCantidad.size === 0) return

  const productos = [...new Set(lineas.filter((l) => porCantidad.has(l.id)).map((l) => l.producto.id))]
  const items = await enLotes(productos, (lote) => traerItems('producto_id', lote, hasta))

  const porProducto = new Map<string, ItemOrigen[]>()
  for (const item of items) porProducto.set(item.producto_id, [...(porProducto.get(item.producto_id) ?? []), item])

  for (const kardex of porProducto.values()) {
    // Cola de lotes de entrada con lo que aún queda de cada uno
    const cola: { item: ItemOrigen; restante: number }[] = []
    for (const item of kardex.sort(cronologico)) {
      if (TIPOS_ENTRADA.includes(item.movimiento.tipo)) {
        cola.push({ item, restante: item.cantidad })
        continue
      }
      // Toda salida (venta o ajuste −) consume los lotes más antiguos
      let pendiente = item.cantidad
      const consumidos: Origen[] = []
      for (let lote = cola[0]; pendiente > 0 && lote; lote = cola[0]) {
        const tomado = Math.min(pendiente, lote.restante)
        consumidos.push(aOrigen(lote.item, tomado))
        lote.restante -= tomado
        pendiente -= tomado
        if (lote.restante === 0) cola.shift()
      }
      if (porCantidad.has(item.id)) origenes.set(item.id, consumidos)
    }
  }
}
