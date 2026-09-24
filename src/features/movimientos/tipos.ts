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

export const formatearNumero = (numero: number) => `#${String(numero).padStart(6, '0')}`
