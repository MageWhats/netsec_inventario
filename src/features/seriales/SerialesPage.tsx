import {
  Barcode,
  ChevronRight,
  History,
  Search,
  ShieldAlert,
  ShieldCheck,
  ShieldOff,
  ShieldQuestion,
  Undo2,
} from 'lucide-react'
import { useDeferredValue, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Dato } from '@/components/ui/Dato'
import { EstadoVacio } from '@/components/ui/EstadoVacio'
import { BotonEscanear, type ResultadoEscaneo } from '@/components/ui/Escaner'
import { LoadingBlock } from '@/components/ui/LoadingBlock'
import { PageHeader } from '@/components/ui/PageHeader'
import { usePermisos } from '@/features/auth/permisos'
import { TipoMovimientoBadge } from '@/features/movimientos/components/MovimientosTabla'
import { formatearNumero } from '@/features/movimientos/tipos'
import { useHistorialUnidad } from '@/features/productos/api'
import { EstadoUnidadBadge } from '@/features/productos/components/badges'
import { estadosUnidad, type EstadoUnidad } from '@/features/productos/estados'
import { MiniaturaProducto } from '@/features/productos/components/FotoProducto'
import { mensajeError } from '@/lib/errores'
import { formatearFecha } from '@/lib/format'
import { estadoGarantia, formatearFechaCorta, textoMeses } from '@/lib/garantia'
import { useBuscarUnidades, useUnidad, useUnidadesEnEstado, type UnidadEncontrada } from './api'

/**
 * Consulta de seriales: se escanea o escribe un serial (o MAC) y se ve de qué producto es, en qué estado está,
 * por qué movimientos ha pasado, a quién se vendió y si sigue en garantía.
 * ?q= es la búsqueda y ?id= la unidad abierta, para poder enlazar desde otras pantallas.
 */
export function SerialesPage() {
  const [params, setParams] = useSearchParams()
  const q = params.get('q') ?? ''
  const id = params.get('id')
  const termino = useDeferredValue(q)
  // ?estado=en_garantia (desde el dashboard): lista las unidades en ese estado mientras no se busque nada
  const estadoParam = params.get('estado')
  const estado = !q && estadoParam && estadoParam in estadosUnidad ? (estadoParam as EstadoUnidad) : null
  const busqueda = useBuscarUnidades(termino)
  const porEstado = useUnidadesEnEstado(estado)
  const resultados = estado ? porEstado : busqueda
  const lista = resultados.data ?? []
  // Con un único resultado (lo normal al escanear) se abre directamente
  const abierta = id ?? (lista.length === 1 ? lista[0]!.id : null)

  function buscar(texto: string) {
    setParams(texto ? { q: texto } : {}, { replace: true })
  }

  function onEscaneado(codigo: string): ResultadoEscaneo {
    buscar(codigo.trim())
    return { ok: true }
  }

  return (
    <>
      <PageHeader
        title="Seriales y garantías"
        description="Escanea o escribe un serial o una MAC para ver su historia y su garantía"
      />

      <div className="mb-6 flex max-w-2xl gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-500" />
          <input
            type="search"
            value={q}
            onChange={(e) => buscar(e.target.value)}
            placeholder="Serial o MAC (mínimo 3 caracteres)…"
            className="input pl-9 font-mono"
            autoFocus
          />
        </div>
        <BotonEscanear titulo="Escanear serial" label="Escanear" onDetectado={onEscaneado} />
      </div>

      {estado && (
        <p className="mb-3 text-sm text-slate-400">
          Unidades en estado <EstadoUnidadBadge estado={estado} />
          {porEstado.data && ` · ${porEstado.data.length}`}
        </p>
      )}

      {!estado && termino.trim().length < 3 ? (
        <section className="rounded-2xl border border-brand-border bg-brand-card">
          <EstadoVacio
            icono={Barcode}
            titulo="Consulta una unidad"
            descripcion="Escanea el código del equipo o escribe su serial o su MAC. Verás a quién se vendió, cuándo y hasta qué fecha tiene garantía."
          />
        </section>
      ) : resultados.isLoading ? (
        <LoadingBlock />
      ) : resultados.error ? (
        <p className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400">
          {mensajeError(resultados.error)}
        </p>
      ) : lista.length === 0 ? (
        <section className="rounded-2xl border border-brand-border bg-brand-card">
          {estado ? (
            <EstadoVacio
              icono={ShieldCheck}
              titulo={`No hay unidades en estado «${estadosUnidad[estado].label.toLowerCase()}»`}
            />
          ) : (
            <EstadoVacio
              icono={ShieldQuestion}
              titulo="No encontramos esa unidad"
              descripcion={
                <>
                  Ningún serial ni MAC contiene «<span className="font-mono">{termino}</span>». Revisa que esté bien
                  escrito; los seriales se registran con las entradas.
                </>
              }
            />
          )}
        </section>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,20rem)_1fr]">
          {lista.length > 1 && (
            <ListaResultados
              unidades={lista}
              abierta={abierta}
              onAbrir={(u) => setParams(estado ? { estado, id: u } : { q, id: u }, { replace: true })}
            />
          )}
          <div className={lista.length > 1 ? '' : 'lg:col-span-2'}>
            {abierta ? (
              <DetalleUnidad id={abierta} />
            ) : (
              <p className="rounded-2xl border border-dashed border-brand-border p-10 text-center text-sm text-slate-500">
                {lista.length} unidades coinciden: elige una para ver su historia.
              </p>
            )}
          </div>
        </div>
      )}
    </>
  )
}

