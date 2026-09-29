import { Moon, Sun } from 'lucide-react'
import { cambiarTema, useTema } from '@/lib/tema'

/** Cambia entre el tema oscuro y el claro */
export function BotonTema({ conTexto = false, className = '' }: { conTexto?: boolean; className?: string }) {
  const tema = useTema()
  const siguiente = tema === 'oscuro' ? 'claro' : 'oscuro'
  const Icono = tema === 'oscuro' ? Sun : Moon
  const texto = tema === 'oscuro' ? 'Tema claro' : 'Tema oscuro'

  return (
    <button
      type="button"
      onClick={() => cambiarTema(siguiente)}
      className={`flex items-center gap-2 text-sm text-slate-400 transition hover:text-slate-200 ${className}`}
      title={`Cambiar a ${texto.toLowerCase()}`}
      aria-label={`Cambiar a ${texto.toLowerCase()}`}
    >
      <Icono className="size-4" />
      {conTexto && texto}
    </button>
  )
}
