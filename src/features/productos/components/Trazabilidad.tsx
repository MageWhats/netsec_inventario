import { Link } from 'react-router-dom'
import { formatearNumero } from '@/features/movimientos/tipos'
import { describirTrazabilidad, type Vinculo } from '../trazabilidad'

const MAX_VINCULOS = 2

interface TrazabilidadProps {
  vinculos: Vinculo[]
  /** null en salidas; en entradas, lo que queda del lote */
  quedan: number | null
  /** Todos los vínculos y etiquetas largas (detalle del movimiento); si no, compacto para tablas */
  detallado?: boolean
}

/** Salida: entradas de las que vino la mercancía. Entrada: salidas a las que fue y lo que queda del lote */
export function Trazabilidad({ vinculos, quedan, detallado = false }: TrazabilidadProps) {
  if (vinculos.length === 0 && !quedan) return detallado ? null : <span className="text-slate-600">—</span>

  const etiqueta = quedan === null ? (detallado ? 'Viene de' : 'De') : detallado ? 'Salió en' : 'A'
  const visibles = detallado ? vinculos : vinculos.slice(0, MAX_VINCULOS)
  const ocultos = vinculos.length - visibles.length
  return (
    <div
      className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs"
      title={describirTrazabilidad({ vinculos, quedan }) || undefined}
    >
      {vinculos.length > 0 && <span className="text-slate-500">{etiqueta}</span>}
      {visibles.map((v) => (
        <span key={v.id} className="whitespace-nowrap">
          <Link to={`/movimientos/${v.id}`} className="font-mono text-slate-300 hover:text-brand-cyan">
            {formatearNumero(v)}
          </Link>
          <span className="ml-1 text-slate-500">×{v.cantidad}</span>
        </span>
      ))}
      {ocultos > 0 && <span className="text-slate-500">+{ocultos} más</span>}
      {!!quedan && (
        <span className="rounded bg-slate-500/15 px-1.5 py-0.5 whitespace-nowrap text-slate-400">quedan {quedan}</span>
      )}
    </div>
  )
}
