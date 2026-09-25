import { ChevronDown, Download, FileSpreadsheet, FileText, FileType, Loader2, type LucideIcon } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { exportarDocumento, type DocumentoExportable, type FormatoExportacion } from '@/lib/exportar'
import { mensajeError } from '@/lib/errores'

const FORMATOS: { formato: FormatoExportacion; label: string; detalle: string; icono: LucideIcon }[] = [
  { formato: 'excel', label: 'Excel', detalle: '.csv', icono: FileSpreadsheet },
  { formato: 'pdf', label: 'PDF', detalle: '.pdf', icono: FileText },
  { formato: 'word', label: 'Word', detalle: '.doc', icono: FileType },
]

interface MenuExportarProps {
  /** Se llama al elegir el formato, así los datos se arman solo cuando hacen falta */
  documento: () => DocumentoExportable
  disabled?: boolean
  className?: string
}

/** Botón «Exportar» con la lista de formatos: Excel, PDF y Word */
export function MenuExportar({ documento, disabled, className = '' }: MenuExportarProps) {
  const [abierto, setAbierto] = useState(false)
  const [generando, setGenerando] = useState<FormatoExportacion | null>(null)
  const [error, setError] = useState<string | null>(null)
  const contenedor = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!abierto) return
    const cerrarFuera = (e: PointerEvent) => {
      if (!contenedor.current?.contains(e.target as Node)) setAbierto(false)
    }
    const cerrarEscape = (e: KeyboardEvent) => e.key === 'Escape' && setAbierto(false)
    document.addEventListener('pointerdown', cerrarFuera)
    document.addEventListener('keydown', cerrarEscape)
    return () => {
      document.removeEventListener('pointerdown', cerrarFuera)
      document.removeEventListener('keydown', cerrarEscape)
    }
  }, [abierto])

  async function exportar(formato: FormatoExportacion) {
    setAbierto(false)
    setError(null)
    setGenerando(formato)
    try {
      await exportarDocumento(formato, documento())
    } catch (e) {
      setError(`No se pudo exportar: ${mensajeError(e)}`)
    } finally {
      setGenerando(null)
    }
  }

  return (
    <div ref={contenedor} className={`relative print:hidden ${className}`}>
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        disabled={disabled || generando !== null}
        aria-haspopup="menu"
        aria-expanded={abierto}
        className="btn btn-secondary"
      >
        {generando ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
        Exportar
        <ChevronDown className={`size-4 transition-transform ${abierto ? 'rotate-180' : ''}`} />
      </button>

      {abierto && (
        <div
          role="menu"
          className="absolute right-0 z-30 mt-1 w-44 overflow-hidden rounded-xl border border-brand-border bg-brand-card py-1 shadow-xl"
        >
          {FORMATOS.map(({ formato, label, detalle, icono: Icono }) => (
            <button
              key={formato}
              type="button"
              role="menuitem"
              onClick={() => exportar(formato)}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-200 hover:bg-white/5"
            >
              <Icono className="size-4 text-slate-400" />
              {label}
              <span className="ml-auto text-xs text-slate-500">{detalle}</span>
            </button>
          ))}
        </div>
      )}

      {error && <p className="absolute right-0 mt-1 w-64 text-right text-xs text-red-400">{error}</p>}
    </div>
  )
}
