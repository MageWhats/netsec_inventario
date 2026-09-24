import type { ReactNode } from 'react'

/** Par etiqueta / valor para usar dentro de un <dl>. Si no hay valor muestra un guion. */
export function Dato({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={className}>
      <dt className="text-slate-400">{label}</dt>
      <dd className="mt-0.5 break-words text-slate-200">{children || <span className="text-slate-600">—</span>}</dd>
    </div>
  )
}
