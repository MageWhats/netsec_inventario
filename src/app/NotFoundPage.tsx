import { Link } from 'react-router-dom'

export function NotFoundPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4">
      <h1 className="text-5xl font-bold text-brand-accent">404</h1>
      <p className="text-slate-400">La página que buscas no existe.</p>
      <Link to="/" className="text-brand-cyan hover:underline">
        Volver al inicio
      </Link>
    </div>
  )
}
