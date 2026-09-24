import { Loader2 } from 'lucide-react'
import { useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { mensajeError, useCambiarActivo, type Producto } from '../api'

/** Desactivar un producto lo oculta del catálogo sin borrar su historial de movimientos */
export function ConfirmarActivoModal({ producto, onClose }: { producto: Producto | null; onClose: () => void }) {
  const cambiarActivo = useCambiarActivo()
  const [error, setError] = useState<string | null>(null)
  const desactivar = producto?.activo ?? true

  function cerrar() {
    setError(null)
    onClose()
  }

  async function confirmar() {
    if (!producto) return
    setError(null)
    try {
      await cambiarActivo.mutateAsync({ id: producto.id, activo: !producto.activo })
      cerrar()
    } catch (e) {
      setError(mensajeError(e))
    }
  }

  return (
    <Modal open={Boolean(producto)} onClose={cerrar} title={desactivar ? 'Desactivar producto' : 'Reactivar producto'}>
      <p className="text-sm text-slate-300">
        {desactivar ? (
          <>
            <strong>{producto?.nombre}</strong> dejará de aparecer en el catálogo activo y no se podrá usar en nuevos
            movimientos. Su historial y stock se conservan, y puedes reactivarlo cuando quieras.
          </>
        ) : (
          <>
            <strong>{producto?.nombre}</strong> volverá a estar disponible en el catálogo y en los movimientos.
          </>
        )}
      </p>
      {desactivar && producto && producto.stock > 0 && (
        <p className="mt-3 rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-amber-400">
          Ojo: este producto todavía tiene {producto.stock} unidad(es) en stock.
        </p>
      )}
      {error && (
        <p role="alert" className="mt-3 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">
          {error}
        </p>
      )}
      <div className="mt-6 flex justify-end gap-3">
        <button onClick={cerrar} className="btn btn-secondary">
          Cancelar
        </button>
        <button
          onClick={confirmar}
          disabled={cambiarActivo.isPending}
          className={`btn ${desactivar ? 'btn-danger' : 'btn-primary'}`}
        >
          {cambiarActivo.isPending && <Loader2 className="size-4 animate-spin" />}
          {desactivar ? 'Desactivar' : 'Reactivar'}
        </button>
      </div>
    </Modal>
  )
}
