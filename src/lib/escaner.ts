import type { BarcodeDetector, BarcodeFormat } from 'barcode-detector/ponyfill'

/** Formatos habituales en etiquetas de producto, cajas y seriales de equipos */
const FORMATOS: BarcodeFormat[] = [
  'code_128',
  'code_39',
  'code_93',
  'ean_13',
  'ean_8',
  'upc_a',
  'upc_e',
  'itf',
  'codabar',
  'qr_code',
  'data_matrix',
]

let detector: Promise<BarcodeDetector> | null = null

/**
 * Crea (una sola vez) el lector de códigos. La librería y su motor WebAssembly se cargan bajo demanda,
 * la primera vez que se abre la cámara, y el .wasm se sirve desde la propia app en lugar de un CDN.
 */
export function obtenerDetector() {
  detector ??= (async () => {
    const [{ BarcodeDetector, prepareZXingModule }, { default: wasmUrl }] = await Promise.all([
      import('barcode-detector/ponyfill'),
      import('zxing-wasm/reader/zxing_reader.wasm?url'),
    ])
    prepareZXingModule({
      overrides: {
        locateFile: (path: string, prefix: string) => (path.endsWith('.wasm') ? wasmUrl : prefix + path),
      },
    })
    return new BarcodeDetector({ formats: FORMATOS })
  })().catch((error: unknown) => {
    detector = null // permite reintentar si falló la descarga
    throw error
  })
  return detector
}

/** Pitido corto de confirmación (no hay archivos de audio que cargar) */
export function pitido(ok = true) {
  try {
    const ctx = new AudioContext()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.frequency.value = ok ? 1200 : 300
    gain.gain.value = 0.08
    osc.connect(gain).connect(ctx.destination)
    osc.start()
    osc.stop(ctx.currentTime + (ok ? 0.08 : 0.2))
    osc.onended = () => void ctx.close()
  } catch {
    // Sin audio disponible: no pasa nada
  }
  navigator.vibrate?.(ok ? 60 : [80, 60, 80])
}
