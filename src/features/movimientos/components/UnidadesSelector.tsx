import { Search } from 'lucide-react'
import { useState, type KeyboardEvent } from 'react'
import { LoadingBlock } from '@/components/ui/LoadingBlock'
import { EstadoUnidadBadge } from '@/features/productos/components/badges'
import type { EstadoUnidad } from '@/features/productos/estados'
import { useUnidadesPorEstado } from '../api'

interface UnidadesSelectorProps {
  productoId: string
  estados: EstadoUnidad[]
  seleccionadas: string[]
  onChange: (ids: string[]) => void
  textoVacio: string
}

/** Lista de unidades existentes para marcar cuáles participan en el movimiento */
export function UnidadesSelector({ productoId, estados, seleccionadas, onChange, textoVacio }: UnidadesSelectorProps) {
  const { data: unidades = [], isLoading, error } = useUnidadesPorEstado(productoId, estados)
  const [busqueda, setBusqueda] = useState('')
  const [aviso, setAviso] = useState<string | null>(null)

  const termino = busqueda.trim().toLowerCase()
  const visibles = termino
    ? unidades.filter((u) => u.numero_serie.toLowerCase().includes(termino) || u.mac?.toLowerCase().includes(termino))
    : unidades
  const marcadas = new Set(seleccionadas)

  function alternar(id: string) {
    onChange(marcadas.has(id) ? seleccionadas.filter((x) => x !== id) : [...seleccionadas, id])
  }

  // Con lector de códigos: el serial escaneado + Enter marca la unidad exacta
  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key !== 'Enter') return
    e.preventDefault()
    const serial = busqueda.trim().toUpperCase()
    if (!serial) return
    const unidad = unidades.find((u) => u.numero_serie === serial)
    if (!unidad) {
      setAviso(`No hay ninguna unidad seleccionable con el serial ${serial}.`)
    } else if (marcadas.has(unidad.id)) {
      setAviso(`${serial} ya estaba seleccionada.`)
    } else {
      onChange([...seleccionadas, unidad.id])
      setAviso(null)
    }
    setBusqueda('')
  }

  if (isLoading) return <LoadingBlock />
  if (error) return <p className="text-sm text-red-400">No se pudieron cargar las unidades: {error.message}</p>
  if (unidades.length === 0) return <p className="text-sm text-slate-500">{textoVacio}</p>

  const todasVisiblesMarcadas = visibles.length > 0 && visibles.every((u) => marcadas.has(u.id))

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-48 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-500" />
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Escanea o busca el serial / MAC"
            className="input pl-9 font-mono"
          />
        </div>
        <button
          type="button"
          onClick={() => {
            const idsVisibles = new Set(visibles.map((u) => u.id))
            onChange(
              todasVisiblesMarcadas
                ? seleccionadas.filter((id) => !idsVisibles.has(id))
                : [...new Set([...seleccionadas, ...idsVisibles])],
            )
          }}
          className="text-xs text-brand-cyan hover:underline"
        >
          {todasVisiblesMarcadas ? 'Desmarcar' : 'Marcar'} {termino ? 'resultados' : 'todas'}
        </button>
        <span className="text-xs text-slate-400">
          {seleccionadas.length} de {unidades.length} seleccionadas
        </span>
      </div>

      {aviso && <p className="text-xs text-amber-400">{aviso}</p>}

      <ul className="max-h-56 divide-y divide-brand-border overflow-y-auto rounded-lg border border-brand-border">
        {visibles.map((u) => (
          <li key={u.id}>
            <label className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-white/[0.03]">
              <input
                type="checkbox"
                checked={marcadas.has(u.id)}
                onChange={() => alternar(u.id)}
                className="size-4 accent-brand-accent"
              />
              <span className="font-mono">{u.numero_serie}</span>
              {u.mac && <span className="font-mono text-xs text-slate-500">{u.mac}</span>}
              {estados.length > 1 && (
                <span className="ml-auto">
                  <EstadoUnidadBadge estado={u.estado} />
                </span>
              )}
            </label>
          </li>
        ))}
        {visibles.length === 0 && <li className="px-3 py-2 text-sm text-slate-500">Sin coincidencias.</li>}
      </ul>
    </div>
  )
}
