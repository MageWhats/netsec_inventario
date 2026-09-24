import { Loader2 } from 'lucide-react'

export function LoadingBlock() {
  return (
    <div className="flex justify-center p-10">
      <Loader2 className="size-6 animate-spin text-brand-accent" aria-label="Cargando" />
    </div>
  )
}
