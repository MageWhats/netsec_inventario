import { TriangleAlert } from 'lucide-react'

export function ConfigErrorPage({ errors }: { errors: string[] }) {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-lg rounded-2xl border border-red-500/30 bg-brand-card p-8 shadow-xl">
        <div className="mb-4 flex items-center gap-3 text-red-400">
          <TriangleAlert className="size-6" />
          <h1 className="text-xl font-bold">Configuración incompleta</h1>
        </div>
        <ul className="list-disc space-y-2 pl-5 text-sm text-slate-300">
          {errors.map((error) => (
            <li key={error}>{error}</li>
          ))}
        </ul>
        <p className="mt-6 text-sm text-slate-400">
          Revisa el archivo <code className="text-brand-cyan">.env.local</code> en la raíz del proyecto (sin comillas ni
          espacios) y <strong>reinicia</strong> <code className="text-brand-cyan">npm run dev</code>.
        </p>
      </div>
    </div>
  )
}
