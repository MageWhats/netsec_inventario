import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { formatearFecha, formatearPrecio } from '@/lib/format'
import { formatearNumero } from '@/features/movimientos/tipos'
import { LIMITE_LINEAS, useLineasMovimiento, type LineaMovimiento } from '../api'
import { useOrigenVentas, type Origen } from '../origen'
import { describirRango, rangoEsteMes, type Rango } from '../rangos'
import { RangoFechas } from './RangoFechas'
import { tablaDesdeColumnas } from '@/lib/exportar'
import { Cifra, Reporte, TablaReporte, type Columna } from './TablaReporte'

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

/** NetE-… si vino de una compra, NetA-… si vino de un ajuste + */
const numeroOrigen = (o: Origen) => formatearNumero(o)

/** "000003" o, si la venta salió de varias entradas, "000003 (2), 000005 (1)" */
const describirEntradas = (origen: Origen[]) =>
  origen.map((o) => (origen.length > 1 ? `${numeroOrigen(o)} (${o.cantidad})` : numeroOrigen(o))).join(', ')

const unicos = (valores: (string | null)[]) => [...new Set(valores.filter(Boolean))].join(', ')

function textoOrigen(f: FilaDetalle, dato: (origen: Origen[]) => string) {
  if (f.origen === undefined) return '…'
  if (f.origen.length === 0) return 'Sin registro'
  return dato(f.origen) || '—'
}

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
  {
    titulo: 'Entrada (compra)',
    valor: (f) => textoOrigen(f, describirEntradas),
    mostrar: (f) =>
      f.origen?.length ? (
        <span className="whitespace-nowrap">
          {f.origen.map((o, i) => (
            <span key={o.movimientoId}>
              {i > 0 && ', '}
              <Link to={`/movimientos/${o.movimientoId}`} className="font-mono hover:text-brand-cyan">
                {numeroOrigen(o)}
              </Link>
              {f.origen!.length > 1 && <span className="text-slate-500"> ({o.cantidad})</span>}
            </span>
          ))}
        </span>
      ) : (
        <span className="text-slate-500">{textoOrigen(f, describirEntradas)}</span>
      ),
  },
  { titulo: 'Factura / referencia', valor: (f) => textoOrigen(f, (o) => unicos(o.map((x) => x.referencia))) },
  { titulo: 'Proveedor', valor: (f) => textoOrigen(f, (o) => unicos(o.map((x) => x.proveedor))) },
]

/** Ventas (movimientos de salida) de un período, por producto, por cliente o en detalle */
export function ReporteVentas() {
  const [rango, setRango] = useState<Rango>(rangoEsteMes)
  const [agrupacion, setAgrupacion] = useState<Agrupacion>('producto')
  const lineas = useLineasMovimiento({ ...rango, tipo: 'salida' })

  const datos = useMemo(() => lineas.data ?? [], [lineas.data])
  const esDetalle = agrupacion === 'detalle'
  const origen = useOrigenVentas(datos, rango, esDetalle && !lineas.isPlaceholderData)
  // En la vista de detalle, las cifras del resumen salen de la agrupación por producto
  const agrupacionResumen = esDetalle ? 'producto' : agrupacion
  const filas = useMemo(() => agrupar(datos, agrupacionResumen), [datos, agrupacionResumen])
  const cols = useMemo(() => columnas(agrupacionResumen), [agrupacionResumen])
  const filasDetalle = useMemo<FilaDetalle[]>(
    () => datos.map((linea) => ({ linea, origen: origen.data ? (origen.data.get(linea.id) ?? []) : undefined })),
    [datos, origen.data],
  )

  const total = filas.reduce((s, f) => s + f.total, 0)
  const costo = filas.reduce((s, f) => s + f.costo, 0)
  const numeroVentas = new Set(datos.map((l) => l.movimiento.id)).size
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
        <>
          <Cifra label="Total vendido" valor={formatearPrecio(total)} />
          <Cifra label="Ventas (salidas)" valor={numeroVentas} />
          <Cifra label="Unidades vendidas" valor={filas.reduce((s, f) => s + f.unidades, 0).toLocaleString('es-CO')} />
          <Cifra label="Margen" valor={`${formatearPrecio(total - costo)} · ${porcentaje(total - costo, total)}`} />
        </>
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
