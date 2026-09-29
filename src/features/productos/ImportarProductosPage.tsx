import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  FileDown,
  FileSpreadsheet,
  Loader2,
  Upload,
  XCircle,
} from 'lucide-react'
import { useMemo, useRef, useState, type ChangeEvent, type DragEvent } from 'react'
import { Link } from 'react-router-dom'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { EstadoVacio } from '@/components/ui/EstadoVacio'
import { PageHeader } from '@/components/ui/PageHeader'
import { mensajeError } from '@/lib/errores'
import { descargarCsv } from '@/lib/exportar'
import { formatearPrecio } from '@/lib/format'
import { useCategorias, useImportarProductos, useProductos } from './api'
import { leerProductos, paraServidor, parsearCsv, plantilla, type Celda, type ResultadoLectura } from './importar'

/** Mismo tope que importar_productos() en el servidor */
const MAXIMO = 2000

async function leerArchivo(archivo: File): Promise<Celda[][]> {
  if (/\.xlsx$/i.test(archivo.name)) {
    // El lector de Excel solo se descarga al importar
    const { readSheet } = await import('read-excel-file/browser')
    return (await readSheet(archivo)) as Celda[][]
  }
  if (/\.(csv|txt|tsv)$/i.test(archivo.name)) return parsearCsv(await archivo.text())
  throw new Error(
    'Formato no soportado: usa un archivo de Excel (.xlsx) o CSV. Si es .xls, ábrelo en Excel y guárdalo como .xlsx.',
  )
}

