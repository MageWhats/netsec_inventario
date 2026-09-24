import { PageHeader } from '@/components/ui/PageHeader'

export function MovimientosPage() {
  return (
    <>
      <PageHeader title="Movimientos" description="Entradas, salidas y ajustes de inventario" />
      <div className="rounded-2xl border border-dashed border-brand-border p-10 text-center text-slate-500">
        Los movimientos llegarán en la Fase 4.
      </div>
    </>
  )
}
