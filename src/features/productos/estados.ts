import type { Enums } from '@/types/database'

export type EstadoUnidad = Enums<'estado_unidad'>

export const estadosUnidad: Record<EstadoUnidad, { label: string; clase: string }> = {
  disponible: { label: 'Disponible', clase: 'bg-emerald-500/15 text-emerald-400' },
  vendida: { label: 'Vendida', clase: 'bg-slate-500/15 text-slate-300' },
  en_garantia: { label: 'En garantía', clase: 'bg-amber-500/15 text-amber-400' },
  danada: { label: 'Dañada', clase: 'bg-red-500/15 text-red-400' },
  baja: { label: 'De baja', clase: 'bg-slate-500/15 text-slate-500' },
}

export const ESTADOS_UNIDAD = Object.keys(estadosUnidad) as EstadoUnidad[]
