import { useQuery } from '@tanstack/react-query'
import {
  ArrowDownToLine,
  ArrowLeftRight,
  ArrowUpFromLine,
  Barcode,
  CornerDownLeft,
  Loader2,
  Package,
  Search,
  ShoppingCart,
  Truck,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { useDeferredValue, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePermisos } from '@/features/auth/permisos'
import { useClientes } from '@/features/clientes/api'
import { etiquetaDocumento } from '@/features/clientes/schema'
import { formatearNumero, parsearNumeroMovimiento, tiposMovimiento } from '@/features/movimientos/tipos'
import { useProductos } from '@/features/productos/api'
import { useProveedores } from '@/features/proveedores/api'
import { formatearFecha } from '@/lib/format'
import { ABRIR_BUSQUEDA } from '@/lib/busqueda'
import { supabase } from '@/lib/supabase'

interface Resultado {
  clave: string
  grupo: string
  icono: LucideIcon
  titulo: string
  detalle?: string
  ir: string
}

const MAX_POR_GRUPO = 5

/**
 * Búsqueda global (Ctrl + K o ⌘ + K): productos, seriales, clientes, proveedores, movimientos por su número
 * y accesos directos, desde cualquier pantalla.
 */
export function BusquedaGlobal() {
  const [abierta, setAbierta] = useState(false)

  useEffect(() => {
    const onTecla = (e: globalThis.KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setAbierta((a) => !a)
      }
    }
    const onAbrir = () => setAbierta(true)
    document.addEventListener('keydown', onTecla)
    window.addEventListener(ABRIR_BUSQUEDA, onAbrir)
    return () => {
      document.removeEventListener('keydown', onTecla)
      window.removeEventListener(ABRIR_BUSQUEDA, onAbrir)
    }
  }, [])

  // El contenido (y sus consultas) solo existe mientras está abierta
  return abierta ? <Paleta onClose={() => setAbierta(false)} /> : null
}

