import { PageHeader } from '@/components/ui/PageHeader'

export function ProductosPage() {
  return (
    <>
      <PageHeader title="Productos" description="Catálogo de productos de consumo y de redes y seguridad" />
      <div className="rounded-2xl border border-dashed border-brand-border p-10 text-center text-slate-500">
        El catálogo llegará en la Fase 3.
      </div>
    </>
  )
}
