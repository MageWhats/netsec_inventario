import type { ReactNode } from 'react'

interface FormFieldProps {
  label: string
  error?: string
  hint?: string
  className?: string
  children: ReactNode
}

export function FormField({ label, error, hint, className, children }: FormFieldProps) {
  return (
    <label className={`block ${className ?? ''}`}>
      <span className="mb-1 block text-sm text-slate-300">{label}</span>
      {children}
      {error ? (
        <span className="mt-1 block text-xs text-red-400">{error}</span>
      ) : (
        hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>
      )}
    </label>
  )
}
