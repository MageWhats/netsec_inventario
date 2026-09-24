import { ClipboardPaste, Plus, X } from 'lucide-react'
import { useRef, useState, type SyntheticEvent } from 'react'
import { BotonEscanear, type ResultadoEscaneo } from '@/components/ui/Escaner'
import { macValida, normalizarMac, normalizarSerial, parsearSeriales, type SerieNueva } from '../lineas'

interface SerialesNuevosInputProps {
  series: SerieNueva[]
  onChange: (series: SerieNueva[]) => void
}

/**
 * Captura de seriales nuevos: uno a uno (compatible con lector de código de barras, que "escribe" el
 * serial y pulsa Enter), con la cámara del teléfono o pegando una lista desde Excel.
 */
export function SerialesNuevosInput({ series, onChange }: SerialesNuevosInputProps) {
  const serialRef = useRef<HTMLInputElement>(null)
  const [serial, setSerial] = useState('')
  const [mac, setMac] = useState('')
  const [pegando, setPegando] = useState(false)
  const [textoPegado, setTextoPegado] = useState('')
  const [aviso, setAviso] = useState<string | null>(null)

  /** Agrega seriales ignorando los repetidos; devuelve cuántos se descartaron */
  function agregar(nuevas: SerieNueva[]) {
    const existentes = new Set(series.map((s) => s.numero_serie))
    const aceptadas: SerieNueva[] = []
    for (const s of nuevas) {
      if (existentes.has(s.numero_serie)) continue
      existentes.add(s.numero_serie)
      aceptadas.push(s)
    }
    onChange([...series, ...aceptadas])
    return nuevas.length - aceptadas.length
  }

  function onAgregarUno(e: SyntheticEvent) {
    e.preventDefault()
    const numero = normalizarSerial(serial)
    if (!numero) return
    if (!macValida(mac)) {
      setAviso('MAC inválida: usa el formato AA:BB:CC:DD:EE:FF')
      return
    }
    const repetidos = agregar([{ numero_serie: numero, mac: normalizarMac(mac) }])
    setAviso(repetidos ? `El serial ${numero} ya está en la lista.` : null)
    setSerial('')
    setMac('')
    serialRef.current?.focus()
  }

  function onEscaneado(codigo: string): ResultadoEscaneo {
    const numero = normalizarSerial(codigo)
    const repetidos = agregar([{ numero_serie: numero, mac: '' }])
    return repetidos
      ? { ok: false, mensaje: 'Ya está en la lista.' }
      : { ok: true, mensaje: `Agregado (${series.length + 1} en total)` }
  }

  function onAgregarPegados() {
    const parseadas = parsearSeriales(textoPegado)
    const repetidos = agregar(parseadas)
    setAviso(repetidos ? `Se omitieron ${repetidos} serial(es) repetido(s).` : null)
    setTextoPegado('')
    setPegando(false)
  }

  return (
    <div className="space-y-3">
      {/* No es un <form> anidado: Enter en los campos agrega el serial */}
      <div className="flex flex-wrap gap-2">
        <input
          ref={serialRef}
          value={serial}
          onChange={(e) => setSerial(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && onAgregarUno(e)}
          placeholder="Escanea o escribe el serial y pulsa Enter"
          className="input min-w-48 flex-1 font-mono uppercase"
          aria-label="Número de serie"
        />
        <input
          value={mac}
          onChange={(e) => setMac(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && onAgregarUno(e)}
          placeholder="MAC (opcional)"
          className="input w-52 font-mono uppercase"
          aria-label="MAC"
        />
        <button type="button" onClick={onAgregarUno} className="btn btn-secondary">
          <Plus className="size-4" />
          Agregar
        </button>
        <BotonEscanear titulo="Escanear seriales" label="Cámara" continuo onDetectado={onEscaneado} />
        <button type="button" onClick={() => setPegando((v) => !v)} className="btn btn-secondary">
          <ClipboardPaste className="size-4" />
          Pegar lista
        </button>
      </div>

      {pegando && (
        <div className="space-y-2 rounded-lg border border-brand-border p-3">
          <p className="text-xs text-slate-400">
            Un serial por línea. Para incluir la MAC: <code className="text-brand-cyan">SERIAL,MAC</code> (también
            sirve copiar dos columnas de Excel).
          </p>
          <textarea
            value={textoPegado}
            onChange={(e) => setTextoPegado(e.target.value)}
            rows={5}
            className="input font-mono text-xs"
            placeholder={'SN001,AA:BB:CC:DD:EE:01\nSN002,AA:BB:CC:DD:EE:02\nSN003'}
          />
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setPegando(false)} className="btn btn-secondary">
              Cancelar
            </button>
            <button type="button" onClick={onAgregarPegados} disabled={!textoPegado.trim()} className="btn btn-primary">
              Agregar {parsearSeriales(textoPegado).length || ''} seriales
            </button>
          </div>
        </div>
      )}

      {aviso && <p className="text-xs text-amber-400">{aviso}</p>}

      {series.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {series.map((s) => (
            <li
              key={s.numero_serie}
              className={`inline-flex items-center gap-2 rounded-lg border px-2 py-1 font-mono text-xs ${
                macValida(s.mac) ? 'border-brand-border' : 'border-red-500/60'
              }`}
            >
              <span>{s.numero_serie}</span>
              {s.mac && <span className={macValida(s.mac) ? 'text-slate-500' : 'text-red-400'}>{s.mac}</span>}
              <button
                type="button"
                onClick={() => onChange(series.filter((x) => x.numero_serie !== s.numero_serie))}
                className="text-slate-500 hover:text-red-400"
                aria-label={`Quitar ${s.numero_serie}`}
              >
                <X className="size-3" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
