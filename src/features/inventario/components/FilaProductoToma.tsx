import { Check, ChevronDown, Loader2, Minus, Plus, X } from 'lucide-react'
import { useState, type KeyboardEvent } from 'react'
import { Link } from 'react-router-dom'
import { mensajeError } from '@/lib/errores'
import { useUnidades } from '@/features/productos/api'
import { EstadoUnidadBadge } from '@/features/productos/components/badges'
import { useContarProducto, useQuitarSerial, useSumarConteo } from '../api'
import type { FilaToma } from '../diferencias'

interface FilaProductoTomaProps {
  fila: FilaToma
  tomaId: string
  enCurso: boolean
  /** Toma abierta y usuario que puede contar (admin o bodega) */
  editable: boolean
}

export function FilaProductoToma({ fila, tomaId, enCurso, editable }: FilaProductoTomaProps) {
  const { producto } = fila
  const [abierta, setAbierta] = useState(false)

  return (
    <li className="px-4 py-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1 basis-48">
          <Link to={`/productos/${producto.id}`} className="block truncate font-medium hover:text-brand-cyan">
            {producto.nombre}
          </Link>
          <p className="text-xs text-slate-500">
            <span className="font-mono">{producto.sku}</span>
            {producto.categoria && ` · ${producto.categoria.nombre}`}
            {!producto.activo && <span className="text-amber-400"> · inactivo, no se ajustará</span>}
          </p>
        </div>

        <div className="w-16 text-right text-sm">
          <p className="text-xs text-slate-500">{enCurso ? 'Sistema' : 'Al iniciar'}</p>
          <p className="text-slate-300 tabular-nums">{fila.sistema}</p>
        </div>

        <div className="w-40">
          {producto.es_serializado ? (
            <ConteoSerializado fila={fila} tomaId={tomaId} editable={editable} abierta={abierta} onAlternar={() => setAbierta((v) => !v)} />
          ) : editable ? (
            <ConteoCantidad fila={fila} tomaId={tomaId} />
          ) : (
            <p className="text-right text-sm tabular-nums">{fila.contado ?? '—'}</p>
          )}
        </div>

        <div className="w-24 text-right">
          <Diferencia fila={fila} />
        </div>
      </div>

      {abierta && <DetalleSeriales fila={fila} tomaId={tomaId} enCurso={enCurso} editable={editable} />}
    </li>
  )
}

function Diferencia({ fila }: { fila: FilaToma }) {
  if (fila.contado === null) return <span className="text-xs text-slate-500">Sin contar</span>
  if (fila.sobrantes === 0 && fila.faltantes === 0) {
    return (
      <span className="inline-flex items-center gap-1 text-sm text-emerald-400">
        <Check className="size-4" />
        Cuadra
      </span>
    )
  }
  return (
    <div className="text-sm font-medium tabular-nums">
      {fila.sobrantes > 0 && <p className="text-emerald-400">+{fila.sobrantes} sobra</p>}
      {fila.faltantes > 0 && <p className="text-red-400">−{fila.faltantes} falta</p>}
    </div>
  )
}

// ---------------------------------------------------------------------
// Productos por cantidad: se escribe el total o se ajusta con −/+
// ---------------------------------------------------------------------

function ConteoCantidad({ fila, tomaId }: { fila: FilaToma; tomaId: string }) {
  const contar = useContarProducto(tomaId)
  const sumar = useSumarConteo(tomaId)
  const [editando, setEditando] = useState<string | null>(null)
  const error = contar.error ?? sumar.error
  const guardando = contar.isPending || sumar.isPending

  function guardar() {
    if (editando === null) return
    const texto = editando.trim()
    const valor = texto === '' ? null : Number(texto)
    setEditando(null)
    if (valor !== null && (!Number.isInteger(valor) || valor < 0)) return
    if (valor !== fila.contado) contar.mutate({ productoId: fila.producto.id, contado: valor })
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') e.currentTarget.blur()
    if (e.key === 'Escape') setEditando(null)
  }

  return (
    <div>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => sumar.mutate({ productoId: fila.producto.id, cantidad: -1 })}
          disabled={guardando || !fila.contado}
          className="btn btn-secondary size-9 shrink-0 p-0"
          aria-label="Restar uno"
        >
          <Minus className="size-4" />
        </button>
        <input
          type="number"
          inputMode="numeric"
          min={0}
          value={editando ?? fila.contado ?? ''}
          onChange={(e) => setEditando(e.target.value)}
          onFocus={(e) => e.target.select()}
          onBlur={guardar}
          onKeyDown={onKeyDown}
          placeholder="—"
          className="input h-9 px-1 text-center tabular-nums"
          aria-label={`Cantidad contada de ${fila.producto.nombre}`}
        />
        <button
          type="button"
          onClick={() => sumar.mutate({ productoId: fila.producto.id, cantidad: 1 })}
          disabled={guardando}
          className="btn btn-secondary size-9 shrink-0 p-0"
          aria-label="Sumar uno"
        >
          {guardando ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
        </button>
      </div>
      {error && <p className="mt-1 text-xs text-red-400">{mensajeError(error)}</p>}
    </div>
  )
}