function Paleta({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate()
  const { puedeOperar, verCostos } = usePermisos()
  const [texto, setTexto] = useState('')
  const [resaltado, setResaltado] = useState(0)
  const lista = useRef<HTMLUListElement>(null)
  const termino = useDeferredValue(texto.trim().toLowerCase())

  const productos = useProductos()
  const clientes = useClientes()
  const proveedores = useProveedores()
  const seriales = useSeriales(termino)
  const movimientos = useMovimientosPorNumero(termino)

  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = ''
    }
  }, [])

  const resultados = useMemo(() => {
    const r: Resultado[] = []
    const contiene = (...campos: (string | null | undefined)[]) =>
      campos.some((c) => c?.toLowerCase().includes(termino))

    if (!termino) {
      const accesos: [string, LucideIcon, string, boolean][] = [
        ['Nueva salida', ArrowUpFromLine, '/movimientos/nuevo/salida', puedeOperar],
        ['Nueva entrada', ArrowDownToLine, '/movimientos/nuevo/entrada', puedeOperar],
        ['Consultar un serial o garantía', Barcode, '/seriales', true],
        ['Productos', Package, '/productos', true],
        ['Movimientos', ArrowLeftRight, '/movimientos', true],
        ['Clientes', Users, '/clientes', true],
        ['Órdenes de compra', ShoppingCart, '/compras', verCostos],
      ]
      for (const [titulo, icono, ir, visible] of accesos) {
        if (visible) r.push({ clave: ir, grupo: 'Ir a', icono, titulo, ir })
      }
      return r
    }

    for (const m of movimientos.data ?? []) {
      r.push({
        clave: `m-${m.id}`,
        grupo: 'Movimientos',
        icono: tiposMovimiento[m.tipo].icono,
        titulo: formatearNumero(m),
        detalle: [tiposMovimiento[m.tipo].label, m.cliente_nombre ?? m.proveedor_nombre, formatearFecha(m.fecha)]
          .filter(Boolean)
          .join(' · '),
        ir: `/movimientos/${m.id}`,
      })
    }
    ;(productos.data ?? [])
      .filter((p) => contiene(p.nombre, p.sku, p.marca, p.modelo, p.codigo_barras))
      .sort((a, b) => Number(b.activo) - Number(a.activo))
      .slice(0, MAX_POR_GRUPO)
      .forEach((p) =>
        r.push({
          clave: `p-${p.id}`,
          grupo: 'Productos',
          icono: Package,
          titulo: p.nombre,
          detalle: `${p.sku} · stock ${p.stock}${p.activo ? '' : ' · inactivo'}`,
          ir: `/productos/${p.id}`,
        }),
      )
    for (const u of seriales.data ?? []) {
      r.push({
        clave: `u-${u.id}`,
        grupo: 'Seriales',
        icono: Barcode,
        titulo: u.numero_serie,
        detalle: u.producto.nombre,
        ir: `/seriales?q=${encodeURIComponent(u.numero_serie)}&id=${u.id}`,
      })
    }
    ;(clientes.data ?? [])
      .filter((c) => contiene(c.nombre, c.documento, c.telefono, c.email))
      .slice(0, MAX_POR_GRUPO)
      .forEach((c) =>
        r.push({
          clave: `c-${c.id}`,
          grupo: 'Clientes',
          icono: Users,
          titulo: c.nombre,
          detalle: etiquetaDocumento(c),
          ir: `/clientes/${c.id}`,
        }),
      )
    ;(proveedores.data ?? [])
      .filter((p) => contiene(p.nombre, p.nit, p.contacto))
      .slice(0, MAX_POR_GRUPO)
      .forEach((p) =>
        r.push({
          clave: `v-${p.id}`,
          grupo: 'Proveedores',
          icono: Truck,
          titulo: p.nombre,
          detalle: p.nit ? `NIT ${p.nit}` : undefined,
          ir: `/proveedores/${p.id}`,
        }),
      )
    return r
  }, [
    termino,
    productos.data,
    clientes.data,
    proveedores.data,
    seriales.data,
    movimientos.data,
    puedeOperar,
    verCostos,
  ])

  const cargando =
    productos.isLoading || clientes.isLoading || proveedores.isLoading || seriales.isFetching || movimientos.isFetching
  const indice = Math.min(resaltado, Math.max(resultados.length - 1, 0))

  useEffect(() => {
    lista.current?.querySelector(`[data-indice="${indice}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [indice])

  function ir(resultado: Resultado | undefined) {
    if (!resultado) return
    onClose()
    navigate(resultado.ir)
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setResaltado((i) => Math.min(i + 1, resultados.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setResaltado((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      ir(resultados[indice])
    } else if (e.key === 'Escape') {
      onClose()
    }
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex items-start justify-center bg-black/60 px-4 pt-[12vh] backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Buscar en la app"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xl overflow-hidden rounded-2xl border border-brand-border bg-brand-card shadow-2xl"
      >
        <div className="flex items-center gap-3 border-b border-brand-border px-4">
          {cargando ? (
            <Loader2 className="size-5 animate-spin text-slate-500" />
          ) : (
            <Search className="size-5 text-slate-500" />
          )}
          <input
            autoFocus
            value={texto}
            onChange={(e) => {
              setTexto(e.target.value)
              setResaltado(0)
            }}
            onKeyDown={onKeyDown}
            placeholder="Buscar productos, seriales, clientes, NetS-12…"
            className="h-14 flex-1 bg-transparent text-base outline-none placeholder:text-slate-500"
            role="combobox"
            aria-expanded="true"
            aria-controls="resultados-busqueda"
            aria-activedescendant={resultados[indice] ? `resultado-${indice}` : undefined}
          />
          <kbd className="hidden rounded border border-brand-border px-1.5 py-0.5 text-xs text-slate-500 sm:block">
            Esc
          </kbd>
        </div>

        <ul ref={lista} id="resultados-busqueda" role="listbox" className="max-h-[55vh] overflow-y-auto p-2">
          {resultados.length === 0 && (
            <li className="px-3 py-8 text-center text-sm text-slate-500">
              {cargando ? 'Buscando…' : `Nada coincide con «${texto.trim()}».`}
            </li>
          )}
          {resultados.map((r, i) => {
            const Icono = r.icono
            const nuevoGrupo = i === 0 || resultados[i - 1]!.grupo !== r.grupo
            return (
              <li key={r.clave} role="presentation">
                {nuevoGrupo && (
                  <p className="px-3 pt-3 pb-1 text-xs font-medium tracking-wide text-slate-500 uppercase">{r.grupo}</p>
                )}
                <button
                  id={`resultado-${i}`}
                  data-indice={i}
                  role="option"
                  aria-selected={i === indice}
                  onMouseMove={() => setResaltado(i)}
                  onClick={() => ir(r)}
                  className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left ${i === indice ? 'bg-brand-accent/15' : ''}`}
                >
                  <Icono className={`size-4 shrink-0 ${i === indice ? 'text-brand-cyan' : 'text-slate-500'}`} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm">{r.titulo}</span>
                    {r.detalle && <span className="block truncate text-xs text-slate-500">{r.detalle}</span>}
                  </span>
                  {i === indice && <CornerDownLeft className="size-4 shrink-0 text-slate-500" />}
                </button>
              </li>
            )
          })}
        </ul>

        <div className="hidden items-center gap-4 border-t border-brand-border px-4 py-2 text-xs text-slate-500 sm:flex">
          <span>↑ ↓ para moverte</span>
          <span>Enter para abrir</span>
          <span className="ml-auto">Ctrl + K para abrir o cerrar</span>
        </div>
      </div>
    </div>
  )
}

/** Seriales o MAC que contienen el texto (desde 3 caracteres) */
function useSeriales(termino: string) {
  return useQuery({
    queryKey: ['busqueda-global', 'seriales', termino],
    enabled: termino.length >= 3,
    staleTime: 30_000,
    queryFn: async () => {
      const limpio = termino.replace(/[%_,()]/g, '')
      const { data, error } = await supabase
        .from('unidades')
        .select('id, numero_serie, producto:productos(nombre)')
        .or(`numero_serie.ilike.%${limpio}%,mac.ilike.%${limpio}%`)
        .limit(MAX_POR_GRUPO)
      if (error) throw error
      return data
    },
  })
}

/** Movimientos por su número: "NetS-12", "s12", "12"… */
function useMovimientosPorNumero(termino: string) {
  const consecutivo = parsearNumeroMovimiento(termino)
  return useQuery({
    queryKey: ['busqueda-global', 'movimientos', consecutivo],
    enabled: Boolean(consecutivo),
    staleTime: 30_000,
    queryFn: async () => {
      let query = supabase
        .from('movimientos_resumen')
        .select('id, numero, tipo, fecha, cliente_nombre, proveedor_nombre')
        .eq('numero', consecutivo!.numero)
        .limit(MAX_POR_GRUPO)
      if (consecutivo!.tipos.length) query = query.in('tipo', consecutivo!.tipos)
      const { data, error } = await query
      if (error) throw error
      return data
    },
  })
}
