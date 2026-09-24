import { PackageSearch } from 'lucide-react'

export function DashboardPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-brand-bg">
      <div className="rounded-2xl border border-brand-border bg-brand-card p-8 text-center shadow-xl">
        <PackageSearch className="mx-auto mb-4 size-12 text-brand-accent" />
        <h1 className="bg-gradient-to-r from-brand-accent to-brand-cyan bg-clip-text text-3xl font-bold text-transparent">
          Net&amp;Sec Suministros
        </h1>
        <p className="mt-2 text-slate-400">Fase 0 lista: React + TypeScript + Tailwind v4.</p>
      </div>
    </div>
  )
}
