import { Loader2, Pencil, Plus, UserRound } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { EstadoVacio } from '@/components/ui/EstadoVacio'
import { FormField } from '@/components/ui/FormField'
import { LoadingBlock } from '@/components/ui/LoadingBlock'
import { Modal } from '@/components/ui/Modal'
import { usePermisos } from '@/features/auth/permisos'
import { mensajeError } from '@/lib/errores'
import type { Enums } from '@/types/database'
import { useGuardarTercero, useTerceros, type Tercero } from '../api'

const TIPOS_DOCUMENTO: Enums<'tipo_documento'>[] = ['NIT', 'CC', 'CE', 'PAS', 'TI', 'OTRO']

/**
 * Terceros que no son clientes ni proveedores: los comerciantes (aportes), la DIAN, el municipio,
 * los bancos, los empleados... Los clientes y proveedores se usan directamente en los comprobantes.
 */
export function TabTerceros() {
  const { llevaContabilidad } = usePermisos()
  const { data: terceros = [], isLoading, error } = useTerceros()
  const [edicion, setEdicion] = useState<Tercero | 'nuevo' | null>(null)

  if (isLoading) return <LoadingBlock />
  if (error) return <p className="text-sm text-red-400">{mensajeError(error)}</p>

  const botonNuevo = llevaContabilidad && (
    <button onClick={() => setEdicion('nuevo')} className="btn btn-primary">
      <Plus className="size-4" />
      Nuevo tercero
    </button>
  )

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm text-slate-400">
          Comerciantes, DIAN, municipio, bancos, empleados… Los clientes y los proveedores ya están en la aplicación y se
          eligen directamente en cada línea.
        </p>
        {botonNuevo}
      </div>

      <div className="overflow-hidden rounded-2xl border border-brand-border bg-brand-card">
        {terceros.length === 0 ? (
          <EstadoVacio icono={UserRound} titulo="Aún no hay otros terceros" accion={botonNuevo} compacto />
        ) : (
          <table className="tabla-tarjetas w-full text-sm">
            <thead className="border-b border-brand-border text-left text-xs tracking-wide text-slate-400 uppercase">
              <tr>
                <th className="px-4 py-3 font-medium">Nombre</th>
                <th className="px-4 py-3 font-medium">Documento</th>
                <th className="px-4 py-3 font-medium">Notas</th>
                {llevaContabilidad && <th className="px-4 py-3" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-border">
              {terceros.map((t) => (
                <tr key={t.id} className={t.activo ? '' : 'opacity-50'}>
                  <td data-principal className="px-4 py-3 font-medium text-slate-100">
                    {t.nombre}
                    {!t.activo && <span className="ml-2 text-xs text-slate-500">(inactivo)</span>}
                  </td>
                  <td data-label="Documento" className="px-4 py-3 whitespace-nowrap text-slate-300">
                    {t.tipo_documento} {t.documento}
                  </td>
                  <td data-label="Notas" className="px-4 py-3 text-slate-400">
                    {t.notas ?? '—'}
                  </td>
                  {llevaContabilidad && (
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => setEdicion(t)}
                        className="rounded-lg p-1.5 text-slate-400 hover:bg-tinte/5 hover:text-slate-200"
                        aria-label={`Editar ${t.nombre}`}
                      >
                        <Pencil className="size-4" />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Modal
        open={edicion !== null}
        onClose={() => setEdicion(null)}
        title={edicion === 'nuevo' ? 'Nuevo tercero' : 'Editar tercero'}
      >
        {edicion && (
          <TerceroForm
            key={edicion === 'nuevo' ? 'nuevo' : edicion.id}
            tercero={edicion === 'nuevo' ? null : edicion}
            onClose={() => setEdicion(null)}
          />
        )}
      </Modal>
    </>
  )
}

function TerceroForm({ tercero, onClose }: { tercero: Tercero | null; onClose: () => void }) {
  const guardar = useGuardarTercero()
  const [tipo, setTipo] = useState<Enums<'tipo_documento'>>(tercero?.tipo_documento ?? 'NIT')
  const [documento, setDocumento] = useState(tercero?.documento ?? '')
  const [nombre, setNombre] = useState(tercero?.nombre ?? '')
  const [notas, setNotas] = useState(tercero?.notas ?? '')
  const [activo, setActivo] = useState(tercero?.activo ?? true)
  const [intento, setIntento] = useState(false)

  const errorDocumento = !/^[A-Za-z0-9-]{1,20}$/.test(documento.trim())
    ? 'Solo letras, números y guiones (máximo 20).'
    : undefined
  const errorNombre = nombre.trim().length < 2 ? 'Escribe el nombre.' : undefined

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    setIntento(true)
    if (errorDocumento || errorNombre) return
    guardar.mutate(
      {
        ...(tercero && { id: tercero.id }),
        tipo_documento: tipo,
        documento: documento.trim(),
        nombre: nombre.trim(),
        notas: notas.trim() || null,
        activo,
      },
      { onSuccess: onClose },
    )
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <FormField label="Tipo *">
          <select value={tipo} onChange={(e) => setTipo(e.target.value as Enums<'tipo_documento'>)} className="input">
            {TIPOS_DOCUMENTO.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </FormField>
        <FormField label="Documento *" error={intento ? errorDocumento : undefined} className="sm:col-span-2">
          <input value={documento} onChange={(e) => setDocumento(e.target.value)} maxLength={20} className="input" autoFocus />
        </FormField>
        <FormField label="Nombre *" error={intento ? errorNombre : undefined} className="sm:col-span-3">
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={150} className="input" />
        </FormField>
        <FormField label="Notas" className="sm:col-span-3">
          <input
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            maxLength={500}
            placeholder="Comerciante, entidad bancaria, empleado…"
            className="input"
          />
        </FormField>
      </div>
      {tercero && (
        <label className="flex items-center gap-2 text-sm text-slate-300">
          <input type="checkbox" checked={activo} onChange={(e) => setActivo(e.target.checked)} />
          Activo
        </label>
      )}
      {guardar.error && (
        <p role="alert" className="text-sm text-red-400">
          {mensajeError(guardar.error)}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onClose} className="btn btn-secondary">
          Cancelar
        </button>
        <button type="submit" disabled={guardar.isPending} className="btn btn-primary">
          {guardar.isPending && <Loader2 className="size-4 animate-spin" />}
          Guardar
        </button>
      </div>
    </form>
  )
}
