import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { formatearPrecio } from '@/lib/format'
import { useCategorias, useProductos, type Producto } from '@/features/productos/api'
import { tablaDesdeColumnas } from '@/lib/exportar'
import { agotado, bajoMinimo, type FiltroExistencias } from '../cifras'
import { ResumenInventario } from './ResumenInventario'
import { Reporte, TablaReporte, type Columna } from './TablaReporte'

const FILTROS_EXISTENCIAS: Record<FiltroExistencias, { label: string; incluye: (p: Producto) => boolean; subtitulo: string }> = {
  con: { label: 'Con existencias', incluye: (p) => p.stock > 0, subtitulo: ' · solo productos con existencias' },
  todas: { label: 'Todos', incluye: () => true, subtitulo: '' },
  bajo: { label: 'Bajo mínimo', incluye: bajoMinimo, subtitulo: ' · productos bajo el mínimo' },
  agotado: { label: 'Agotados', incluye: agotado, subtitulo: ' · productos agotados' },
}

const columnas: Columna<Producto>[] = [
  { titulo: 'SKU', valor: (p) => p.sku, className: 'font-mono text-xs text-slate-400' },
  {
    titulo: 'Producto',
    valor: (p) => p.nombre,
    mostrar: (p) => (
      <Link to={`/productos/${p.id}`} className="font-medium text-slate-100 hover:text-brand-cyan">
        {p.nombre}
      </Link>
    ),
  },
  { titulo: 'Categoría', valor: (p) => p.categoria?.nombre ?? 'Sin categoría' },
  { titulo: 'Stock', valor: (p) => p.stock, numerica: true, total: (s) => s.toLocaleString('es-CO') },
  { titulo: 'Mínimo', valor: (p) => p.stock_minimo, numerica: true },
  { titulo: 'Costo promedio', valor: (p) => p.precio_costo, mostrar: (p) => formatearPrecio(p.precio_costo), numerica: true },
  {
    titulo: 'Valor a costo',
    valor: (p) => Math.max(p.stock, 0) * p.precio_costo,
    mostrar: (p) => formatearPrecio(Math.max(p.stock, 0) * p.precio_costo),
    numerica: true,
    total: formatearPrecio,
  },
  { titulo: 'Precio venta', valor: (p) => p.precio_venta, mostrar: (p) => formatearPrecio(p.precio_venta), numerica: true },
  {
    titulo: 'Valor a precio venta',
    valor: (p) => Math.max(p.stock, 0) * p.precio_venta,
    mostrar: (p) => formatearPrecio(Math.max(p.stock, 0) * p.precio_venta),
    numerica: true,
    total: formatearPrecio,
  },
]

/** Foto actual del inventario: existencias valorizadas por producto */
export function ReporteInventario() {
  const productos = useProductos()
  const { data: categorias = [] } = useCategorias()
  const [categoriaId, setCategoriaId] = useState('')
  const [existencias, setExistencias] = useState<FiltroExistencias>('con')

  const base = useMemo(
    () => (productos.data ?? []).filter((p) => p.activo && (!categoriaId || p.categoria_id === categoriaId)),
    [productos.data, categoriaId],
  )
  const filas = useMemo(() => base.filter(FILTROS_EXISTENCIAS[existencias].incluye), [base, existencias])
  const categoria = categorias.find((c) => c.id === categoriaId)?.nombre

  return (
    <Reporte
      titulo="Inventario valorizado"
      subtitulo={`${categoria ?? 'Todas las categorías'}${FILTROS_EXISTENCIAS[existencias].subtitulo}`}
      cargando={productos.isLoading}
      error={productos.error}
      puedeExportar={filas.length > 0}
      exportar={() => ({ archivo: 'inventario_valorizado', ...tablaDesdeColumnas(columnas, filas) })}
      filtros={
        <>
          <label className="text-xs text-slate-400">
            Categoría
            <select value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)} className="input mt-1 w-48">
              <option value="">Todas</option>
              {categorias.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-slate-400">
            Existencias
            <select
              value={existencias}
              onChange={(e) => setExistencias(e.target.value as FiltroExistencias)}
              className="input mt-1 w-44"
            >
              {Object.entries(FILTROS_EXISTENCIAS).map(([id, { label }]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </>
      }
      resumen={
        <ResumenInventario
          filas={filas}
          base={base}
          porProducto={Boolean(categoriaId)}
          filtro={existencias}
          onFiltro={setExistencias}
        />
      }
    >
      <TablaReporte columnas={columnas} filas={filas} clave={(p) => p.id} vacio="No hay productos con esos filtros." />
    </Reporte>
  )
}
