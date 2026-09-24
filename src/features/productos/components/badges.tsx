import { Barcode, Hash } from 'lucide-react'
import { estadosUnidad, type EstadoUnidad } from '../estados'

export function TipoControlBadge({ serializado }: { serializado: boolean }) {
  return serializado ? (
    <span className="inline-flex items-center gap-1 rounded-full bg-brand-cyan/10 px-2 py-0.5 text-xs text-brand-cyan">
      <Barcode className="size-3" />
      Serial
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full bg-slate-500/15 px-2 py-0.5 text-xs text-slate-300">
      <Hash className="size-3" />
      Cantidad
    </span>
  )
}

export function StockBadge({ stock, minimo }: { stock: number; minimo: number }) {
  const color =
    stock <= 0 ? 'bg-red-500/15 text-red-400' : stock <= minimo ? 'bg-amber-500/15 text-amber-400' : 'text-slate-200'
  const titulo = stock <= 0 ? 'Sin stock' : stock <= minimo ? `En o por debajo del mínimo (${minimo})` : undefined
  return (
    <span className={`inline-block min-w-8 rounded-full px-2 py-0.5 text-center font-medium ${color}`} title={titulo}>
      {stock}
    </span>
  )
}

export function EstadoUnidadBadge({ estado }: { estado: EstadoUnidad }) {
  const { label, clase } = estadosUnidad[estado]
  return <span className={`inline-block rounded-full px-2 py-0.5 text-xs ${clase}`}>{label}</span>
}
