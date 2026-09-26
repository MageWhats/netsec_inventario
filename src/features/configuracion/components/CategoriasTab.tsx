import { Pencil, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { LoadingBlock } from '@/components/ui/LoadingBlock'
import { mensajeError } from '@/lib/errores'
import { useCategoriasConUso, useEliminarCategoria, type CategoriaConUso } from '../api'
import { CategoriaFormModal } from './CategoriaFormModal'

export function CategoriasTab() {
  const { data: categorias = [], isLoading, error } = useCategoriasConUso()
  const eliminar = useEliminarCategoria()

  const [formAbierto, setFormAbierto] = useState(false)
  const [editando, setEditando] = useState<CategoriaConUso | null>(null)
  const [eliminando, setEliminando] = useState<CategoriaConUso | null>(null)

  function abrirFormulario(categoria: CategoriaConUso | null) {
    setEditando(categoria)
    setFormAbierto(true)
  }

  function cerrarConfirmacion() {
    eliminar.reset()
    setEliminando(null)
  }

  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-sm text-slate-400">Sirven para clasificar los productos y filtrar tomas de inventario.</p>
        <button onClick={() => abrirFormulario(null)} className="btn btn-primary shrink-0">
          <Plus className="size-4" />
          Nueva categoría
        </button>
      </div>

      <div className="overflow-hidden rounded-2xl border border-brand-border bg-brand-card">
        {isLoading ? (
          <LoadingBlock />
        ) : error ? (
          <p className="p-6 text-sm text-red-400">No se pudieron cargar las categorías: {error.message}</p>
        ) : categorias.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500">
            Aún no hay categorías.{' '}
            <button onClick={() => abrirFormulario(null)} className="text-brand-cyan hover:underline">
              Crea la primera
            </button>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-brand-border text-left text-xs tracking-wide text-slate-400 uppercase">
              <tr>
                <th className="px-4 py-3 font-medium">Categoría</th>
                <th className="px-4 py-3 text-right font-medium">Productos</th>
                <th className="px-4 py-3">
                  <span className="sr-only">Acciones</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-border">
              {categorias.map((c) => (
                <tr key={c.id}>
                  <td className="px-4 py-3 font-medium">{c.nombre}</td>
                  <td className="px-4 py-3 text-right text-slate-300 tabular-nums">{c.productos}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <button
                        onClick={() => abrirFormulario(c)}
                        className="rounded-lg p-2 text-slate-400 hover:bg-white/5 hover:text-slate-200"
                        title="Editar"
                        aria-label={`Editar ${c.nombre}`}
                      >
                        <Pencil className="size-4" />
                      </button>
                      <button
                        onClick={() => setEliminando(c)}
                        disabled={c.productos > 0}
                        className="rounded-lg p-2 text-slate-400 hover:bg-white/5 hover:text-red-400 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-400"
                        title={c.productos > 0 ? 'Tiene productos: cámbialos de categoría para poder eliminarla' : 'Eliminar'}
                        aria-label={`Eliminar ${c.nombre}`}
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <CategoriaFormModal open={formAbierto} onClose={() => setFormAbierto(false)} categoria={editando} />
      <ConfirmDialog
        open={Boolean(eliminando)}
        title="Eliminar categoría"
        confirmLabel="Eliminar"
        danger
        pending={eliminar.isPending}
        error={eliminar.error && mensajeError(eliminar.error)}
        onClose={cerrarConfirmacion}
        onConfirm={() => eliminando && eliminar.mutate(eliminando.id, { onSuccess: cerrarConfirmacion })}
      >
        ¿Eliminar la categoría <strong>{eliminando?.nombre}</strong>? Esta acción no se puede deshacer.
      </ConfirmDialog>
    </>
  )
}
