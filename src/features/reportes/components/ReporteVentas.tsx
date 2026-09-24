import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { formatearPrecio } from '@/lib/format'
import { LIMITE_LINEAS, useLineasMovimiento, type LineaMovimiento } from '../api'
import { describirRango, rangoEsteMes, type Rango } from '../rangos'
import { RangoFechas } from './RangoFechas'
import { exportarCsv } from '../exportar'
import { Cifra, Reporte, TablaReporte, type Columna } from './TablaReporte'

type Agrupacion = 'producto' | 'cliente'

interface FilaVenta {
  clave: string
  nombre: string
  detalle: string
  /** Para enlazar al producto o al cliente */
  ruta?: string
  ventas: Set<string>
  unidades: number
  total: number
  /** Unidades × costo actual del producto (las salidas no guardan el costo) */
  costo: number
}

const margen = (f: FilaVenta) => f.total - f.costo
const porcentaje = (valor: number, base: number) => (base > 0 ? `${((valor / base) * 100).toFixed(1)} %` : '—')

function columnas(agrupacion: Agrupacion): Columna<FilaVenta>[] {
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
    { titulo: 'Costo estimado', valor: (f) => f.costo, mostrar: (f) => formatearPrecio(f.costo), numerica: true, total: formatearPrecio },
    { titulo: 'Margen', valor: margen, mostrar: (f) => formatearPrecio(margen(f)), numerica: true, total: formatearPrecio },
    { titulo: 'Margen %', valor: (f) => porcentaje(margen(f), f.total), numerica: true },
  ]
}

function agrupar(lineas: LineaMovimiento[], agrupacion: Agrupacion): FilaVenta[] {
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
    fila.costo += l.cantidad * l.producto.precio_costo
  }

  return [...filas.values()].sort((a, b) => b.total - a.total)
}

/** Ventas (movimientos de salida) de un período, por producto o por cliente */
export function ReporteVentas() {
  const [rango, setRango] = useState<Rango>(rangoEsteMes)
  const [agrupacion, setAgrupacion] = useState<Agrupacion>('producto')
  const lineas = useLineasMovimiento({ ...rango, tipo: 'salida' })

  const datos = useMemo(() => lineas.data ?? [], [lineas.data])
  const filas = useMemo(() => agrupar(datos, agrupacion), [datos, agrupacion])
  const cols = useMemo(() => columnas(agrupacion), [agrupacion])

  const total = filas.reduce((s, f) => s + f.total, 0)
  const costo = filas.reduce((s, f) => s + f.costo, 0)
  const numeroVentas = new Set(datos.map((l) => l.movimiento.id)).size

  return (
    <Reporte
      titulo={`Ventas por ${agrupacion}`}
      subtitulo={describirRango(rango)}
      cargando={lineas.isLoading}
      error={lineas.error}
      puedeExportar={filas.length > 0}
      onExportar={() => exportarCsv(`ventas_por_${agrupacion}_${rango.desde}_a_${rango.hasta}`, cols, filas)}
      aviso={
        datos.length >= LIMITE_LINEAS
          ? `Se alcanzó el máximo de ${LIMITE_LINEAS.toLocaleString('es-CO')} líneas: acorta el período para ver el reporte completo.`
          : filas.length > 0 &&
            'El costo y el margen se estiman con el precio de costo actual de cada producto, porque las salidas no guardan el costo.'
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
            </select>
          </label>
        </>
      }
      resumen={
        <>
          <Cifra label="Total vendido" valor={formatearPrecio(total)} />
          <Cifra label="Ventas (salidas)" valor={numeroVentas} />
          <Cifra label="Unidades vendidas" valor={filas.reduce((s, f) => s + f.unidades, 0).toLocaleString('es-CO')} />
          <Cifra label="Margen estimado" valor={`${formatearPrecio(total - costo)} · ${porcentaje(total - costo, total)}`} />
        </>
      }
    >
      <TablaReporte columnas={cols} filas={filas} clave={(f) => f.clave} vacio="No hay ventas en este período." />
    </Reporte>
  )
}
