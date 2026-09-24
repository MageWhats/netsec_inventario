import { PageHeader } from '@/components/ui/PageHeader'

export function DashboardPage() {
  return (
    <>
      <PageHeader title="Dashboard" description="Resumen del inventario" />
      <div className="rounded-2xl border border-dashed border-brand-border p-10 text-center text-slate-500">
        Los KPIs y gráficas llegarán en la Fase 5.
      </div>
    </>
  )
}
