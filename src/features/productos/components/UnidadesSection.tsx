import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2, Pencil, Search } from 'lucide-react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { FormField } from '@/components/ui/FormField'
import { Modal } from '@/components/ui/Modal'
import { formatearFecha } from '@/lib/format'
import { mensajeError, useActualizarUnidad, useUnidades, type Unidad } from '../api'
import { ESTADOS_UNIDAD, estadosUnidad, type EstadoUnidad } from '../estados'
import { EstadoUnidadBadge } from './badges'

export function UnidadesSection({ productoId }: { productoId: string }) {
  const { data: unidades = [], isLoading, error } = useUnidades(productoId)
  const [busqueda, setBusqueda] = useState('')
  const [estado, setEstado] = useState<EstadoUnidad | ''>('')
  const [editando, setEditando] = useState<Unidad | null>(null)

  const conteo = useMemo(() => {
    const c = Object.fromEntries(ESTADOS_UNIDAD.map((e) => [e, 0])) as Record<EstadoUnidad, number>
    for (const u of unidades) c[u.estado]++
    return c
  }, [unidades])

  const termino = busqueda.trim().toLowerCase()
  const filtradas = unidades.filter(
    (u) =>
      (!estado || u.estado === estado) &&
      (!termino || u.numero_serie.toLowerCase().includes(termino) || u.mac?.toLowerCase().includes(termino)),
  )

  return (
    <section className="rounded-2xl border border-brand-border bg-brand-card">
      <div className="border-b border-brand-border p-6">
        <h2 className="font-semibold">Unidades con número de serie</h2>
        <p className="mt-1 text-sm text-slate-400">
          Los seriales se registran al hacer una <strong>entrada</strong> en Movimientos, y su estado cambia con las
          salidas y los ajustes. Aquí puedes consultarlos y completar la MAC o las notas.
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          <FiltroChip activo={estado === ''} onClick={() => setEstado('')}>
            Todas · {unidades.length}
          </FiltroChip>
          {ESTADOS_UNIDAD.map((e) => (
            <FiltroChip key={e} activo={estado === e} onClick={() => setEstado(e)}>
              {estadosUnidad[e].label} · {conteo[e]}
            </FiltroChip>
          ))}
        </div>

        <div className="relative mt-4 max-w-md">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-500" />
          <input
            type="search"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar serial o MAC…"
            className="input pl-9"
          />
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center p-10">
          <Loader2 className="size-6 animate-spin text-brand-accent" aria-label="Cargando" />
        </div>
      ) : error ? (
        <p className="p-6 text-sm text-red-400">No se pudieron cargar las unidades: {error.message}</p>
      ) : filtradas.length === 0 ? (
        <p className="p-10 text-center text-sm text-slate-500">
          {unidades.length === 0
            ? 'Todavía no hay unidades registradas para este producto.'
            : 'Ninguna unidad coincide con la búsqueda.'}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-brand-border text-left text-xs tracking-wide text-slate-400 uppercase">
              <tr>
                <th className="px-4 py-3 font-medium">Número de serie</th>
                <th className="px-4 py-3 font-medium">MAC</th>
                <th className="px-4 py-3 font-medium">Estado</th>
                <th className="px-4 py-3 font-medium">Notas</th>
                <th className="px-4 py-3 font-medium">Ingreso</th>
                <th className="px-4 py-3">
                  <span className="sr-only">Acciones</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-border">
              {filtradas.map((u) => (
                <tr key={u.id}>
                  <td className="px-4 py-3 font-mono">{u.numero_serie}</td>
                  <td className="px-4 py-3 font-mono text-slate-300">{u.mac ?? '—'}</td>
                  <td className="px-4 py-3">
                    <EstadoUnidadBadge estado={u.estado} />
                  </td>
                  <td className="max-w-xs truncate px-4 py-3 text-slate-400" title={u.notas ?? undefined}>
                    {u.notas ?? '—'}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-slate-400">{formatearFecha(u.created_at)}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => setEditando(u)}
                      className="rounded-lg p-2 text-slate-400 hover:bg-white/5 hover:text-slate-200"
                      title="Editar MAC y notas"
                      aria-label={`Editar unidad ${u.numero_serie}`}
                    >
                      <Pencil className="size-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <EditarUnidadModal unidad={editando} onClose={() => setEditando(null)} />
    </section>
  )
}

function FiltroChip({ activo, onClick, children }: { activo: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-xs transition ${
        activo
          ? 'border-brand-accent bg-brand-accent/15 text-brand-accent'
          : 'border-brand-border text-slate-400 hover:text-slate-200'
      }`}
    >
      {children}
    </button>
  )
}

const unidadSchema = z.object({
  mac: z
    .string()
    .trim()
    .refine(
      (v) => v === '' || /^([0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}$/.test(v),
      'Formato de MAC inválido (p. ej. AA:BB:CC:DD:EE:FF)',
    ),
  notas: z.string().trim().max(500, 'Máximo 500 caracteres'),
})

type UnidadForm = z.infer<typeof unidadSchema>

function EditarUnidadModal({ unidad, onClose }: { unidad: Unidad | null; onClose: () => void }) {
  const { mutateAsync: actualizar, error: errorGuardar, reset: limpiarError } = useActualizarUnidad()
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<UnidadForm>({ resolver: zodResolver(unidadSchema) })

  useEffect(() => {
    if (!unidad) return
    reset({ mac: unidad.mac ?? '', notas: unidad.notas ?? '' })
    limpiarError()
  }, [unidad, reset, limpiarError])

  async function onSubmit(valores: UnidadForm) {
    if (!unidad) return
    try {
      await actualizar({
        id: unidad.id,
        valores: { mac: valores.mac.toUpperCase().replaceAll('-', ':') || null, notas: valores.notas || null },
      })
      onClose()
    } catch {
      // El error queda en errorGuardar y se muestra en el formulario
    }
  }

  return (
    <Modal open={Boolean(unidad)} onClose={onClose} title={`Unidad ${unidad?.numero_serie ?? ''}`}>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <FormField label="MAC" error={errors.mac?.message}>
          <input className="input font-mono uppercase" placeholder="AA:BB:CC:DD:EE:FF" {...register('mac')} />
        </FormField>
        <FormField label="Notas" error={errors.notas?.message}>
          <textarea className="input min-h-20" rows={3} {...register('notas')} />
        </FormField>

        {errorGuardar && (
          <p role="alert" className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">
            {mensajeError(errorGuardar)}
          </p>
        )}

        <div className="flex justify-end gap-3">
          <button type="button" onClick={onClose} className="btn btn-secondary">
            Cancelar
          </button>
          <button type="submit" disabled={isSubmitting} className="btn btn-primary">
            {isSubmitting && <Loader2 className="size-4 animate-spin" />}
            Guardar
          </button>
        </div>
      </form>
    </Modal>
  )
}
