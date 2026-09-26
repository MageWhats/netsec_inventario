import { Loader2, Search, X } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { LoadingBlock } from '@/components/ui/LoadingBlock'
import { PageHeader } from '@/components/ui/PageHeader'
import { usePermisos } from '@/features/auth/permisos'
import { useDebounce } from '@/lib/useDebounce'
import { useMovimientos } from './api'
import { MovimientosTabla } from './components/MovimientosTabla'
import { TIPOS_MOVIMIENTO, tiposMovimiento, type TipoMovimiento } from './tipos'

const TAMANO_PAGINA = 50

export function MovimientosPage() {
  const [tipo, setTipo] = useState<TipoMovimiento | ''>('')
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  const [busqueda, setBusqueda] = useState('')
  const [limite, setLimite] = useState(TAMANO_PAGINA)
  const { esAdmin, puedeOperar } = usePermisos()
  // Entradas y salidas: admin y bodega. Ajustes: solo admin
  const tiposPermitidos = TIPOS_MOVIMIENTO.filter((t) => (t === 'entrada' || t === 'salida' ? puedeOperar : esAdmin))

  const busquedaDebounced = useDebounce(busqueda)
  const { data, isLoading, isFetching, error } = useMovimientos({
    tipo,
    desde,
    hasta,
    busqueda: busquedaDebounced,
    limite,
  })

  const hayFiltros = Boolean(tipo || desde || hasta || busqueda)
  const movimientos = data?.movimientos ?? []
  const total = data?.total ?? 0

  function limpiarFiltros() {
    setTipo('')
    setDesde('')
    setHasta('')
    setBusqueda('')
    setLimite(TAMANO_PAGINA)
  }

  return (
    <>
      <PageHeader
        title="Movimientos"
        description="Entradas, salidas y ajustes de inventario"
        actions={
          tiposPermitidos.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {tiposPermitidos.map((t) => {
                const { label, icono: Icono } = tiposMovimiento[t]
                return (
                  <Link
                    key={t}
                    to={`/movimientos/nuevo/${t}`}
                    className={`btn ${t === 'entrada' || t === 'salida' ? 'btn-primary' : 'btn-secondary'}`}
                    title={tiposMovimiento[t].descripcion}
                  >
                    <Icono className="size-4" />
                    {label}
                  </Link>
                )
              })}
            </div>
          )
        }
      />

      <div className="mb-4 grid gap-3 md:grid-cols-[1fr_auto_auto_auto_auto] md:items-end">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-500" />
          <input
            type="search"
            value={busqueda}
            onChange={(e) => {
              setBusqueda(e.target.value)
              setLimite(TAMANO_PAGINA)
            }}
            placeholder="Buscar por número, referencia, cliente, proveedor o motivo…"
            className="input pl-9"
          />
        </div>
        <select
          value={tipo}
          onChange={(e) => {
            setTipo(e.target.value as TipoMovimiento | '')
            setLimite(TAMANO_PAGINA)
          }}
          className="input md:w-40"
          aria-label="Tipo de movimiento"
        >
          <option value="">Todos los tipos</option>
          {TIPOS_MOVIMIENTO.map((t) => (
            <option key={t} value={t}>
              {tiposMovimiento[t].label}
            </option>
          ))}
        </select>
        <label className="text-xs text-slate-400">
          Desde
          <input
            type="date"
            value={desde}
            max={hasta || undefined}
            onChange={(e) => setDesde(e.target.value)}
            className="input mt-1 md:w-40"
          />
        </label>
        <label className="text-xs text-slate-400">
          Hasta
          <input
            type="date"
            value={hasta}
            min={desde || undefined}
            onChange={(e) => setHasta(e.target.value)}
            className="input mt-1 md:w-40"
          />
        </label>
        <button
          onClick={limpiarFiltros}
          disabled={!hayFiltros}
          className="btn btn-secondary h-10.5"
          title="Limpiar filtros"
        >
          <X className="size-4" />
          <span className="md:sr-only">Limpiar filtros</span>
        </button>
      </div>

      <div className="overflow-hidden rounded-2xl border border-brand-border bg-brand-card">
        {isLoading ? (
          <LoadingBlock />
        ) : error ? (
          <p className="p-6 text-sm text-red-400">No se pudieron cargar los movimientos: {error.message}</p>
        ) : movimientos.length === 0 ? (
          <p className="p-10 text-center text-sm text-slate-500">
            {hayFiltros
              ? 'Ningún movimiento coincide con los filtros.'
              : 'Aún no hay movimientos. Empieza registrando una entrada de mercancía.'}
          </p>
        ) : (
          <MovimientosTabla movimientos={movimientos} />
        )}
      </div>

      {movimientos.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500">
          <span>
            Mostrando {movimientos.length} de {total} movimientos
          </span>
          {movimientos.length < total && (
            <button
              onClick={() => setLimite((l) => l + TAMANO_PAGINA)}
              disabled={isFetching}
              className="btn btn-secondary"
            >
              {isFetching && <Loader2 className="size-4 animate-spin" />}
              Cargar más
            </button>
          )}
        </div>
      )}
    </>
  )
}