// ---------------------------------------------------------------------
// Productos con serial: se cuentan escaneando cada unidad
// ---------------------------------------------------------------------

interface ConteoSerializadoProps {
  fila: FilaToma
  tomaId: string
  editable: boolean
  abierta: boolean
  onAlternar: () => void
}

function ConteoSerializado({ fila, tomaId, editable, abierta, onAlternar }: ConteoSerializadoProps) {
  const contar = useContarProducto(tomaId)
  const sinSeriales = fila.seriales.length === 0

  return (
    <div className="flex items-center justify-end gap-2">
      {editable && sinSeriales && fila.contado === null && (
        <button
          type="button"
          onClick={() => contar.mutate({ productoId: fila.producto.id, contado: 0 })}
          disabled={contar.isPending}
          className="text-xs text-brand-cyan hover:underline"
          title="No se encontró ninguna unidad"
        >
          Marcar 0
        </button>
      )}
      {editable && sinSeriales && fila.contado === 0 && (
        <button
          type="button"
          onClick={() => contar.mutate({ productoId: fila.producto.id, contado: null })}
          disabled={contar.isPending}
          className="text-xs text-slate-400 hover:underline"
        >
          Desmarcar
        </button>
      )}
      <button
        type="button"
        onClick={onAlternar}
        className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-sm hover:bg-white/5"
        aria-expanded={abierta}
      >
        <span className="tabular-nums">{fila.contado ?? '—'}</span>
        <span className="text-xs text-slate-500">seriales</span>
        <ChevronDown className={`size-4 text-slate-500 transition ${abierta ? 'rotate-180' : ''}`} />
      </button>
    </div>
  )
}

function DetalleSeriales({ fila, tomaId, enCurso, editable }: FilaProductoTomaProps) {
  const quitar = useQuitarSerial(tomaId)
  // Solo mientras la toma está abierta tiene sentido listar las disponibles no encontradas
  const { data: unidades = [], isLoading } = useUnidades(fila.producto.id, enCurso)
  const escaneadas = new Set(fila.seriales.map((s) => s.unidad.id))
  const noEncontradas = unidades.filter((u) => u.estado === 'disponible' && !escaneadas.has(u.id))

  return (
    <div className="mt-3 grid gap-4 rounded-lg border border-brand-border p-3 text-sm sm:grid-cols-2">
      <div>
        <p className="mb-2 text-xs tracking-wide text-slate-400 uppercase">Encontradas ({fila.seriales.length})</p>
        {fila.seriales.length === 0 ? (
          <p className="text-xs text-slate-500">Escanea los seriales con el botón de la cámara.</p>
        ) : (
          <ul className="space-y-1">
            {fila.seriales.map((s) => (
              <li key={s.unidad.id} className="flex items-center gap-2">
                <span className="font-mono text-xs">{s.unidad.numero_serie}</span>
                {s.unidad.estado !== 'disponible' && (
                  <span title="Figuraba fuera del inventario: se reingresará con el ajuste +">
                    <EstadoUnidadBadge estado={s.unidad.estado} />
                  </span>
                )}
                {editable && (
                  <button
                    type="button"
                    onClick={() => quitar.mutate(s.unidad.id)}
                    disabled={quitar.isPending}
                    className="ml-auto text-slate-500 hover:text-red-400"
                    aria-label={`Quitar ${s.unidad.numero_serie}`}
                  >
                    <X className="size-3.5" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        {quitar.error && <p className="mt-1 text-xs text-red-400">{mensajeError(quitar.error)}</p>}
      </div>

      {enCurso && (
        <div>
          <p className="mb-2 text-xs tracking-wide text-slate-400 uppercase">
            Disponibles sin encontrar ({isLoading ? '…' : noEncontradas.length})
          </p>
          {fila.contado === null ? (
            <p className="text-xs text-slate-500">Si no cuentas este producto, no se ajustará.</p>
          ) : noEncontradas.length === 0 ? (
            <p className="text-xs text-slate-500">Ninguna.</p>
          ) : (
            <>
              <ul className="space-y-1">
                {noEncontradas.map((u) => (
                  <li key={u.id} className="font-mono text-xs text-red-400">
                    {u.numero_serie}
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-slate-500">Al finalizar pasarán a estado «De baja».</p>
            </>
          )}
        </div>
      )}
    </div>
  )
}
