import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { formatearFecha, formatearPrecio } from '@/lib/format'
import { TipoMovimientoBadge } from '@/features/movimientos/components/MovimientosTabla'
import {
  describirMotivo,
  formatearNumero,
  TIPOS_MOVIMIENTO,
  tiposMovimiento,
  type TipoMovimiento,
} from '@/features/movimientos/tipos'
import { LIMITE_LINEAS, useLineasMovimiento, valorUnitario, type LineaMovimiento } from '../api'
import { useOrigenLineas } from '../origen'
import { describirRango, rangoAnterior, rangoEsteMes, type Rango } from '../rangos'
import { columnasOrigen } from './columnasOrigen'
import { RangoFechas } from './RangoFechas'
import { tablaDesdeColumnas } from '@/lib/exportar'
import { ResumenMovimientos } from './ResumenMovimientos'
import { Reporte, TablaReporte, type Columna } from './TablaReporte'

const tercero = (l: LineaMovimiento) =>
  l.movimiento.proveedor?.nombre ??
  l.movimiento.cliente?.nombre ??
  (l.movimiento.tipo === 'salida' ? 'Consumidor final' : (describirMotivo(l.movimiento) ?? ''))

const columnas: Columna<LineaMovimiento>[] = [
  {
    titulo: 'Fecha',
    valor: (l) => formatearFecha(l.movimiento.fecha),
    className: 'whitespace-nowrap text-slate-300',
  },
  {
    titulo: 'Número',
    valor: (l) => formatearNumero(l.movimiento),
    mostrar: (l) => (
      <Link to={`/movimientos/${l.movimiento.id}`} className="font-mono font-medium text-slate-100 hover:text-brand-cyan">
        {formatearNumero(l.movimiento)}
      </Link>
    ),
  },
  {
    titulo: 'Tipo',
    valor: (l) => tiposMovimiento[l.movimiento.tipo].label,
    mostrar: (l) => <TipoMovimientoBadge tipo={l.movimiento.tipo} />,
  },
  { titulo: 'SKU', valor: (l) => l.producto.sku, className: 'font-mono text-xs text-slate-400' },
  { titulo: 'Producto', valor: (l) => l.producto.nombre },
  { titulo: 'Serial', valor: (l) => l.unidad?.numero_serie, className: 'font-mono text-xs text-slate-400' },
  {
    titulo: 'Cantidad',
    // Con signo: positivo si entra al inventario, negativo si sale
    valor: (l) => (tiposMovimiento[l.movimiento.tipo].esEntrada ? l.cantidad : -l.cantidad),
    numerica: true,
  },
  {
    titulo: 'Valor unit.',
    valor: valorUnitario,
    mostrar: (l) => {
      const v = valorUnitario(l)
      return v === null ? '—' : formatearPrecio(v)
    },
    numerica: true,
  },
  {
    titulo: 'Total',
    valor: (l) => l.cantidad * (valorUnitario(l) ?? 0),
    mostrar: (l) => (valorUnitario(l) === null ? '—' : formatearPrecio(l.cantidad * (valorUnitario(l) ?? 0))),
    numerica: true,
  },
  { titulo: 'Tercero / motivo', valor: tercero, className: 'max-w-xs truncate text-slate-300' },
  { titulo: 'Referencia', valor: (l) => l.movimiento.referencia, className: 'text-slate-400' },
]

/** Detalle línea por línea de los movimientos de un período */
export function ReporteMovimientos() {
  const [rango, setRango] = useState<Rango>(rangoEsteMes)
  const [tipo, setTipo] = useState<TipoMovimiento | ''>('')
  const lineas = useLineasMovimiento({ ...rango, tipo })
  // Mismo filtro en el período anterior, para las comparaciones del resumen
  const previo = useMemo(() => rangoAnterior(rango), [rango])
  const previas = useLineasMovimiento({ ...previo, tipo })

  const filas = useMemo(() => lineas.data ?? [], [lineas.data])
  // De qué entrada salió la mercancía de cada salida o ajuste − (las entradas no aplican)
  const origen = useOrigenLineas(filas, rango, !lineas.isPlaceholderData)
  const hayOrigen = filas.some((l) => !tiposMovimiento[l.movimiento.tipo].esEntrada)
  const cols = useMemo(
    () =>
      hayOrigen
        ? [
            ...columnas,
            ...columnasOrigen<LineaMovimiento>((l) =>
              tiposMovimiento[l.movimiento.tipo].esEntrada ? null : origen.data && (origen.data.get(l.id) ?? []),
            ),
          ]
        : columnas,
    [hayOrigen, origen.data],
  )
  return (
    <Reporte
      titulo={`Movimientos${tipo ? ` · ${tiposMovimiento[tipo].label}` : ''}`}
      subtitulo={describirRango(rango)}
      cargando={lineas.isLoading}
      error={lineas.error ?? origen.error}
      puedeExportar={filas.length > 0 && (!hayOrigen || origen.isSuccess)}
      exportar={() => ({ archivo: `movimientos_${rango.desde}_a_${rango.hasta}`, ...tablaDesdeColumnas(cols, filas) })}
      aviso={
        filas.length >= LIMITE_LINEAS &&
        `Se alcanzó el máximo de ${LIMITE_LINEAS.toLocaleString('es-CO')} líneas: acorta el período para ver el reporte completo.`
      }
      filtros={
        <>
          <RangoFechas valor={rango} onChange={setRango} />
          <label className="text-xs text-slate-400">
            Tipo
            <select
              value={tipo}
              onChange={(e) => setTipo(e.target.value as TipoMovimiento | '')}
              className="input mt-1 w-40"
            >
              <option value="">Todos</option>
              {TIPOS_MOVIMIENTO.map((t) => (
                <option key={t} value={t}>
                  {tiposMovimiento[t].label}
                </option>
              ))}
            </select>
          </label>
        </>
      }
      resumen={
        <ResumenMovimientos
          filas={filas}
          anteriores={previas.isPlaceholderData ? undefined : previas.data}
          rango={rango}
          rangoPrevio={previo}
          tipo={tipo}
          onTipo={setTipo}
        />
      }
    >
      <TablaReporte columnas={cols} filas={filas} clave={(l) => l.id} vacio="No hay movimientos en este período." />
    </Reporte>
  )
}
