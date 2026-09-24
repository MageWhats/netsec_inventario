import { useState } from 'react'
import { Link } from 'react-router-dom'
import { formatearFecha, formatearPrecio } from '@/lib/format'
import { TipoMovimientoBadge } from '@/features/movimientos/components/MovimientosTabla'
import { formatearNumero, TIPOS_MOVIMIENTO, tiposMovimiento, type TipoMovimiento } from '@/features/movimientos/tipos'
import { LIMITE_LINEAS, useLineasMovimiento, type LineaMovimiento } from '../api'
import { describirRango, rangoEsteMes, type Rango } from '../rangos'
import { RangoFechas } from './RangoFechas'
import { exportarCsv } from '../exportar'
import { Cifra, Reporte, TablaReporte, type Columna } from './TablaReporte'

/** Precio de venta en salidas, costo en el resto (igual que en el historial de movimientos) */
const valorUnitario = (l: LineaMovimiento) =>
  (l.movimiento.tipo === 'salida' ? l.precio_unitario : l.costo_unitario) ?? null

const tercero = (l: LineaMovimiento) =>
  l.movimiento.proveedor?.nombre ??
  l.movimiento.cliente?.nombre ??
  (l.movimiento.tipo === 'salida' ? 'Consumidor final' : (l.movimiento.notas ?? ''))

const columnas: Columna<LineaMovimiento>[] = [
  {
    titulo: 'Fecha',
    valor: (l) => formatearFecha(l.movimiento.fecha),
    className: 'whitespace-nowrap text-slate-300',
  },
  {
    titulo: 'Número',
    valor: (l) => formatearNumero(l.movimiento.numero),
    mostrar: (l) => (
      <Link to={`/movimientos/${l.movimiento.id}`} className="font-mono font-medium text-slate-100 hover:text-brand-cyan">
        {formatearNumero(l.movimiento.numero)}
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

  const filas = lineas.data ?? []
  const unidades = (entrada: boolean) =>
    filas
      .filter((l) => tiposMovimiento[l.movimiento.tipo].esEntrada === entrada)
      .reduce((s, l) => s + l.cantidad, 0)
      .toLocaleString('es-CO')

  return (
    <Reporte
      titulo={`Movimientos${tipo ? ` · ${tiposMovimiento[tipo].label}` : ''}`}
      subtitulo={describirRango(rango)}
      cargando={lineas.isLoading}
      error={lineas.error}
      puedeExportar={filas.length > 0}
      onExportar={() => exportarCsv(`movimientos_${rango.desde}_a_${rango.hasta}`, columnas, filas)}
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
        <>
          <Cifra label="Movimientos" valor={new Set(filas.map((l) => l.movimiento.id)).size} />
          <Cifra label="Líneas" valor={filas.length.toLocaleString('es-CO')} />
          <Cifra label="Unidades que entran" valor={unidades(true)} />
          <Cifra label="Unidades que salen" valor={unidades(false)} />
        </>
      }
    >
      <TablaReporte columnas={columnas} filas={filas} clave={(l) => l.id} vacio="No hay movimientos en este período." />
    </Reporte>
  )
}
