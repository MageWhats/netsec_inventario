/** Lado mayor de la foto guardada: suficiente para verla en grande sin pesar demasiado */
const LADO_MAXIMO = 1200
/** Tope del servidor (bucket "productos", migración 0007) */
export const TAMANO_MAXIMO_SUBIDA = 2 * 1024 * 1024
/** Tope de la foto original que se acepta procesar (las de cámara suelen pesar 3–8 MB) */
const TAMANO_MAXIMO_ORIGINAL = 25 * 1024 * 1024

export interface FotoPreparada {
  blob: Blob
  extension: 'webp' | 'jpg'
}

/**
 * Valida la imagen elegida y la redibuja en un canvas: reduce su tamaño, corrige la orientación
 * y descarta los metadatos (EXIF, ubicación GPS). Devuelve WebP, o JPEG si el navegador no sabe
 * generar WebP (algunas versiones de Safari).
 */
export async function prepararFoto(archivo: File): Promise<FotoPreparada> {
  if (!archivo.type.startsWith('image/') || archivo.type === 'image/svg+xml') {
    throw new Error('El archivo debe ser una foto (JPG, PNG, WebP o HEIC).')
  }
  if (archivo.size > TAMANO_MAXIMO_ORIGINAL) {
    throw new Error('La foto es demasiado grande (máximo 25 MB).')
  }

  let imagen: ImageBitmap
  try {
    imagen = await createImageBitmap(archivo, { imageOrientation: 'from-image' })
  } catch {
    throw new Error('No se pudo leer la imagen. Prueba con una foto JPG o PNG.')
  }

  const escala = Math.min(1, LADO_MAXIMO / Math.max(imagen.width, imagen.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(imagen.width * escala)
  canvas.height = Math.round(imagen.height * escala)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Este navegador no puede procesar imágenes.')
  ctx.drawImage(imagen, 0, 0, canvas.width, canvas.height)
  imagen.close()

  for (const calidad of [0.82, 0.7, 0.55]) {
    const webp = await aBlob(canvas, 'image/webp', calidad)
    const [blob, extension] =
      webp?.type === 'image/webp' ? [webp, 'webp' as const] : [await aBlob(canvas, 'image/jpeg', calidad), 'jpg' as const]
    if (blob && blob.size <= TAMANO_MAXIMO_SUBIDA) return { blob, extension }
  }
  throw new Error('No se pudo reducir la foto a menos de 2 MB.')
}

function aBlob(canvas: HTMLCanvasElement, tipo: string, calidad: number) {
  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, tipo, calidad))
}