export function ImportarProductosPage() {
  const { data: categorias = [] } = useCategorias()
  const { data: productosExistentes = [] } = useProductos()
  const importar = useImportarProductos()
  const input = useRef<HTMLInputElement>(null)

  const [archivo, setArchivo] = useState<string | null>(null)
  const [tabla, setTabla] = useState<Celda[][] | null>(null)
  const [errorLectura, setErrorLectura] = useState<string | null>(null)
  const [leyendo, setLeyendo] = useState(false)
  const [arrastrando, setArrastrando] = useState(false)
  const [confirmando, setConfirmando] = useState(false)
  const [soloErrores, setSoloErrores] = useState(false)

  // Se recalcula si cambian las categorías o los productos (p. ej. tras crear una categoría que faltaba)
  const lectura: ResultadoLectura | null = useMemo(
    () =>
      tabla &&
      leerProductos(tabla, {
        categorias: categorias.map((c) => c.nombre),
        codigosExistentes: new Set(productosExistentes.flatMap((p) => (p.codigo_barras ? [p.codigo_barras] : []))),
        nombresExistentes: new Set(productosExistentes.map((p) => p.nombre.toLowerCase())),
      }),
    [tabla, categorias, productosExistentes],
  )

  const productos = lectura?.productos ?? []
  const conError = productos.filter((p) => p.errores.length > 0)
  const conAviso = productos.filter((p) => p.avisos.length > 0)
  const conStock = productos.filter((p) => p.stock_inicial > 0)
  const valorStock = conStock.reduce((s, p) => s + p.stock_inicial * p.costo, 0)
  const demasiados = productos.length > MAXIMO
  const listo =
    lectura && lectura.faltantes.length === 0 && productos.length > 0 && conError.length === 0 && !demasiados
  const visibles = soloErrores ? productos.filter((p) => p.errores.length || p.avisos.length) : productos

  async function cargar(file: File | undefined) {
    if (!file) return
    setLeyendo(true)
    setErrorLectura(null)
    setTabla(null)
    importar.reset()
    try {
      setTabla(await leerArchivo(file))
      setArchivo(file.name)
    } catch (e) {
      setErrorLectura(e instanceof Error ? e.message : 'No se pudo leer el archivo.')
      setArchivo(null)
    } finally {
      setLeyendo(false)
    }
  }

  function onArchivo(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    void cargar(file)
  }

  function onSoltar(e: DragEvent) {
    e.preventDefault()
    setArrastrando(false)
    void cargar(e.dataTransfer.files[0])
  }

  function confirmarImportacion() {
    importar.mutate(productos.map(paraServidor), { onSuccess: () => setConfirmando(false) })
  }

  function descargarPlantilla() {
    const { columnas, filas } = plantilla()
    descargarCsv('plantilla_productos', columnas, filas)
  }

  if (importar.data) {
    return (
      <>
        <PageHeader title="Importar productos" />
        <section className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10">
          <EstadoVacio
            icono={CheckCircle2}
            titulo={`Se importaron ${importar.data.creados} productos`}
            descripcion={
              importar.data.ajuste_id
                ? 'Su stock inicial quedó registrado en un ajuste + «Inventario inicial».'
                : 'No traían stock inicial: sus existencias entrarán con las entradas.'
            }
            accion={
              <div className="flex flex-wrap justify-center gap-2">
                {importar.data.ajuste_id && (
                  <Link to={`/movimientos/${importar.data.ajuste_id}`} className="btn btn-secondary">
                    Ver el ajuste
                  </Link>
                )}
                <Link to="/productos" className="btn btn-primary">
                  Ir a productos
                </Link>
              </div>
            }
          />
        </section>
      </>
    )
  }

  return (
    <>
      <Link to="/productos" className="mb-4 inline-flex items-center gap-1 text-sm text-slate-400 hover:text-slate-200">
        <ArrowLeft className="size-4" />
        Productos
      </Link>
      <PageHeader
        title="Importar productos"
        description="Crea muchos productos de una vez desde Excel o CSV, con su stock inicial"
        actions={
          <button onClick={descargarPlantilla} className="btn btn-secondary">
            <FileDown className="size-4" />
            Descargar plantilla
          </button>
        }
      />

      <ol className="mb-6 grid gap-3 text-sm text-slate-400 md:grid-cols-3">
        <Paso n={1}>Descarga la plantilla y llénala en Excel: una fila por producto. El SKU lo pone la app.</Paso>
        <Paso n={2}>La categoría debe existir (Configuración → Categorías). «Con serial»: Sí o No.</Paso>
        <Paso n={3}>
          El stock inicial entra como ajuste «Inventario inicial» al costo indicado. Los productos con serial van sin
          stock.
        </Paso>
      </ol>

      <div
        onDragOver={(e) => {
          e.preventDefault()
          setArrastrando(true)
        }}
        onDragLeave={() => setArrastrando(false)}
        onDrop={onSoltar}
        className={`mb-6 flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed p-8 text-center transition ${
          arrastrando ? 'border-brand-cyan bg-brand-cyan/5' : 'border-brand-border bg-brand-card'
        }`}
      >
        {leyendo ? (
          <Loader2 className="size-8 animate-spin text-brand-accent" />
        ) : (
          <FileSpreadsheet className="size-8 text-brand-cyan" strokeWidth={1.75} />
        )}
        <p className="text-sm text-slate-300">
          {archivo ? (
            <>
              Archivo: <strong>{archivo}</strong>
            </>
          ) : (
            'Arrastra aquí el archivo o elígelo'
          )}
        </p>
        <button onClick={() => input.current?.click()} className="btn btn-primary" disabled={leyendo}>
          <Upload className="size-4" />
          {archivo ? 'Elegir otro archivo' : 'Elegir archivo'}
        </button>
        <p className="text-xs text-slate-500">Excel (.xlsx) o CSV · hasta {MAXIMO} productos</p>
        <input ref={input} type="file" accept=".xlsx,.csv,.txt,.tsv" className="hidden" onChange={onArchivo} />
      </div>

      {errorLectura && <Alerta tipo="error">{errorLectura}</Alerta>}

      {lectura && lectura.faltantes.length > 0 && (
        <Alerta tipo="error">
          Al archivo le faltan las columnas: <strong>{lectura.faltantes.join(', ')}</strong>. Usa los títulos de la
          plantilla.
        </Alerta>
      )}
      {lectura && lectura.ignoradas.length > 0 && (
        <Alerta tipo="aviso">Estas columnas no se reconocieron y se ignorarán: {lectura.ignoradas.join(', ')}.</Alerta>
      )}
      {lectura && lectura.faltantes.length === 0 && productos.length === 0 && (
        <Alerta tipo="aviso">El archivo no tiene productos debajo de los títulos.</Alerta>
      )}
      {demasiados && (
        <Alerta tipo="error">
          El archivo tiene {productos.length} productos: divide la importación en archivos de hasta {MAXIMO}.
        </Alerta>
      )}

      {productos.length > 0 && (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Cifra label="Productos" valor={productos.length} />
            <Cifra label="Con errores" valor={conError.length} alerta={conError.length > 0} />
            <Cifra label="Con stock inicial" valor={conStock.length} />
            <Cifra label="Valor del stock inicial" valor={formatearPrecio(valorStock)} />
          </div>

          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-300">
              <input
                type="checkbox"
                checked={soloErrores}
                onChange={(e) => setSoloErrores(e.target.checked)}
                className="size-4 accent-brand-accent"
              />
              Ver solo filas con errores o avisos ({conError.length + conAviso.filter((p) => !p.errores.length).length})
            </label>
            <button onClick={() => setConfirmando(true)} disabled={!listo} className="btn btn-primary">
              <Upload className="size-4" />
              Importar {productos.length} productos
            </button>
          </div>
          {conError.length > 0 && (
            <Alerta tipo="error">
              Corrige las filas marcadas en el archivo y vuelve a cargarlo. No se importa nada hasta que no haya
              errores.
            </Alerta>
          )}

          <div className="overflow-x-auto rounded-2xl border border-brand-border bg-brand-card">
            <table className="w-full text-sm">
              <thead className="border-b border-brand-border text-left text-xs tracking-wide text-slate-400 uppercase">
                <tr>
                  <th className="px-3 py-3 font-medium">Fila</th>
                  <th className="px-3 py-3 font-medium">Producto</th>
                  <th className="px-3 py-3 font-medium">Categoría</th>
                  <th className="px-3 py-3 font-medium">Serial</th>
                  <th className="px-3 py-3 text-right font-medium">Precio</th>
                  <th className="px-3 py-3 text-right font-medium">Costo</th>
                  <th className="px-3 py-3 text-right font-medium">Mín.</th>
                  <th className="px-3 py-3 text-right font-medium">Stock</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-border">
                {visibles.slice(0, 500).map((p) => (
                  <tr key={p.fila} className={`align-top ${p.errores.length ? 'bg-red-500/[0.06]' : ''}`}>
                    <td className="px-3 py-2.5 text-slate-500 tabular-nums">{p.fila}</td>
                    <td className="px-3 py-2.5">
                      <p className="font-medium">{p.nombre || <span className="text-slate-500">(sin nombre)</span>}</p>
                      {(p.marca || p.modelo) && (
                        <p className="text-xs text-slate-500">{[p.marca, p.modelo].filter(Boolean).join(' ')}</p>
                      )}
                      {p.errores.map((e) => (
                        <p key={e} className="mt-1 flex items-start gap-1 text-xs text-red-400">
                          <XCircle className="mt-0.5 size-3 shrink-0" />
                          {e}
                        </p>
                      ))}
                      {p.avisos.map((a) => (
                        <p key={a} className="mt-1 flex items-start gap-1 text-xs text-amber-400">
                          <AlertTriangle className="mt-0.5 size-3 shrink-0" />
                          {a}
                        </p>
                      ))}
                    </td>
                    <td className="px-3 py-2.5 text-slate-300">{p.categoria}</td>
                    <td className="px-3 py-2.5 text-slate-300">{p.es_serializado ? 'Sí' : 'No'}</td>
                    <td className="px-3 py-2.5 text-right whitespace-nowrap text-slate-300">
                      {formatearPrecio(p.precio_venta)}
                    </td>
                    <td className="px-3 py-2.5 text-right whitespace-nowrap text-slate-300">
                      {formatearPrecio(p.costo)}
                    </td>
                    <td className="px-3 py-2.5 text-right text-slate-300 tabular-nums">{p.stock_minimo}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{p.stock_inicial || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {visibles.length > 500 && (
              <p className="border-t border-brand-border px-4 py-3 text-xs text-slate-500">
                Se muestran las primeras 500 filas de {visibles.length}. Se importarán todas.
              </p>
            )}
          </div>
        </>
      )}

      <ConfirmDialog
        open={confirmando}
        title="Importar productos"
        confirmLabel="Importar"
        pending={importar.isPending}
        error={importar.error && mensajeError(importar.error)}
        onConfirm={confirmarImportacion}
        onClose={() => {
          importar.reset()
          setConfirmando(false)
        }}
      >
        <p>
          Se crearán <strong>{productos.length}</strong> productos
          {conStock.length > 0 && (
            <>
              {' '}
              y se registrará el stock inicial de <strong>{conStock.length}</strong> por{' '}
              <strong>{formatearPrecio(valorStock)}</strong>
            </>
          )}
          .
        </p>
        {conAviso.length > 0 && (
          <p className="mt-2 text-amber-400">{conAviso.length} fila(s) tienen avisos: revísalas antes de seguir.</p>
        )}
        <p className="mt-3 text-slate-400">Es todo o nada: si algo falla, no se crea ningún producto.</p>
      </ConfirmDialog>
    </>
  )
}

function Paso({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-3 rounded-xl border border-brand-border bg-brand-card p-4">
      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-brand-accent/20 text-xs font-semibold text-brand-cyan">
        {n}
      </span>
      <span>{children}</span>
    </li>
  )
}

function Alerta({ tipo, children }: { tipo: 'error' | 'aviso'; children: React.ReactNode }) {
  return (
    <p
      role={tipo === 'error' ? 'alert' : undefined}
      className={`mb-4 rounded-lg px-4 py-3 text-sm ${tipo === 'error' ? 'bg-red-500/10 text-red-400' : 'bg-amber-500/10 text-amber-400'}`}
    >
      {children}
    </p>
  )
}

function Cifra({ label, valor, alerta }: { label: string; valor: React.ReactNode; alerta?: boolean }) {
  return (
    <div
      className={`rounded-xl border bg-brand-card px-4 py-3 ${alerta ? 'border-red-500/40' : 'border-brand-border'}`}
    >
      <p className="text-xs text-slate-400">{label}</p>
      <p className={`mt-1 font-display text-xl font-semibold ${alerta ? 'text-red-400' : ''}`}>{valor}</p>
    </div>
  )
}
