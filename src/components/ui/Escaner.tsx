import { CameraOff, CheckCircle2, Flashlight, FlashlightOff, Loader2, ScanBarcode, X, XCircle } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { obtenerDetector, pitido } from '@/lib/escaner'

export interface ResultadoEscaneo {
  ok: boolean
  /** Se muestra bajo la cámara; en modo continuo sirve para confirmar cada lectura */
  mensaje?: string
}

interface EscanerProps {
  titulo: string
  /** La cámara sigue abierta para leer varios códigos seguidos (p. ej. seriales) */
  continuo?: boolean
  /**
   * Recibe cada código leído. Puede ser asíncrono (p. ej. validar en el servidor): mientras
   * responde, la cámara no procesa más lecturas. En modo simple, se cierra al primer resultado ok.
   */
  onDetectado: (codigo: string) => ResultadoEscaneo | Promise<ResultadoEscaneo>
}

/** Botón que abre la cámara del teléfono para leer códigos de barras o QR */
export function BotonEscanear({ label, className = '', ...props }: EscanerProps & { label?: string; className?: string }) {
  const [abierto, setAbierto] = useState(false)

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className={`btn btn-secondary ${className}`}
        title={props.titulo}
        aria-label={label ? undefined : props.titulo}
      >
        <ScanBarcode className="size-4" />
        {label}
      </button>
      {abierto && <EscanerCamara {...props} onClose={() => setAbierto(false)} />}
    </>
  )
}

/** Mismo código leído dos veces en este lapso cuenta como una sola lectura */
const PAUSA_REPETIDO_MS = 2500
const INTERVALO_MS = 150

