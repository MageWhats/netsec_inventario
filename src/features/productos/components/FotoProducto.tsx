import { Camera, ImageOff, Loader2, Package, Trash2 } from 'lucide-react'
import { useRef, useState, type ChangeEvent } from 'react'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { mensajeError } from '@/lib/errores'
import { useQuitarFoto, useSubirFoto, type Producto } from '../api'

/** Foto del producto con acciones para subirla (cámara o galería), cambiarla o quitarla */
export function FotoProducto({ producto }: { producto: Pick<Producto, 'id' | 'nombre' | 'imagen_url'> }) {
  const input = useRef<HTMLInputElement>(null)
  const subir = useSubirFoto()
  const quitar = useQuitarFoto()
  const [confirmarQuitar, setConfirmarQuitar] = useState(false)
  const [rota, setRota] = useState(false)
  const ocupado = subir.isPending || quitar.isPending

  function onArchivo(e: ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0]
    e.target.value = '' // permite volver a elegir el mismo archivo
    if (!archivo) return
    quitar.reset()
    setRota(false)
    subir.mutate({ producto, archivo })
  }

  const error = subir.error ?? quitar.error

  return (
    <div className="space-y-2">
      <div className="relative flex aspect-square w-full items-center justify-center overflow-hidden rounded-xl border border-brand-border bg-white/[0.03]">
        {producto.imagen_url && !rota ? (
          <img
            src={producto.imagen_url}
            alt={producto.nombre}
            className="h-full w-full object-contain"
            onError={() => setRota(true)}
          />
        ) : (
          <div className="flex flex-col items-center gap-2 text-slate-600">
            {rota ? <ImageOff className="size-10" /> : <Package className="size-10" />}
            <span className="text-xs">{rota ? 'No se pudo cargar la foto' : 'Sin foto'}</span>
          </div>
        )}
        {ocupado && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50">
            <Loader2 className="size-7 animate-spin text-white" aria-label="Guardando foto" />
          </div>
        )}
      </div>

      {/* accept="image/*": en el teléfono ofrece tomar la foto con la cámara o elegirla de la galería */}
      <input ref={input} type="file" accept="image/*" className="hidden" onChange={onArchivo} />
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => input.current?.click()}
          disabled={ocupado}
          className="btn btn-secondary flex-1 px-2 text-xs"
        >
          <Camera className="size-4" />
          {producto.imagen_url ? 'Cambiar foto' : 'Subir foto'}
        </button>
        {producto.imagen_url && (
          <button
            type="button"
            onClick={() => setConfirmarQuitar(true)}
            disabled={ocupado}
            className="btn btn-secondary px-2.5"
            aria-label="Quitar foto"
            title="Quitar foto"
          >
            <Trash2 className="size-4" />
          </button>
        )}
      </div>
      {error && <p className="text-xs text-red-400">{mensajeError(error)}</p>}

      <ConfirmDialog
        open={confirmarQuitar}
        title="Quitar la foto"
        confirmLabel="Quitar"
        danger
        pending={quitar.isPending}
        onConfirm={() => quitar.mutate(producto, { onSuccess: () => setConfirmarQuitar(false) })}
        onClose={() => setConfirmarQuitar(false)}
      >
        La foto de «{producto.nombre}» se eliminará. Puedes subir otra cuando quieras.
      </ConfirmDialog>
    </div>
  )
}

/** Miniatura para listas; si no hay foto muestra un ícono */
export function MiniaturaProducto({ url, nombre }: { url: string | null; nombre: string }) {
  const [rota, setRota] = useState(false)
  return (
    <span className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-brand-border bg-white/[0.03]">
      {url && !rota ? (
        <img src={url} alt="" title={nombre} loading="lazy" className="h-full w-full object-cover" onError={() => setRota(true)} />
      ) : (
        <Package className="size-4 text-slate-600" />
      )}
    </span>
  )
}
