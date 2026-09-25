import { AlertTriangle, ArrowLeft, CheckCheck, Download, Search, XCircle } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { BotonEscanear, type ResultadoEscaneo } from '@/components/ui/Escaner'
import { LoadingBlock } from '@/components/ui/LoadingBlock'
import { mensajeError } from '@/lib/errores'
import { formatearFecha, formatearPrecio } from '@/lib/format'
import { useProductos } from '@/features/productos/api'
import { estadosUnidad } from '@/features/productos/estados'
import {
  useCancelarToma,
  useEscanearSerial,
  useFinalizarToma,
  useMovimientosDesde,
  useSumarConteo,
  useToma,
  useTomaProductos,
  useTomaSeriales,
} from './api'
import { EstadoTomaBadge } from './components/EstadoTomaBadge'
import { FilaProductoToma } from './components/FilaProductoToma'
import { calcularFilas, resumir } from './diferencias'
import { exportarToma } from './exportar'

type Vista = 'todos' | 'pendientes' | 'diferencias'

export function TomaDetallePage() {
  const { id = '' } = useParams()
  const toma = useToma(id)
  const enCurso = toma.data?.estado === 'en_curso'
  const productosToma = useTomaProductos(id, enCurso)
  const seriales = useTomaSeriales(id, enCurso)
  const productos = useProductos()
  const { data: movimientosDesde = 0 } = useMovimientosDesde(toma.data)

  const sumar = useSumarConteo(id)
  const escanear = useEscanearSerial(id)
  const finalizar = useFinalizarToma(id)
  const cancelar = useCancelarToma(id)

  const [busqueda, setBusqueda] = useState('')
  const [vista, setVista] = useState<Vista>('todos')
  const [confirmarFinalizar, setConfirmarFinalizar] = useState(false)
  const [confirmarCancelar, setConfirmarCancelar] = useState(false)

  const filas = useMemo(() => {
    const stock = new Map((productos.data ?? []).map((p) => [p.id, p.stock]))
    return calcularFilas(productosToma.data ?? [], seriales.data ?? [], stock, enCurso)
  }, [productos.data, productosToma.data, seriales.data, enCurso])
  const resumen = resumir(filas)

  const termino = busqueda.trim().toLowerCase()
  const visibles = filas.filter((f) => {
    if (vista === 'pendientes' && f.contado !== null) return false
    if (vista === 'diferencias' && f.sobrantes === 0 && f.faltantes === 0) return false
    if (!termino) return true
    const p = f.producto
    return (
      [p.nombre, p.sku, p.codigo_barras].some((v) => v?.toLowerCase().includes(termino)) ||
      f.seriales.some((s) => s.unidad.numero_serie.toLowerCase().includes(termino))
    )
  })

  /** Código de barras / SKU de un producto por cantidad → suma 1. Cualquier otro código se trata como serial */
  async function onEscaneado(codigo: string): Promise<ResultadoEscaneo> {
    const texto = codigo.trim()
    const porCodigo = productosToma.data?.find(
      (tp) => tp.producto.codigo_barras === texto || tp.producto.sku.toLowerCase() === texto.toLowerCase(),
    )
    try {
      if (porCodigo && !porCodigo.producto.es_serializado) {
        const total = await sumar.mutateAsync({ productoId: porCodigo.producto_id })
        return { ok: true, mensaje: `${porCodigo.producto.nombre}: ${total} contados` }
      }
      const r = await escanear.mutateAsync(texto)
      const aviso =
        r.estado === 'disponible'
          ? ''
          : ` · figuraba como «${estadosUnidad[r.estado].label}»: se reingresará al finalizar`
      return { ok: true, mensaje: r.producto + aviso }
    } catch (e) {
      if (porCodigo) {
        return {
          ok: false,
          mensaje: `${porCodigo.producto.nombre} lleva serial: escanea el serial de cada unidad, no el código del producto.`,
        }
      }
      return { ok: false, mensaje: mensajeError(e) }
    }
  }

  if (toma.isLoading || productosToma.isLoading) return <LoadingBlock />
  if (toma.error) return <p className="text-sm text-red-400">{mensajeError(toma.error)}</p>
  if (!toma.data) {
    return (
      <div className="p-10 text-center text-slate-400">
        <p>La toma de inventario no existe.</p>
        <Link to="/inventario" className="mt-3 inline-block text-brand-cyan hover:underline">
          Volver al listado
        </Link>
      </div>
    )
  }

  const t = toma.data
  const sinContar = resumen.total - resumen.contados
  const hayAjustes = resumen.sobrantes > 0 || resumen.faltantes > 0

  return (
    <>
      <Link to="/inventario" className="mb-4 inline-flex items-center gap-1 text-sm text-slate-400 hover:text-slate-200">
        <ArrowLeft className="size-4" />
        Tomas de inventario
      </Link>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-3 text-2xl font-bold">
            Toma #{t.numero}
            <EstadoTomaBadge estado={t.estado} />
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            {t.categoria_nombre ?? 'Todo el inventario'} · iniciada el {formatearFecha(t.created_at)}
            {t.cerrada_at && ` · cerrada el ${formatearFecha(t.cerrada_at)}`}
          </p>
          {t.notas && <p className="mt-1 text-sm text-slate-300">{t.notas}</p>}
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => exportarToma(t, filas, enCurso)}
            disabled={filas.length === 0}
            className="btn btn-secondary"
          >
            <Download className="size-4" />
            Excel (CSV)
          </button>
          {enCurso && (
            <>
              <BotonEscanear titulo="Contar escaneando" label="Escanear" continuo onDetectado={onEscaneado} className="btn-primary" />
              <button onClick={() => setConfirmarCancelar(true)} className="btn btn-secondary">
                <XCircle className="size-4" />
                Cancelar toma
              </button>
              <button
                onClick={() => setConfirmarFinalizar(true)}
                disabled={resumen.contados === 0}
                className="btn btn-primary"
                title={resumen.contados === 0 ? 'Cuenta al menos un producto' : undefined}
              >
                <CheckCheck className="size-4" />
                Finalizar
              </button>
            </>
          )}
        </div>
      </div>

      {enCurso && movimientosDesde > 0 && (
        <p className="mb-4 flex gap-2 rounded-lg bg-amber-500/10 px-4 py-3 text-sm text-amber-400">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span>
            Se {movimientosDesde === 1 ? 'ha registrado 1 movimiento' : `han registrado ${movimientosDesde} movimientos`}{' '}
            desde que empezó la toma. Las diferencias se calculan con el stock actual: si un producto se movió después
            de contarlo, vuelve a contarlo antes de finalizar.
          </span>
        </p>
      )}

      {t.estado === 'finalizada' && (
        <div className="mb-4 rounded-lg bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
          {t.ajuste_entrada_id || t.ajuste_salida_id ? (
            <>
              Ajustes generados:{' '}
              {t.ajuste_entrada_id && (
                <Link to={`/movimientos/${t.ajuste_entrada_id}`} className="font-medium underline">
                  sobrantes (ajuste +)
                </Link>
              )}
              {t.ajuste_entrada_id && t.ajuste_salida_id && ' y '}
              {t.ajuste_salida_id && (
                <Link to={`/movimientos/${t.ajuste_salida_id}`} className="font-medium underline">
                  faltantes (ajuste −)
                </Link>
              )}
              .
            </>
          ) : (
            'El conteo cuadró con el sistema: no hubo que hacer ajustes.'
          )}
        </div>
      )}

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Cifra label="Contados" valor={`${resumen.contados} / ${resumen.total}`} />
        <Cifra label="Sin contar" valor={sinContar} />
        <Cifra
          label="Sobrantes"
          valor={resumen.sobrantes > 0 ? `+${resumen.sobrantes} · ${formatearPrecio(resumen.valorSobrantes)}` : '0'}
        />
        <Cifra
          label="Faltantes"
          valor={resumen.faltantes > 0 ? `−${resumen.faltantes} · ${formatearPrecio(resumen.valorFaltantes)}` : '0'}
        />
      </div>

      <div className="mb-3 flex flex-wrap gap-3">
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-500" />
          <input
            type="search"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar producto, SKU, código o serial…"
            className="input pl-9"
          />
        </div>
        <select value={vista} onChange={(e) => setVista(e.target.value as Vista)} className="input w-48">
          <option value="todos">Todos ({resumen.total})</option>
          <option value="pendientes">Sin contar ({sinContar})</option>
          <option value="diferencias">Con diferencia ({resumen.productosConSobrante + resumen.productosConFaltante})</option>
        </select>
      </div>

      <div className="overflow-hidden rounded-2xl border border-brand-border bg-brand-card">
        {productosToma.error ? (
          <p className="p-6 text-sm text-red-400">{mensajeError(productosToma.error)}</p>
        ) : visibles.length === 0 ? (
          <p className="p-10 text-center text-sm text-slate-500">Ningún producto coincide.</p>
        ) : (
          <ul className="divide-y divide-brand-border">
            {visibles.map((fila) => (
              <FilaProductoToma key={fila.producto.id} fila={fila} tomaId={id} enCurso={enCurso} />
            ))}
          </ul>
        )}
      </div>

      <ConfirmDialog
        open={confirmarFinalizar}
        title={`Finalizar la toma #${t.numero}`}
        confirmLabel={hayAjustes ? 'Finalizar y ajustar' : 'Finalizar'}
        pending={finalizar.isPending}
        error={finalizar.error ? mensajeError(finalizar.error) : null}
        onConfirm={() => finalizar.mutate(undefined, { onSuccess: () => setConfirmarFinalizar(false) })}
        onClose={() => {
          finalizar.reset()
          setConfirmarFinalizar(false)
        }}
      >
        {hayAjustes ? (
          <ul className="space-y-2">
            {resumen.sobrantes > 0 && (
              <li>
                <strong className="text-emerald-400">Ajuste +</strong> por {resumen.sobrantes} unidades en{' '}
                {resumen.productosConSobrante} producto(s) · {formatearPrecio(resumen.valorSobrantes)} a costo.
              </li>
            )}
            {resumen.faltantes > 0 && (
              <li>
                <strong className="text-red-400">Ajuste −</strong> por {resumen.faltantes} unidades en{' '}
                {resumen.productosConFaltante} producto(s) · {formatearPrecio(resumen.valorFaltantes)} a costo. Los
                seriales faltantes quedarán «De baja».
              </li>
            )}
          </ul>
        ) : (
          <p>Todo lo contado cuadra con el sistema: no se generarán ajustes.</p>
        )}
        {sinContar > 0 && (
          <p className="mt-3 text-amber-400">
            {sinContar} producto(s) sin contar no se ajustarán.
          </p>
        )}
        <p className="mt-3 text-slate-400">Los ajustes son definitivos: si algo queda mal, se corrige con otro ajuste.</p>
      </ConfirmDialog>

      <ConfirmDialog
        open={confirmarCancelar}
        title={`Cancelar la toma #${t.numero}`}
        confirmLabel="Cancelar toma"
        danger
        pending={cancelar.isPending}
        error={cancelar.error ? mensajeError(cancelar.error) : null}
        onConfirm={() => cancelar.mutate(undefined, { onSuccess: () => setConfirmarCancelar(false) })}
        onClose={() => {
          cancelar.reset()
          setConfirmarCancelar(false)
        }}
      >
        Se descarta el conteo y el inventario queda como está. Esta acción no se puede deshacer.
      </ConfirmDialog>
    </>
  )
}

function Cifra({ label, valor }: { label: string; valor: string | number }) {
  return (
    <div className="rounded-2xl border border-brand-border bg-brand-card px-4 py-3">
      <p className="text-xs tracking-wide text-slate-400 uppercase">{label}</p>
      <p className="mt-1 text-lg font-semibold">{valor}</p>
    </div>
  )
}