function ListaResultados({
  unidades,
  abierta,
  onAbrir,
}: {
  unidades: UnidadEncontrada[]
  abierta: string | null
  onAbrir: (id: string) => void
}) {
  return (
    <ul className="h-fit divide-y divide-brand-border overflow-hidden rounded-2xl border border-brand-border bg-brand-card">
      {unidades.map((u) => (
        <li key={u.id}>
          <button
            onClick={() => onAbrir(u.id)}
            className={`flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-tinte/[0.03] ${
              u.id === abierta ? 'bg-brand-accent/10' : ''
            }`}
          >
            <div className="min-w-0 flex-1">
              <p className="truncate font-mono text-sm font-medium">{u.numero_serie}</p>
              <p className="truncate text-xs text-slate-500">{u.producto.nombre}</p>
            </div>
            <EstadoUnidadBadge estado={u.estado} />
            <ChevronRight className="size-4 shrink-0 text-slate-500" />
          </button>
        </li>
      ))}
    </ul>
  )
}

function DetalleUnidad({ id }: { id: string }) {
  const { data: unidad, isLoading, error } = useUnidad(id)
  const historial = useHistorialUnidad(id)
  const { esAdmin } = usePermisos()

  if (isLoading) return <LoadingBlock />
  if (error || !unidad) {
    return <p className="text-sm text-red-400">{error ? mensajeError(error) : 'La unidad no existe.'}</p>
  }

  const movimientos = historial.data ?? []
  // La venta vigente es la última salida (una devolución la vuelve a dejar disponible)
  const venta = unidad.estado === 'vendida' ? movimientos.find((m) => m.tipo === 'salida') : undefined
  const meses = unidad.producto.categoria?.garantia_meses ?? 0

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-brand-border bg-brand-card p-6">
        <div className="flex flex-wrap items-start gap-4">
          <MiniaturaProducto url={unidad.producto.imagen_url} nombre={unidad.producto.nombre} />
          <div className="min-w-0 flex-1">
            <p className="font-mono text-xl font-semibold break-all">{unidad.numero_serie}</p>
            <Link to={`/productos/${unidad.producto.id}`} className="text-sm text-slate-300 hover:text-brand-cyan">
              {unidad.producto.nombre}
            </Link>
            <p className="font-mono text-xs text-slate-500">{unidad.producto.sku}</p>
          </div>
          <EstadoUnidadBadge estado={unidad.estado} />
        </div>
        <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <Dato label="MAC">{unidad.mac && <span className="font-mono">{unidad.mac}</span>}</Dato>
          <Dato label="Categoría">{unidad.producto.categoria?.nombre}</Dato>
          <Dato label="Bodega">{unidad.bodega?.nombre}</Dato>
          <Dato label="Registrada">{formatearFecha(unidad.created_at)}</Dato>
          {unidad.notas && (
            <Dato label="Notas" className="sm:col-span-2 lg:col-span-4">
              <span className="whitespace-pre-line">{unidad.notas}</span>
            </Dato>
          )}
        </dl>
      </section>

      <Garantia
        estadoUnidad={unidad.estado}
        meses={meses}
        venta={venta}
        cargando={historial.isLoading}
        accion={
          venta &&
          esAdmin && (
            <Link
              to={`/movimientos/nuevo/ajuste_entrada?motivo=devolucion_cliente&origen=${venta.id}`}
              className="btn btn-secondary"
            >
              <Undo2 className="size-4" />
              Registrar devolución
            </Link>
          )
        }
      />

      <section className="overflow-hidden rounded-2xl border border-brand-border bg-brand-card">
        <h2 className="flex items-center gap-2 px-6 pt-5 pb-3 font-semibold">
          <History className="size-4 text-slate-400" />
          Historia de la unidad
        </h2>
        {historial.isLoading ? (
          <LoadingBlock />
        ) : (
          <ol className="relative mx-6 mb-6 border-l border-brand-border">
            {movimientos.map((m) => (
              <li key={m.id} className="ml-5 py-3">
                <span className="absolute -left-1.5 mt-1.5 size-3 rounded-full border-2 border-brand-card bg-brand-cyan" />
                <div className="flex flex-wrap items-center gap-2">
                  <Link to={`/movimientos/${m.id}`} className="font-mono text-sm font-medium hover:text-brand-cyan">
                    {formatearNumero(m)}
                  </Link>
                  <TipoMovimientoBadge tipo={m.tipo} />
                  <span className="text-xs text-slate-500">{formatearFecha(m.fecha)}</span>
                </div>
                <p className="mt-0.5 text-sm text-slate-400">
                  {m.cliente?.nombre ?? m.proveedor?.nombre ?? (m.tipo === 'salida' ? 'Consumidor final' : m.notas)}
                  {m.referencia && <span className="text-slate-500"> · {m.referencia}</span>}
                </p>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  )
}

type VentaUnidad = NonNullable<ReturnType<typeof useHistorialUnidad>['data']>[number]

function Garantia({
  estadoUnidad,
  meses,
  venta,
  cargando,
  accion,
}: {
  estadoUnidad: string
  meses: number
  venta: VentaUnidad | undefined
  cargando: boolean
  accion: ReactNode
}) {
  if (cargando) return null

  if (!venta) {
    return (
      <Aviso
        icono={ShieldQuestion}
        clase="border-brand-border bg-brand-card text-slate-300"
        titulo="Sin venta registrada"
      >
        {estadoUnidad === 'disponible'
          ? 'La unidad está en bodega: la garantía empieza a contar el día que se venda.'
          : estadoUnidad === 'en_garantia'
            ? 'La unidad se envió a garantía (con el proveedor o en revisión) y aún no regresa: cuando vuelva, regístrala con un ajuste + «Regreso de garantía».'
            : 'La unidad no está vendida, así que no tiene una garantía en curso con un cliente.'}
        {meses > 0 && ` Su categoría tiene ${textoMeses(meses)} de garantía.`}
      </Aviso>
    )
  }

  const estado = estadoGarantia(venta.fecha, meses)
  const cliente = venta.cliente ? (
    <Link to={`/clientes/${venta.cliente.id}`} className="font-medium underline-offset-2 hover:underline">
      {venta.cliente.nombre}
    </Link>
  ) : (
    'consumidor final'
  )
  const datosVenta = (
    <>
      Vendida a {cliente} el {formatearFechaCorta(venta.fecha)} en la{' '}
      <Link to={`/movimientos/${venta.id}`} className="font-mono underline-offset-2 hover:underline">
        {formatearNumero(venta)}
      </Link>
      {venta.referencia && ` (factura ${venta.referencia})`}.
    </>
  )

  if (estado.tipo === 'sin_garantia') {
    return (
      <Aviso
        icono={ShieldOff}
        clase="border-brand-border bg-brand-card text-slate-300"
        titulo="Sin garantía"
        accion={accion}
      >
        {datosVenta} Su categoría no tiene meses de garantía configurados (Configuración → Categorías).
      </Aviso>
    )
  }
  if (estado.tipo === 'vencida') {
    return (
      <Aviso
        icono={ShieldAlert}
        clase="border-red-500/30 bg-red-500/10 text-red-300"
        titulo="Garantía vencida"
        accion={accion}
      >
        {datosVenta} La garantía de {textoMeses(meses)} venció el {formatearFechaCorta(estado.vence)}.
      </Aviso>
    )
  }
  return (
    <Aviso
      icono={ShieldCheck}
      clase="border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
      titulo={`En garantía hasta el ${formatearFechaCorta(estado.vence)}`}
      accion={accion}
    >
      {datosVenta} Le quedan {estado.diasRestantes} {estado.diasRestantes === 1 ? 'día' : 'días'} de los{' '}
      {textoMeses(meses)} de garantía.
    </Aviso>
  )
}

function Aviso({
  icono: Icono,
  clase,
  titulo,
  accion,
  children,
}: {
  icono: typeof ShieldCheck
  clase: string
  titulo: string
  accion?: ReactNode
  children: ReactNode
}) {
  return (
    <section className={`flex flex-wrap items-start gap-4 rounded-2xl border p-5 ${clase}`}>
      <Icono className="mt-0.5 size-6 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="font-display font-semibold">{titulo}</p>
        <p className="mt-1 text-sm opacity-90">{children}</p>
      </div>
      {accion}
    </section>
  )
}
