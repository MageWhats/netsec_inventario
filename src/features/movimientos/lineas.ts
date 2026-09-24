import type { Producto } from '@/features/productos/api'
import type { EstadoUnidad } from '@/features/productos/estados'
import type { Json } from '@/types/database'
import { tiposMovimiento, type TipoMovimiento } from './tipos'

export interface SerieNueva {
  numero_serie: string
  mac: string
}

/** Una línea del formulario: un producto con su cantidad o sus seriales */
export interface Linea {
  key: string
  producto: Producto
  /** Productos por cantidad (NaN si el campo está vacío) */
  cantidad: number
  /** Serializados: seriales nuevos (entradas y ajustes +) */
  series: SerieNueva[]
  /** Serializados: unidades existentes (salidas, ajustes −, reingresos) */
  unidadIds: string[]
  /** Serializados en ajuste −: a qué estado pasan las unidades */
  estadoDestino: EstadoUnidad
  /** Costo unitario (entradas y ajustes) o precio de venta (salidas) */
  valorUnitario: number
}

export const ESTADOS_AJUSTE_SALIDA: EstadoUnidad[] = ['danada', 'en_garantia', 'baja']
export const ESTADOS_REINGRESO: EstadoUnidad[] = ['vendida', 'en_garantia', 'danada', 'baja']

export const usaPrecioVenta = (tipo: TipoMovimiento) => tipo === 'salida'

export function nuevaLinea(producto: Producto, tipo: TipoMovimiento): Linea {
  return {
    key: crypto.randomUUID(),
    producto,
    cantidad: 1,
    series: [],
    unidadIds: [],
    estadoDestino: 'danada',
    valorUnitario: usaPrecioVenta(tipo) ? producto.precio_venta : producto.precio_costo,
  }
}

export function unidadesLinea(linea: Linea): number {
  if (linea.producto.es_serializado) return linea.series.length + linea.unidadIds.length
  return Number.isFinite(linea.cantidad) ? linea.cantidad : 0
}

export const subtotalLinea = (linea: Linea) =>
  unidadesLinea(linea) * (Number.isFinite(linea.valorUnitario) ? linea.valorUnitario : 0)

const REGEX_MAC = /^([0-9A-F]{2}:){5}[0-9A-F]{2}$/

export const normalizarSerial = (valor: string) => valor.trim().toUpperCase()
export const normalizarMac = (valor: string) => valor.trim().toUpperCase().replaceAll('-', ':')
export const macValida = (mac: string) => mac === '' || REGEX_MAC.test(normalizarMac(mac))

/**
 * Convierte texto pegado (un serial por línea, opcionalmente "SERIAL,MAC" o separado por tabulador
 * o punto y coma, como sale de Excel) en seriales.
 */
export function parsearSeriales(texto: string): SerieNueva[] {
  return texto
    .split(/\r?\n/)
    .map((fila) => fila.split(/[,;\t]/).map((c) => c.trim()))
    .filter(([serial]) => serial)
    .map(([serial = '', mac = '']) => ({ numero_serie: normalizarSerial(serial), mac: normalizarMac(mac) }))
}

/** Errores por línea (clave de la línea → mensaje). Vacío si todo es válido. */
export function validarLineas(tipo: TipoMovimiento, lineas: Linea[]): Map<string, string> {
  const errores = new Map<string, string>()
  const esEntrada = tiposMovimiento[tipo].esEntrada

  for (const l of lineas) {
    const nombre = l.producto.nombre
    if (!Number.isFinite(l.valorUnitario) || l.valorUnitario < 0) {
      errores.set(l.key, 'El valor unitario no es válido.')
    } else if (l.producto.es_serializado) {
      if (unidadesLinea(l) === 0) {
        errores.set(l.key, esEntrada ? 'Agrega al menos un serial.' : 'Selecciona al menos una unidad.')
      } else if (l.series.some((s) => !macValida(s.mac))) {
        errores.set(l.key, 'Hay una MAC con formato inválido (use AA:BB:CC:DD:EE:FF).')
      }
    } else if (!Number.isInteger(l.cantidad) || l.cantidad <= 0) {
      errores.set(l.key, 'La cantidad debe ser un número entero mayor que cero.')
    } else if (!esEntrada && l.cantidad > l.producto.stock) {
      errores.set(l.key, `Stock insuficiente de ${nombre}: hay ${l.producto.stock}.`)
    }
  }
  return errores
}

/** Arma el arreglo p_items que espera registrar_movimiento() */
export function construirItems(tipo: TipoMovimiento, lineas: Linea[]): Json {
  const campoValor = usaPrecioVenta(tipo) ? 'precio_unitario' : 'costo_unitario'
  return lineas.map((l) => ({
    producto_id: l.producto.id,
    [campoValor]: l.valorUnitario,
    ...(l.producto.es_serializado
      ? {
          series: l.series.map((s) => ({ numero_serie: s.numero_serie, mac: s.mac || null })),
          unidad_ids: l.unidadIds,
          ...(tipo === 'ajuste_salida' && { estado_destino: l.estadoDestino }),
        }
      : { cantidad: l.cantidad }),
  }))
}

/** Fecha y hora local actual en el formato de <input type="datetime-local"> */
export function ahoraLocal(): string {
  const d = new Date()
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().slice(0, 16)
}
