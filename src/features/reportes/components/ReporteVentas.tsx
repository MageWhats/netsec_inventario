import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { formatearFecha, formatearPrecio } from '@/lib/format'
import { formatearNumero } from '@/features/movimientos/tipos'
import { LIMITE_LINEAS, useLineasMovimiento, type LineaMovimiento } from '../api'
import { useOrigenLineas, type Origen } from '../origen'
import { columnasOrigen } from './columnasOrigen'
import { describirRango, rangoAnterior, rangoEsteMes, type Rango } from '../rangos'
import { RangoFechas } from './RangoFechas'
import { tablaDesdeColumnas } from '@/lib/exportar'
import { ResumenVentas } from './ResumenVentas'
import { Reporte, TablaReporte, type Columna } from './TablaReporte'

type Agrupacion = 'producto' | 'cliente' | 'detalle'

interface FilaVenta {
  clave: string
  nombre: string
  detalle: string
  /** Para enlazar al producto o al cliente */
  ruta?: string
  ventas: Set<string>
  unidades: number
  total: number
  /** Costo guardado en cada salida (o el costo actual, si una línea antigua no lo tiene) */
  costo: number
}

const margen = (f: FilaVenta) => f.total - f.costo
const porcentaje = (valor: number, base: number) => (base > 0 ? `${((valor / base) * 100).toFixed(1)} %` : '—')

function columnas(agrupacion: Exclude<Agrupacion, 'detalle'>): Columna<FilaVenta>[] {
  return [
    agrupacion === 'producto'
      ? { titulo: 'SKU', valor: (f) => f.detalle, className: 'font-mono text-xs text-slate-400' }
      : { titulo: 'Documento', valor: (f) => f.detalle, className: 'text-slate-400' },
    {
      titulo: agrupacion === 'producto' ? 'Producto' : 'Cliente',
      valor: (f) => f.nombre,
      mostrar: (f) =>
        f.ruta ? (
          <Link to={f.ruta} className="font-medium text-slate-100 hover:text-brand-cyan">
            {f.nombre}
          </Link>
        ) : (
          <span className="text-slate-400">{f.nombre}</span>
        ),
    },
    { titulo: 'N.º ventas', valor: (f) => f.ventas.size, numerica: true },
    { titulo: 'Unidades', valor: (f) => f.unidades, numerica: true, total: (s) => s.toLocaleString('es-CO') },
    { titulo: 'Total vendido', valor: (f) => f.total, mostrar: (f) => formatearPrecio(f.total), numerica: true, total: formatearPrecio },
    { titulo: 'Costo', valor: (f) => f.costo, mostrar: (f) => formatearPrecio(f.costo), numerica: true, total: formatearPrecio },
    { titulo: 'Margen', valor: margen, mostrar: (f) => formatearPrecio(margen(f)), numerica: true, total: formatearPrecio },
    { titulo: 'Margen %', valor: (f) => porcentaje(margen(f), f.total), numerica: true },
  ]
}

function agrupar(lineas: LineaMovimiento[], agrupacion: Exclude<Agrupacion, 'detalle'>): FilaVenta[] {
  const filas = new Map<string, FilaVenta>()

  for (const l of lineas) {
    const { cliente } = l.movimiento
    const clave = agrupacion === 'producto' ? l.producto.id : (cliente?.id ?? 'consumidor-final')
    let fila = filas.get(clave)
    if (!fila) {
      const identidad: Pick<FilaVenta, 'nombre' | 'detalle' | 'ruta'> =
        agrupacion === 'producto'
          ? { nombre: l.producto.nombre, detalle: l.producto.sku, ruta: `/productos/${l.producto.id}` }
          : cliente
            ? { nombre: cliente.nombre, detalle: `${cliente.tipo_documento} ${cliente.documento}`, ruta: `/clientes/${cliente.id}` }
            : { nombre: 'Consumidor final', detalle: '—' }
      fila = { clave, ...identidad, ventas: new Set(), unidades: 0, total: 0, costo: 0 }
      filas.set(clave, fila)
    }
    fila.ventas.add(l.movimiento.id)
    fila.unidades += l.cantidad
    fila.total += l.cantidad * (l.precio_unitario ?? 0)
    fila.costo += l.cantidad * (l.costo_unitario ?? l.producto.precio_costo)
  }

  return [...filas.values()].sort((a, b) => b.total - a.total)
}

// ---------------------------------------------------------------------
// Detalle: una fila por línea de venta, con la compra de la que salió
// ---------------------------------------------------------------------

interface FilaDetalle {
  linea: LineaMovimiento
  /** undefined = aún cargando; [] = no se encontró la entrada */
  origen: Origen[] | undefined
}

const totalLinea = (l: LineaMovimiento) => l.cantidad * (l.precio_unitario ?? 0)

