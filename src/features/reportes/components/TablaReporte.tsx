import { Loader2, Printer, type LucideIcon } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { LoadingBlock } from '@/components/ui/LoadingBlock'
import { LogoImpresion } from '@/components/ui/Logo'
import { MenuExportar } from '@/components/ui/MenuExportar'
import { mensajeError } from '@/lib/errores'
import { imprimirDocumento, type Celda, type DocumentoExportable } from '@/lib/exportar'

/** Una misma definición alimenta la tabla en pantalla, la impresión y la exportación (Excel, PDF, Word) */
export interface Columna<T> {
  titulo: string
  /** Valor crudo: es lo que va al Excel y lo que se suma en los totales */
  valor: (fila: T) => Celda
  /** Cómo se muestra en pantalla (por defecto, el valor crudo) */
  mostrar?: (fila: T) => ReactNode
  numerica?: boolean
  /** Formato para la fila de totales; si se define, la columna se suma */
  total?: (suma: number) => ReactNode
  className?: string
}

interface TablaReporteProps<T> {
  columnas: Columna<T>[]
  filas: T[]
  clave: (fila: T) => string
  vacio: string
}

export function TablaReporte<T>({ columnas, filas, clave, vacio }: TablaReporteProps<T>) {
  if (filas.length === 0) return <p className="p-10 text-center text-sm text-slate-500">{vacio}</p>

  const hayTotales = columnas.some((c) => c.total)
  const alinear = (c: Columna<T>) => (c.numerica ? 'text-right tabular-nums' : 'text-left')

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="border-b border-brand-border text-xs tracking-wide text-slate-400 uppercase">
          <tr>
            {columnas.map((c) => (
              <th key={c.titulo} className={`px-4 py-3 font-medium whitespace-nowrap ${alinear(c)}`}>
                {c.titulo}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-brand-border">
          {filas.map((fila) => (
            <tr key={clave(fila)} className="break-inside-avoid">
              {columnas.map((c) => (
                <td key={c.titulo} className={`px-4 py-2.5 ${alinear(c)} ${c.className ?? 'text-slate-300'}`}>
                  {c.mostrar ? c.mostrar(fila) : (c.valor(fila) ?? '—')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        {hayTotales && (
          <tfoot className="border-t-2 border-brand-border font-semibold">
            <tr>
              {columnas.map((c, i) => (
                <td key={c.titulo} className={`px-4 py-3 whitespace-nowrap ${alinear(c)}`}>
                  {c.total
                    ? c.total(filas.reduce((suma, fila) => suma + (Number(c.valor(fila)) || 0), 0))
                    : i === 0 && `Total (${filas.length})`}
                </td>
              ))}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  )
}

// ---------------------------------------------------------------------
// Estructura común de cada reporte
// ---------------------------------------------------------------------

interface ReporteProps {
  titulo: string
  /** Rango o filtros aplicados, para el encabezado impreso */
  subtitulo?: string
  filtros: ReactNode
  resumen?: ReactNode
  aviso?: ReactNode
  cargando: boolean
  error: unknown
  /** Datos a exportar (el título y el subtítulo los pone el reporte) */
  exportar: () => Omit<DocumentoExportable, 'titulo' | 'subtitulo'>
  puedeExportar: boolean
  children: ReactNode
}

export function Reporte({
  titulo,
  subtitulo,
  filtros,
  resumen,
  aviso,
  cargando,
  error,
  exportar,
  puedeExportar,
  children,
}: ReporteProps) {
  const [imprimiendo, setImprimiendo] = useState(false)
  const [errorImpresion, setErrorImpresion] = useState<string | null>(null)
  const documento = () => ({ titulo, subtitulo, ...exportar() })

  /** Imprime el mismo PDF que se exporta: lo impreso y el archivo son idénticos */
  async function imprimir() {
    setImprimiendo(true)
    setErrorImpresion(null)
    try {
      await imprimirDocumento(documento())
    } catch (e) {
      setErrorImpresion(`No se pudo imprimir: ${mensajeError(e)}`)
    } finally {
      setImprimiendo(false)
    }
  }

  return (
    <div className="reporte-impreso">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3 print:hidden">
        <div className="flex flex-wrap items-end gap-3">{filtros}</div>
        <div className="flex gap-2">
          <MenuExportar documento={documento} disabled={!puedeExportar} />
          <button onClick={imprimir} disabled={!puedeExportar || imprimiendo} className="btn btn-secondary">
            {imprimiendo ? <Loader2 className="size-4 animate-spin" /> : <Printer className="size-4" />}
            Imprimir
          </button>
        </div>
      </div>

      {errorImpresion && (
        <p role="alert" className="mb-4 rounded-lg bg-red-500/10 px-4 py-3 text-sm text-red-400 print:hidden">
          {errorImpresion}
        </p>
      )}

      <div className="mb-4 hidden print:block">
        <LogoImpresion className="mb-3" />
        <h2 className="text-xl font-bold">{titulo}</h2>
        {subtitulo && <p className="text-sm">{subtitulo}</p>}
        <p className="text-xs">Generado el {new Date().toLocaleString('es-CO')}</p>
      </div>

      {aviso && (
        <p className="mb-4 rounded-lg bg-amber-500/10 px-4 py-3 text-sm text-amber-400 print:hidden">{aviso}</p>
      )}

      {cargando ? (
        <LoadingBlock />
      ) : error ? (
        <p className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400">
          {mensajeError(error)}
        </p>
      ) : (
        <>
          {resumen && <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">{resumen}</div>}
          <div className="overflow-hidden rounded-2xl border border-brand-border bg-brand-card">{children}</div>
        </>
      )}
    </div>
  )
}

interface CifraProps {
  label: string
  valor: ReactNode
  icono?: LucideIcon
  /** Clases de color del icono (fondo y texto), p. ej. las de tiposMovimiento */
  tono?: string
  /** Línea secundaria bajo la cifra */
  detalle?: ReactNode
  /** Contenido extra al pie de la tarjeta (chips, barra de proporción...) */
  children?: ReactNode
}

export function Cifra({ label, valor, icono: Icono, tono = 'bg-slate-500/15 text-slate-400', detalle, children }: CifraProps) {
  return (
    <div className="flex flex-col rounded-2xl border border-brand-border bg-brand-card px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs tracking-wide text-slate-400 uppercase">{label}</p>
          <p className="mt-1 text-lg font-semibold">{valor}</p>
          {detalle && <p className="mt-0.5 truncate text-xs text-slate-500">{detalle}</p>}
        </div>
        {Icono && (
          <span className={`grid size-9 shrink-0 place-items-center rounded-xl ${tono}`}>
            <Icono className="size-4.5" />
          </span>
        )}
      </div>
      {children && <div className="mt-auto pt-3">{children}</div>}
    </div>
  )
}
