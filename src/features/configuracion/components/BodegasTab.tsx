import { Pencil, Plus, Power, PowerOff, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { LoadingBlock } from '@/components/ui/LoadingBlock'
import { mensajeError } from '@/lib/errores'
import { useBodegasConUso, useCambiarActivaBodega, useEliminarBodega, type BodegaConUso } from '../api'
import { BodegaFormModal } from './BodegaFormModal'

export function BodegasTab() {
  const { data: bodegas = [], isLoading, error } = useBodegasConUso()
  const cambiarActiva = useCambiarActivaBodega()
  const eliminar = useEliminarBodega()

  const [formAbierto, setFormAbierto] = useState(false)
  const [editando, setEditando] = useState<BodegaConUso | null>(null)
  const [cambiandoActiva, setCambiandoActiva] = useState<BodegaConUso | null>(null)
  const [eliminando, setEliminando] = useState<BodegaConUso | null>(null)

  const activas = bodegas.filter((b) => b.activa).length

  function abrirFormulario(bodega: BodegaConUso | null) {
    setEditando(bodega)
    setFormAbierto(true)
  }

  function cerrarCambioActiva() {
    cambiarActiva.reset()
    setCambiandoActiva(null)
  }

  function cerrarEliminacion() {
    eliminar.reset()
    setEliminando(null)
  }

  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-sm text-slate-400">Lugares donde se guarda la mercancía. Siempre debe haber al menos una activa.</p>
        <button onClick={() => abrirFormulario(null)} className="btn btn-primary shrink-0">
          <Plus className="size-4" />
          Nueva bodega
        </button>
      </div>

      <div className="overflow-hidden rounded-2xl border border-brand-border bg-brand-card">
        {isLoading ? (
          <LoadingBlock />
        ) : error ? (
          <p className="p-6 text-sm text-red-400">No se pudieron cargar las bodegas: {error.message}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-brand-border text-left text-xs tracking-wide text-slate-400 uppercase">
                <tr>
                  <th className="px-4 py-3 font-medium">Bodega</th>
                  <th className="px-4 py-3 font-medium">Dirección</th>
                  <th className="px-4 py-3 text-right font-medium">Movimientos</th>
                  <th className="px-4 py-3">
                    <span className="sr-only">Acciones</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-border">
                {bodegas.map((b) => {
                  const unicaActiva = b.activa && activas === 1
                  return (
                    <tr key={b.id} className={b.activa ? '' : 'opacity-50'}>
                      <td className="px-4 py-3">
                        <span className="font-medium">{b.nombre}</span>
                        {!b.activa && <span className="text-xs text-amber-400"> · Inactiva</span>}
                      </td>
                      <td className="px-4 py-3 text-slate-300">{b.direccion ?? '—'}</td>
                      <td className="px-4 py-3 text-right text-slate-300 tabular-nums">{b.movimientos}</td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1">
                          <button
                            onClick={() => abrirFormulario(b)}
                            className="rounded-lg p-2 text-slate-400 hover:bg-white/5 hover:text-slate-200"
                            title="Editar"
                            aria-label={`Editar ${b.nombre}`}
                          >
                            <Pencil className="size-4" />
                          </button>
                          {b.movimientos > 0 ? (
                            // Con historial no se borra: solo se desactiva
                            <button
                              onClick={() => setCambiandoActiva(b)}
                              disabled={unicaActiva}
                              className={`rounded-lg p-2 text-slate-400 hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-400 ${
                                b.activa ? 'hover:text-red-400' : 'hover:text-emerald-400'
                              }`}
                              title={unicaActiva ? 'Es la única bodega activa' : b.activa ? 'Desactivar' : 'Reactivar'}
                              aria-label={`${b.activa ? 'Desactivar' : 'Reactivar'} ${b.nombre}`}
                            >
                              {b.activa ? <PowerOff className="size-4" /> : <Power className="size-4" />}
                            </button>
                          ) : (
                            <button
                              onClick={() => setEliminando(b)}
                              disabled={unicaActiva}
                              className="rounded-lg p-2 text-slate-400 hover:bg-white/5 hover:text-red-400 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-400"
                              title={unicaActiva ? 'Es la única bodega activa' : 'Eliminar'}
                              aria-label={`Eliminar ${b.nombre}`}
                            >
                              <Trash2 className="size-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <BodegaFormModal open={formAbierto} onClose={() => setFormAbierto(false)} bodega={editando} />
      <ConfirmDialog
        open={Boolean(cambiandoActiva)}
        title={cambiandoActiva?.activa ? 'Desactivar bodega' : 'Reactivar bodega'}
        confirmLabel={cambiandoActiva?.activa ? 'Desactivar' : 'Reactivar'}
        danger={cambiandoActiva?.activa}
        pending={cambiarActiva.isPending}
        error={cambiarActiva.error && mensajeError(cambiarActiva.error)}
        onClose={cerrarCambioActiva}
        onConfirm={() =>
          cambiandoActiva &&
          cambiarActiva.mutate(
            { id: cambiandoActiva.id, activa: !cambiandoActiva.activa },
            { onSuccess: cerrarCambioActiva },
          )
        }
      >
        {cambiandoActiva?.activa ? (
          <>
            <strong>{cambiandoActiva.nombre}</strong> no aparecerá al registrar nuevos movimientos. Su historial se
            conserva.
          </>
        ) : (
          <>
            <strong>{cambiandoActiva?.nombre}</strong> volverá a estar disponible para nuevos movimientos.
          </>
        )}
      </ConfirmDialog>
      <ConfirmDialog
        open={Boolean(eliminando)}
        title="Eliminar bodega"
        confirmLabel="Eliminar"
        danger
        pending={eliminar.isPending}
        error={eliminar.error && mensajeError(eliminar.error)}
        onClose={cerrarEliminacion}
        onConfirm={() => eliminando && eliminar.mutate(eliminando.id, { onSuccess: cerrarEliminacion })}
      >
        ¿Eliminar la bodega <strong>{eliminando?.nombre}</strong>? Esta acción no se puede deshacer.
      </ConfirmDialog>
    </>
  )
}
