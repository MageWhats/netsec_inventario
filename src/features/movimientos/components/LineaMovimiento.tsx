import { Trash2 } from 'lucide-react'
import { StockBadge, TipoControlBadge } from '@/features/productos/components/badges'
import { estadosUnidad } from '@/features/productos/estados'
import { formatearPrecio } from '@/lib/format'
import {
  ESTADOS_AJUSTE_SALIDA,
  ESTADOS_REINGRESO,
  subtotalLinea,
  unidadesLinea,
  usaPrecioVenta,
  type Linea,
} from '../lineas'
import { tiposMovimiento, type TipoMovimiento } from '../tipos'
import { SerialesNuevosInput } from './SerialesNuevosInput'
import { UnidadesSelector } from './UnidadesSelector'

interface LineaMovimientoProps {
  tipo: TipoMovimiento
  linea: Linea
  error?: string
  onChange: (cambios: Partial<Linea>) => void
  onRemove: () => void
}

export function LineaMovimiento({ tipo, linea, error, onChange, onRemove }: LineaMovimientoProps) {
  const { producto } = linea
  const esEntrada = tiposMovimiento[tipo].esEntrada
  /** Ajuste −: sale al costo promedio (el servidor ignora cualquier otro valor) */
  const costoFijo = tipo === 'ajuste_salida'

  return (
    <li className={`rounded-xl border bg-brand-bg/40 p-4 ${error ? 'border-red-500/60' : 'border-brand-border'}`}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{producto.nombre}</span>
            <TipoControlBadge serializado={producto.es_serializado} />
          </div>
          <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
            <span className="font-mono">{producto.sku}</span>
            <span>· Stock actual</span>
            <StockBadge stock={producto.stock} minimo={producto.stock_minimo} />
          </div>
        </div>
        <button
          type="button"
          onClick={onRemove}
          className="rounded-lg p-2 text-slate-400 hover:bg-white/5 hover:text-red-400"
          aria-label={`Quitar ${producto.nombre}`}
        >
          <Trash2 className="size-4" />
        </button>
      </div>

      {producto.es_serializado && (
        <div className="mb-4 space-y-4">
          {esEntrada && (
            <div>
              <p className="mb-2 text-sm text-slate-300">Seriales nuevos</p>
              <SerialesNuevosInput series={linea.series} onChange={(series) => onChange({ series })} />
            </div>
          )}

          {tipo === 'ajuste_entrada' && (
            <div>
              <p className="mb-2 text-sm text-slate-300">
                Reingresar unidades existentes <span className="text-slate-500">(devoluciones, regreso de garantía…)</span>
              </p>
              <UnidadesSelector
                productoId={producto.id}
                estados={ESTADOS_REINGRESO}
                seleccionadas={linea.unidadIds}
                onChange={(unidadIds) => onChange({ unidadIds })}
                textoVacio="No hay unidades vendidas, dañadas, en garantía ni de baja para reingresar."
              />
            </div>
          )}

          {!esEntrada && (
            <UnidadesSelector
              productoId={producto.id}
              estados={['disponible']}
              seleccionadas={linea.unidadIds}
              onChange={(unidadIds) => onChange({ unidadIds })}
              textoVacio="No hay unidades disponibles de este producto."
            />
          )}

          {tipo === 'ajuste_salida' && (
            <label className="flex flex-wrap items-center gap-2 text-sm text-slate-300">
              Las unidades pasan a
              <select
                value={linea.estadoDestino}
                onChange={(e) => onChange({ estadoDestino: e.target.value as Linea['estadoDestino'] })}
                className="input w-auto"
              >
                {ESTADOS_AJUSTE_SALIDA.map((estado) => (
                  <option key={estado} value={estado}>
                    {estadosUnidad[estado].label}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-end gap-4">
        {producto.es_serializado ? (
          <div className="text-sm">
            <span className="block text-xs text-slate-400">Unidades</span>
            <span className="text-lg font-semibold">{unidadesLinea(linea)}</span>
          </div>
        ) : (
          <label className="block text-xs text-slate-400">
            Cantidad
            <input
              type="number"
              min={1}
              step={1}
              max={esEntrada ? undefined : producto.stock}
              value={Number.isFinite(linea.cantidad) ? linea.cantidad : ''}
              onChange={(e) => onChange({ cantidad: e.target.valueAsNumber })}
              className="input mt-1 w-28"
            />
          </label>
        )}
        <label className="block text-xs text-slate-400">
          {usaPrecioVenta(tipo) ? 'Precio de venta unitario' : costoFijo ? 'Costo promedio' : 'Costo unitario'}
          <input
            type="number"
            min={0}
            step="any"
            readOnly={costoFijo}
            title={costoFijo ? 'Lo que sale del inventario sale al costo promedio' : undefined}
            value={Number.isFinite(linea.valorUnitario) ? linea.valorUnitario : ''}
            onChange={(e) => onChange({ valorUnitario: e.target.valueAsNumber })}
            className={`input mt-1 w-40 ${costoFijo ? 'cursor-not-allowed opacity-60' : ''}`}
          />
        </label>
        <div className="ml-auto text-right text-sm">
          <span className="block text-xs text-slate-400">Subtotal</span>
          <span className="font-semibold">{formatearPrecio(subtotalLinea(linea))}</span>
        </div>
      </div>

      {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
    </li>
  )
}