const columnasDetalle: Columna<FilaDetalle>[] = [
  { titulo: 'Fecha', valor: (f) => formatearFecha(f.linea.movimiento.fecha), className: 'whitespace-nowrap text-slate-300' },
  {
    titulo: 'Venta',
    valor: (f) => formatearNumero(f.linea.movimiento),
    mostrar: (f) => (
      <Link to={`/movimientos/${f.linea.movimiento.id}`} className="font-mono font-medium text-slate-100 hover:text-brand-cyan">
        {formatearNumero(f.linea.movimiento)}
      </Link>
    ),
  },
  { titulo: 'Cliente', valor: (f) => f.linea.movimiento.cliente?.nombre ?? 'Consumidor final' },
  { titulo: 'SKU', valor: (f) => f.linea.producto.sku, className: 'font-mono text-xs text-slate-400' },
  { titulo: 'Producto', valor: (f) => f.linea.producto.nombre },
  { titulo: 'Serial', valor: (f) => f.linea.unidad?.numero_serie, className: 'font-mono text-xs text-slate-400' },
  { titulo: 'Cantidad', valor: (f) => f.linea.cantidad, numerica: true, total: (s) => s.toLocaleString('es-CO') },
  {
    titulo: 'Precio unit.',
    valor: (f) => f.linea.precio_unitario,
    mostrar: (f) => formatearPrecio(f.linea.precio_unitario ?? 0),
    numerica: true,
  },
  {
    titulo: 'Total',
    valor: (f) => totalLinea(f.linea),
    mostrar: (f) => formatearPrecio(totalLinea(f.linea)),
    numerica: true,
    total: formatearPrecio,
  },
  ...columnasOrigen<FilaDetalle>((f) => f.origen),
]

/** Ventas (movimientos de salida) de un período, por producto, por cliente o en detalle */
export function ReporteVentas() {
  const [rango, setRango] = useState<Rango>(rangoEsteMes)
  const [agrupacion, setAgrupacion] = useState<Agrupacion>('producto')
  const lineas = useLineasMovimiento({ ...rango, tipo: 'salida' })
  // Mismas ventas en el período anterior, para las comparaciones del resumen
  const previo = useMemo(() => rangoAnterior(rango), [rango])
  const previas = useLineasMovimiento({ ...previo, tipo: 'salida' })

  const datos = useMemo(() => lineas.data ?? [], [lineas.data])
  const esDetalle = agrupacion === 'detalle'
  const origen = useOrigenLineas(datos, rango, esDetalle && !lineas.isPlaceholderData)
  // En la vista de detalle, las cifras del resumen salen de la agrupación por producto
  const agrupacionResumen = esDetalle ? 'producto' : agrupacion
  const filas = useMemo(() => agrupar(datos, agrupacionResumen), [datos, agrupacionResumen])
  const cols = useMemo(() => columnas(agrupacionResumen), [agrupacionResumen])
  const filasDetalle = useMemo<FilaDetalle[]>(
    () => datos.map((linea) => ({ linea, origen: origen.data ? (origen.data.get(linea.id) ?? []) : undefined })),
    [datos, origen.data],
  )

  // Solo antes de la migración 0004 (que completa las antiguas) puede haber líneas sin costo
  const sinCosto = datos.filter((l) => l.costo_unitario === null).length

  return (
    <Reporte
      titulo={esDetalle ? 'Detalle de ventas' : `Ventas por ${agrupacion}`}
      subtitulo={describirRango(rango)}
      cargando={lineas.isLoading}
      error={lineas.error ?? (esDetalle ? origen.error : null)}
      puedeExportar={filas.length > 0 && (!esDetalle || origen.isSuccess)}
      exportar={() =>
        esDetalle
          ? { archivo: `ventas_detalle_${rango.desde}_a_${rango.hasta}`, ...tablaDesdeColumnas(columnasDetalle, filasDetalle) }
          : { archivo: `ventas_por_${agrupacion}_${rango.desde}_a_${rango.hasta}`, ...tablaDesdeColumnas(cols, filas) }
      }
      aviso={
        datos.length >= LIMITE_LINEAS
          ? `Se alcanzó el máximo de ${LIMITE_LINEAS.toLocaleString('es-CO')} líneas: acorta el período para ver el reporte completo.`
          : sinCosto > 0 &&
            `${sinCosto} línea(s) no tienen el costo guardado: su margen se calcula con el costo actual del producto.`
      }
      filtros={
        <>
          <RangoFechas valor={rango} onChange={setRango} />
          <label className="text-xs text-slate-400">
            Agrupar por
            <select
              value={agrupacion}
              onChange={(e) => setAgrupacion(e.target.value as Agrupacion)}
              className="input mt-1 w-36"
            >
              <option value="producto">Producto</option>
              <option value="cliente">Cliente</option>
              <option value="detalle">Detalle</option>
            </select>
          </label>
        </>
      }
      resumen={
        <ResumenVentas
          lineas={datos}
          anteriores={previas.isPlaceholderData ? undefined : previas.data}
          rango={rango}
          rangoPrevio={previo}
        />
      }
    >
      {esDetalle ? (
        <TablaReporte
          columnas={columnasDetalle}
          filas={filasDetalle}
          clave={(f) => f.linea.id}
          vacio="No hay ventas en este período."
        />
      ) : (
        <TablaReporte columnas={cols} filas={filas} clave={(f) => f.clave} vacio="No hay ventas en este período." />
      )}
    </Reporte>
  )
}
