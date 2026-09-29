import { ArrowDownToLine, ArrowUpFromLine, PackageMinus, PackagePlus, type LucideIcon } from 'lucide-react'
import type { Enums } from '@/types/database'

export type TipoMovimiento = Enums<'tipo_movimiento'>

interface InfoTipo {
  label: string
  descripcion: string
  /** Suma (true) o resta (false) stock */
  esEntrada: boolean
  icono: LucideIcon
  clase: string
}

export const tiposMovimiento: Record<TipoMovimiento, InfoTipo> = {
  entrada: {
    label: 'Entrada',
    descripcion: 'Compra o recepción de mercancía de un proveedor',
    esEntrada: true,
    icono: ArrowDownToLine,
    clase: 'bg-emerald-500/15 text-emerald-400',
  },
  salida: {
    label: 'Salida',
    descripcion: 'Venta o despacho a un cliente',
    esEntrada: false,
    icono: ArrowUpFromLine,
    clase: 'bg-blue-500/15 text-blue-400',
  },
  ajuste_entrada: {
    label: 'Ajuste +',
    descripcion: 'Corrección que suma stock: sobrante, devolución, regreso de garantía',
    esEntrada: true,
    icono: PackagePlus,
    clase: 'bg-amber-500/15 text-amber-400',
  },
  ajuste_salida: {
    label: 'Ajuste −',
    descripcion: 'Corrección que resta stock: faltante, daño, baja, envío a garantía',
    esEntrada: false,
    icono: PackageMinus,
    clase: 'bg-red-500/15 text-red-400',
  },
}

export const TIPOS_MOVIMIENTO = Object.keys(tiposMovimiento) as TipoMovimiento[]

export const esTipoMovimiento = (valor: string | undefined): valor is TipoMovimiento =>
  valor !== undefined && valor in tiposMovimiento

export const esAjuste = (tipo: TipoMovimiento) => tipo === 'ajuste_entrada' || tipo === 'ajuste_salida'

// ---------------------------------------------------------------------
// Motivos de ajuste (lista cerrada; la base de datos valida la dirección)
// ---------------------------------------------------------------------

export type MotivoAjuste = Enums<'motivo_ajuste'>

/** entrada: true = ajuste +, false = ajuste −, null = ambos */
export const motivosAjuste: Record<MotivoAjuste, { label: string; entrada: boolean | null }> = {
  inventario_inicial: { label: 'Inventario inicial', entrada: true },
  sobrante_conteo: { label: 'Sobrante en conteo físico', entrada: true },
  devolucion_cliente: { label: 'Devolución de cliente', entrada: true },
  regreso_garantia: { label: 'Regreso de garantía', entrada: true },
  faltante_conteo: { label: 'Faltante en conteo físico', entrada: false },
  producto_danado: { label: 'Producto dañado', entrada: false },
  envio_garantia: { label: 'Envío a garantía', entrada: false },
  uso_interno: { label: 'Uso interno', entrada: false },
  obsequio: { label: 'Obsequio / muestra', entrada: false },
  perdida: { label: 'Pérdida o robo', entrada: false },
  otro: { label: 'Otro', entrada: null },
}

export const motivosPara = (tipo: TipoMovimiento) =>
  (Object.keys(motivosAjuste) as MotivoAjuste[]).filter((m) => {
    const { entrada } = motivosAjuste[m]
    return entrada === null || entrada === (tipo === 'ajuste_entrada')
  })

/** "Producto dañado", "Producto dañado: se cayó de la vitrina" o, sin motivo (movimientos antiguos), las notas */
export function describirMotivo(m: { motivo?: MotivoAjuste | null; notas: string | null }): string | null {
  if (!m.motivo) return m.notas
  if (m.motivo === 'otro') return m.notas ?? motivosAjuste.otro.label
  const label = motivosAjuste[m.motivo].label
  const notas = m.notas?.trim()
  return notas && notas.toLowerCase() !== label.toLowerCase() ? `${label}: ${notas}` : label
}

/** Cada serie lleva su propio consecutivo: E (entradas), S (salidas) y A (ajustes + y −) */
export const serieMovimiento = (tipo: TipoMovimiento) => (tipo === 'entrada' ? 'E' : tipo === 'salida' ? 'S' : 'A')

/** Prefijo + consecutivo de su serie: NetE-000001, NetS-000001, NetA-000001 */
export const formatearNumero = ({ tipo, numero }: { tipo: TipoMovimiento; numero: number }) =>
  `Net${serieMovimiento(tipo)}-${String(numero).padStart(6, '0')}`

/**
 * Número de movimiento escrito por el usuario: "12" (cualquier serie) o con prefijo, "NetE-000012", "s12" o "#A-3",
 * para una sola serie. tipos vacío = cualquier serie. null si el texto no es un número de movimiento.
 */
export function parsearNumeroMovimiento(texto: string): { numero: number; tipos: TipoMovimiento[] } | null {
  const consecutivo = /^#?(?:net)?([esa])?-?(\d+)$/i.exec(texto.trim())
  const numero = Number(consecutivo?.[2])
  if (!consecutivo || !(numero > 0)) return null
  const serie = consecutivo[1]?.toUpperCase()
  return { numero, tipos: serie ? TIPOS_MOVIMIENTO.filter((t) => serieMovimiento(t) === serie) : [] }
}