function EscanerCamara({ titulo, continuo = false, onDetectado, onClose }: EscanerProps & { onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const trackRef = useRef<MediaStreamTrack | null>(null)
  const [estado, setEstado] = useState<'iniciando' | 'activo' | 'error'>('iniciando')
  const [error, setError] = useState('')
  const [ultimo, setUltimo] = useState<(ResultadoEscaneo & { codigo: string }) | null>(null)
  const [lecturas, setLecturas] = useState(0)
  const [hayLinterna, setHayLinterna] = useState(false)
  const [linterna, setLinterna] = useState(false)
  const [manual, setManual] = useState('')

  // Refs para que el bucle de lectura use siempre la versión más reciente de las props
  const onDetectadoRef = useRef(onDetectado)
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onDetectadoRef.current = onDetectado
    onCloseRef.current = onClose
  })
  const repetidoRef = useRef({ codigo: '', hora: 0 })
  const ocupadoRef = useRef(false)
  const [procesando, setProcesando] = useState(false)

  async function procesar(codigo: string) {
    const ahora = Date.now()
    if (ocupadoRef.current) return
    if (codigo === repetidoRef.current.codigo && ahora - repetidoRef.current.hora < PAUSA_REPETIDO_MS) return
    repetidoRef.current = { codigo, hora: ahora }

    ocupadoRef.current = true
    setProcesando(true)
    let resultado: ResultadoEscaneo
    try {
      resultado = await onDetectadoRef.current(codigo)
    } catch (e) {
      resultado = { ok: false, mensaje: e instanceof Error ? e.message : 'No se pudo procesar el código.' }
    } finally {
      ocupadoRef.current = false
      setProcesando(false)
      // La pausa por repetido cuenta desde que terminó de procesarse
      repetidoRef.current.hora = Date.now()
    }
    pitido(resultado.ok)
    setUltimo({ ...resultado, codigo })
    if (resultado.ok) setLecturas((n) => n + 1)
    if (resultado.ok && !continuo) onCloseRef.current()
  }

  useEffect(() => {
    let cancelado = false
    let temporizador: number | undefined
    let stream: MediaStream | null = null

    async function iniciar() {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        throw new Error(
          'La cámara solo funciona en páginas seguras (HTTPS). En desarrollo, abre la app en el teléfono con "npm run dev:movil".',
        )
      }
      // El motor de lectura se descarga mientras el usuario da permiso a la cámara
      const detectorListo = obtenerDetector()
      detectorListo.catch(() => {})

      stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
      })
      const video = videoRef.current
      if (cancelado || !video) return

      video.srcObject = stream
      await video.play()

      const track = stream.getVideoTracks()[0] ?? null
      trackRef.current = track
      const capacidades = track?.getCapabilities?.() as (MediaTrackCapabilities & { torch?: boolean }) | undefined
      setHayLinterna(Boolean(capacidades?.torch))

      const detector = await detectorListo
      if (cancelado) return
      setEstado('activo')

      const leer = async () => {
        if (cancelado) return
        if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
          try {
            const codigo = (await detector.detect(video))[0]?.rawValue.trim()
            if (codigo && !cancelado) void procesar(codigo)
          } catch {
            // Un cuadro que no se pudo leer: se intenta con el siguiente
          }
        }
        temporizador = window.setTimeout(leer, INTERVALO_MS)
      }
      void leer()
    }

    iniciar().catch((e: unknown) => {
      if (cancelado) return
      setEstado('error')
      setError(mensajeErrorCamara(e))
    })

    return () => {
      cancelado = true
      window.clearTimeout(temporizador)
      stream?.getTracks().forEach((t) => t.stop())
      trackRef.current = null
    }
    // procesar solo usa refs y setters estables
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    // En fase de captura y sin propagar: si el escáner está sobre un Modal, Escape cierra solo el escáner
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      onCloseRef.current()
    }
    window.addEventListener('keydown', onKeyDown, true)
    const overflowAnterior = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKeyDown, true)
      document.body.style.overflow = overflowAnterior
    }
  }, [])

  async function alternarLinterna() {
    const track = trackRef.current
    if (!track) return
    try {
      await track.applyConstraints({ advanced: [{ torch: !linterna } as unknown as MediaTrackConstraintSet] })
      setLinterna(!linterna)
    } catch {
      setHayLinterna(false)
    }
  }

  function onManual(e: FormEvent) {
    e.preventDefault()
    const codigo = manual.trim()
    if (!codigo) return
    repetidoRef.current = { codigo: '', hora: 0 } // escribirlo a mano siempre cuenta
    void procesar(codigo)
    setManual('')
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 md:p-6" role="dialog" aria-modal="true" aria-label={titulo}>
      <div className="flex h-full w-full flex-col overflow-hidden bg-black md:h-auto md:max-w-lg md:rounded-2xl md:border md:border-brand-border">
        <div className="flex items-center justify-between gap-3 bg-brand-card px-4 py-3">
          <h2 className="font-semibold">{titulo}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200" aria-label="Cerrar escáner">
            <X className="size-6" />
          </button>
        </div>

        <div className="relative min-h-0 flex-1 bg-black md:aspect-[4/3] md:flex-none">
          <video ref={videoRef} className="h-full w-full object-cover" playsInline muted />

          {estado === 'activo' && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="relative h-40 w-72 max-w-[80%] rounded-xl border-2 border-white/80 shadow-[0_0_0_9999px_rgb(0_0_0/0.45)]">
                <div className="absolute inset-x-3 top-1/2 h-0.5 animate-pulse bg-red-500/80" />
              </div>
            </div>
          )}

          {estado === 'iniciando' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-sm text-slate-300">
              <Loader2 className="size-7 animate-spin text-brand-accent" />
              Abriendo la cámara…
            </div>
          )}

          {estado === 'error' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center text-sm text-slate-300">
              <CameraOff className="size-8 text-red-400" />
              <p>{error}</p>
            </div>
          )}

          {hayLinterna && (
            <button
              onClick={alternarLinterna}
              className="absolute right-3 bottom-3 rounded-full bg-black/60 p-3 text-white"
              aria-label={linterna ? 'Apagar linterna' : 'Encender linterna'}
              aria-pressed={linterna}
            >
              {linterna ? <FlashlightOff className="size-5" /> : <Flashlight className="size-5" />}
            </button>
          )}
        </div>

        <div className="space-y-3 bg-brand-card p-4">
          <div className="min-h-10 text-sm" aria-live="polite">
            {procesando ? (
              <p className="flex items-center gap-2 text-slate-300">
                <Loader2 className="size-4 animate-spin" />
                Verificando…
              </p>
            ) : ultimo ? (
              <p className={`flex items-start gap-2 ${ultimo.ok ? 'text-emerald-400' : 'text-amber-400'}`}>
                {ultimo.ok ? <CheckCircle2 className="mt-0.5 size-4 shrink-0" /> : <XCircle className="mt-0.5 size-4 shrink-0" />}
                <span>
                  <span className="font-mono">{ultimo.codigo}</span>
                  {ultimo.mensaje && <span className="block text-xs text-slate-300">{ultimo.mensaje}</span>}
                </span>
              </p>
            ) : (
              <p className="text-slate-400">
                {continuo ? 'Apunta a cada código; se agregan solos.' : 'Apunta la cámara al código de barras o QR.'}
              </p>
            )}
          </div>

          <form onSubmit={onManual} className="flex gap-2">
            <input
              value={manual}
              onChange={(e) => setManual(e.target.value)}
              placeholder="¿No lo lee? Escríbelo aquí"
              className="input font-mono"
              aria-label="Código escrito a mano"
              maxLength={100}
            />
            <button type="submit" disabled={!manual.trim()} className="btn btn-secondary">
              Usar
            </button>
          </form>

          {continuo && (
            <button onClick={onClose} className="btn btn-primary w-full">
              Terminar{lecturas > 0 && ` (${lecturas} ${lecturas === 1 ? 'leído' : 'leídos'})`}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function mensajeErrorCamara(error: unknown): string {
  const nombre = error instanceof DOMException ? error.name : ''
  if (nombre === 'NotAllowedError') {
    return 'No hay permiso para usar la cámara. Actívalo en la configuración del navegador para este sitio y vuelve a intentarlo.'
  }
  if (nombre === 'NotFoundError' || nombre === 'OverconstrainedError') return 'No se encontró ninguna cámara en este dispositivo.'
  if (nombre === 'NotReadableError') return 'La cámara está siendo usada por otra aplicación. Ciérrala y vuelve a intentarlo.'
  return error instanceof Error ? error.message : 'No se pudo iniciar el escáner.'
}
