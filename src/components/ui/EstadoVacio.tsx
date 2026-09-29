import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

interface EstadoVacioProps {
  icono: LucideIcon
  titulo: string
  descripcion?: ReactNode
  /** Botón o enlace para dar el siguiente paso (p. ej. "Crear el primero") */
  accion?: ReactNode
  /** Versión más baja, para tarjetas pequeñas (dashboard) */
  compacto?: boolean
}

/** Qué mostrar cuando una lista no tiene nada: qué es, por qué está vacía y cómo empezar */
export function EstadoVacio({ icono: Icono, titulo, descripcion, accion, compacto }: EstadoVacioProps) {
  return (
    <div className={`flex flex-col items-center text-center ${compacto ? 'px-5 py-6' : 'px-6 py-14'}`}>
      <div className="relative mb-4">
        <div className="absolute inset-0 rounded-full bg-brand-cyan/20 blur-xl" aria-hidden />
        <div
          className={`relative flex items-center justify-center rounded-full border border-brand-cyan/25 bg-gradient-to-b from-brand-accent/20 to-brand-cyan/5 ${
            compacto ? 'size-11' : 'size-16'
          }`}
        >
          <Icono className={`text-brand-cyan ${compacto ? 'size-5' : 'size-7'}`} strokeWidth={1.75} />
        </div>
      </div>
      <p className={`font-display font-semibold text-slate-100 ${compacto ? 'text-sm' : 'text-base'}`}>{titulo}</p>
      {descripcion && (
        <p className={`mt-1 max-w-sm text-slate-400 ${compacto ? 'text-xs' : 'text-sm'}`}>{descripcion}</p>
      )}
      {accion && <div className="mt-5">{accion}</div>}
    </div>
  )
}
