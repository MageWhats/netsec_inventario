import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { formatearPrecio } from '@/lib/format'
import { useCategorias, useProductos, type Producto } from '@/features/productos/api'
import { tablaDesdeColumnas } from '@/lib/exportar'
import { Cifra, Reporte, TablaReporte, type Columna } from './TablaReporte'

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
  const [soloConStock, setSoloConStock] = useState(true)

  const filas = useMemo(
    () =>
      (productos.data ?? []).filter(
        (p) => p.activo && (!categoriaId || p.categoria_id === categoriaId) && (!soloConStock || p.stock > 0),
      ),
    [productos.data, categoriaId, soloConStock],
  )

  const sumar = (f: (p: Producto) => number) => filas.reduce((total, p) => total + f(p), 0)
  const categoria = categorias.find((c) => c.id === categoriaId)?.nombre

  return (
    <Reporte
      titulo="Inventario valorizado"
      subtitulo={`${categoria ?? 'Todas las categorías'}${soloConStock ? ' · solo productos con existencias' : ''}`}
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
          <label className="flex h-10.5 items-center gap-2 text-sm text-slate-300">
            <input type="checkbox" checked={soloConStock} onChange={(e) => setSoloConStock(e.target.checked)} />
            Solo con existencias
          </label>
        </>
      }
      resumen={
        <>
          <Cifra label="Productos" valor={filas.length} />
          <Cifra label="Unidades" valor={sumar((p) => Math.max(p.stock, 0)).toLocaleString('es-CO')} />
          <Cifra label="Valor a costo" valor={formatearPrecio(sumar((p) => Math.max(p.stock, 0) * p.precio_costo))} />
          <Cifra label="Valor a precio venta" valor={formatearPrecio(sumar((p) => Math.max(p.stock, 0) * p.precio_venta))} />
        </>
      }
    >
      <TablaReporte columnas={columnas} filas={filas} clave={(p) => p.id} vacio="No hay productos con esos filtros." />
    </Reporte>
  )
}
