import { Loader2, Pencil, Plus, Repeat } from 'lucide-react'
import { useMemo, useState, type FormEvent } from 'react'
import { EstadoVacio } from '@/components/ui/EstadoVacio'
import { FormField } from '@/components/ui/FormField'
import { LoadingBlock } from '@/components/ui/LoadingBlock'
import { Modal } from '@/components/ui/Modal'
import { usePermisos } from '@/features/auth/permisos'
import { formatearValor, useCuentas, useOpcionesTercero, type OpcionTercero } from '@/features/contabilidad/api'
import { SelectorCuenta, SelectorTercero } from '@/features/contabilidad/components/Selectores'
import { mensajeError } from '@/lib/errores'
import {
  useCategoriasGasto,
  useGuardarCategoria,
  useGuardarRecurrente,
  useRecurrentes,
  type CategoriaGasto,
  type RecurrenteDetalle,
} from '../gastosApi'
import { SelectorCaja } from './Comunes'

/** Gastos que se repiten cada mes (arriendo, internet, software) y las categorías de gasto */
export function TabRecurrentes() {
  const { llevaContabilidad } = usePermisos()
  const { data: recurrentes = [], isLoading, error } = useRecurrentes()
  const [edicion, setEdicion] = useState<RecurrenteDetalle | 'nuevo' | null>(null)

  if (isLoading) return <LoadingBlock />
  if (error) return <p className="text-sm text-red-400">{mensajeError(error)}</p>

  const botonNuevo = llevaContabilidad && (
    <button onClick={() => setEdicion('nuevo')} className="btn btn-primary">
      <Plus className="size-4" />
      Nuevo recurrente
    </button>
  )

  return (
    <div className="space-y-6">
      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <p className="max-w-2xl text-sm text-slate-400">
            Se configuran una vez. Cada mes aparecen en Gastos para confirmarlos con un clic (y el cierre del mes avisa si
            falta alguno).
          </p>
          {botonNuevo}
        </div>
        <div className="overflow-hidden rounded-2xl border border-brand-border bg-brand-card">
          {recurrentes.length === 0 ? (
            <EstadoVacio icono={Repeat} titulo="Aún no hay gastos recurrentes" accion={botonNuevo} compacto />
          ) : (
            <table className="tabla-tarjetas w-full text-sm">
              <thead className="border-b border-brand-border text-left text-xs tracking-wide text-slate-400 uppercase">
                <tr>
                  <th className="px-4 py-3 font-medium">Nombre</th>
                  <th className="px-4 py-3 font-medium">Categoría</th>
                  <th className="px-4 py-3 font-medium">Día</th>
                  <th className="px-4 py-3 font-medium">Se paga</th>
                  <th className="px-4 py-3 text-right font-medium">Valor</th>
                  {llevaContabilidad && <th className="px-4 py-3" />}
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-border">
                {recurrentes.map((r) => (
                  <tr key={r.id} className={r.activo ? '' : 'opacity-50'}>
                    <td data-principal className="px-4 py-3 font-medium text-slate-100">
                      {r.nombre}
                      {!r.activo && <span className="ml-2 text-xs text-slate-500">(inactivo)</span>}
                    </td>
                    <td data-label="Categoría" className="px-4 py-3 text-slate-300">
                      {r.categoria?.nombre}
                    </td>
                    <td data-label="Día" className="px-4 py-3 text-slate-400">
                      {r.dia}
                    </td>
                    <td data-label="Se paga" className="px-4 py-3 text-slate-400">
                      {r.caja?.nombre ?? `Por pagar a ${r.proveedor?.nombre ?? r.tercero?.nombre ?? '—'}`}
                    </td>
                    <td data-label="Valor" className="px-4 py-3 text-right tabular-nums">
                      {formatearValor(r.valor)}
                    </td>
                    {llevaContabilidad && (
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => setEdicion(r)}
                          className="rounded-lg p-1.5 text-slate-400 hover:bg-tinte/5 hover:text-slate-200"
                          aria-label={`Editar ${r.nombre}`}
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
      </section>

      <Categorias />

      <Modal
        open={edicion !== null}
        onClose={() => setEdicion(null)}
        title={edicion === 'nuevo' ? 'Nuevo gasto recurrente' : `Editar ${edicion?.nombre ?? ''}`}
      >
        {edicion && (
          <RecurrenteForm
            key={edicion === 'nuevo' ? 'nuevo' : edicion.id}
            recurrente={edicion === 'nuevo' ? null : edicion}
            onClose={() => setEdicion(null)}
          />
        )}
      </Modal>
    </div>
  )
}

function RecurrenteForm({ recurrente, onClose }: { recurrente: RecurrenteDetalle | null; onClose: () => void }) {
  const guardar = useGuardarRecurrente()
  const categorias = useCategoriasGasto()
  const terceros = useOpcionesTercero()
  const beneficiarios = useMemo(() => (terceros.data ?? []).filter((t) => t.clase !== 'cliente'), [terceros.data])
  const [nombre, setNombre] = useState(recurrente?.nombre ?? '')
  const [categoria, setCategoria] = useState(recurrente?.categoria_id ?? '')
  const [valor, setValor] = useState(recurrente?.valor ?? Number.NaN)
  const [dia, setDia] = useState(recurrente?.dia ?? 1)
  const [caja, setCaja] = useState(recurrente?.cuenta_tesoreria_id ?? '')
  const [tercero, setTercero] = useState<Pick<OpcionTercero, 'clase' | 'id'> | null>(
    recurrente?.proveedor_id
      ? { clase: 'proveedor', id: recurrente.proveedor_id }
      : recurrente?.tercero_id
        ? { clase: 'tercero', id: recurrente.tercero_id }
        : null,
  )
  const [activo, setActivo] = useState(recurrente?.activo ?? true)
  const [intento, setIntento] = useState(false)

  const errores = {
    nombre: nombre.trim().length < 2 ? 'Escribe el nombre.' : undefined,
    categoria: !categoria ? 'Elige la categoría.' : undefined,
    valor: !Number.isFinite(valor) || valor <= 0 ? 'Escribe un valor mayor que cero.' : undefined,
    dia: dia < 1 || dia > 28 ? 'Entre 1 y 28.' : undefined,
    tercero: !caja && !tercero ? 'Si queda por pagar, indica a quién.' : undefined,
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    setIntento(true)
    if (Object.values(errores).some(Boolean)) return
    guardar.mutate(
      {
        ...(recurrente && { id: recurrente.id }),
        nombre: nombre.trim(),
        categoria_id: categoria,
        valor,
        dia,
        cuenta_tesoreria_id: caja || null,
        proveedor_id: tercero?.clase === 'proveedor' ? tercero.id : null,
        tercero_id: tercero?.clase === 'tercero' ? tercero.id : null,
        activo,
      },
      { onSuccess: onClose },
    )
  }
  const error = (c: keyof typeof errores) => (intento ? errores[c] : undefined)

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Nombre *" error={error('nombre')} className="sm:col-span-2">
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={100} placeholder="Arriendo del local" className="input" autoFocus />
        </FormField>
        <FormField label="Categoría *" error={error('categoria')}>
          <select value={categoria} onChange={(e) => setCategoria(e.target.value)} className="input">
            <option value="">Elige…</option>
            {(categorias.data ?? [])
              .filter((c) => c.activa || c.id === categoria)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
          </select>
        </FormField>
        <FormField label="Valor habitual *" error={error('valor')} hint="Al confirmarlo cada mes se usa este valor">
          <input
            type="number"
            min={0}
            step="any"
            value={Number.isFinite(valor) ? valor : ''}
            onChange={(e) => setValor(e.target.valueAsNumber)}
            className="input"
          />
        </FormField>
        <FormField label="Día del mes *" error={error('dia')}>
          <input type="number" min={1} max={28} value={dia} onChange={(e) => setDia(e.target.valueAsNumber)} className="input" />
        </FormField>
        <FormField label="Se paga de" hint="Vacío: queda por pagar al beneficiario">
          <SelectorCaja value={caja} onChange={setCaja} vacio="Queda por pagar" />
        </FormField>
        <FormField label={caja ? 'Beneficiario' : 'Beneficiario *'} error={error('tercero')} className="sm:col-span-2">
          <SelectorTercero
            opciones={beneficiarios}
            value={tercero}
            onChange={(t) => setTercero(t && { clase: t.clase, id: t.id })}
          />
        </FormField>
      </div>
      {recurrente && (
        <label className="flex items-center gap-2 text-sm text-slate-300">
          <input type="checkbox" checked={activo} onChange={(e) => setActivo(e.target.checked)} />
          Activo
        </label>
      )}
      {guardar.error && (
        <p role="alert" className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">
          {mensajeError(guardar.error)}
        </p>
      )}
      <div className="flex justify-end gap-3">
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

/** Categorías de gasto y la cuenta del PUC de cada una (la contadora las ajusta) */
function Categorias() {
  const { llevaContabilidad } = usePermisos()
  const { data: categorias = [] } = useCategoriasGasto()
  const cuentas = useCuentas()
  const [edicion, setEdicion] = useState<CategoriaGasto | 'nueva' | null>(null)
  const nombreCuenta = (codigo: string) => cuentas.data?.find((c) => c.codigo === codigo)?.nombre ?? ''

  return (
    <section className="rounded-2xl border border-brand-border bg-brand-card">
      <div className="flex flex-wrap items-center justify-between gap-3 p-5 pb-3">
        <div>
          <h2 className="font-semibold">Categorías de gasto</h2>
          <p className="mt-1 text-sm text-slate-400">Cada categoría lleva el gasto a su cuenta del PUC.</p>
        </div>
        {llevaContabilidad && (
          <button onClick={() => setEdicion('nueva')} className="btn btn-secondary">
            <Plus className="size-4" />
            Nueva categoría
          </button>
        )}
      </div>
      <table className="w-full text-sm">
        <tbody className="divide-y divide-brand-border">
          {categorias.map((c) => (
            <tr key={c.id} className={c.activa ? '' : 'opacity-50'}>
              <td className="px-5 py-2.5 font-medium text-slate-200">{c.nombre}</td>
              <td className="px-5 py-2.5 text-slate-400">
                <span className="font-mono">{c.cuenta}</span> {nombreCuenta(c.cuenta)}
              </td>
              {llevaContabilidad && (
                <td className="px-5 py-2.5 text-right">
                  <button
                    onClick={() => setEdicion(c)}
                    className="rounded-lg p-1.5 text-slate-400 hover:bg-tinte/5 hover:text-slate-200"
                    aria-label={`Editar ${c.nombre}`}
                  >
                    <Pencil className="size-4" />
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      <Modal open={edicion !== null} onClose={() => setEdicion(null)} title={edicion === 'nueva' ? 'Nueva categoría' : 'Editar categoría'}>
        {edicion && (
          <CategoriaForm
            key={edicion === 'nueva' ? 'nueva' : edicion.id}
            categoria={edicion === 'nueva' ? null : edicion}
            onClose={() => setEdicion(null)}
          />
        )}
      </Modal>
    </section>
  )
}

function CategoriaForm({ categoria, onClose }: { categoria: CategoriaGasto | null; onClose: () => void }) {
  const guardar = useGuardarCategoria()
  const cuentas = useCuentas()
  const [nombre, setNombre] = useState(categoria?.nombre ?? '')
  const [cuenta, setCuenta] = useState(categoria?.cuenta ?? '')
  const [activa, setActiva] = useState(categoria?.activa ?? true)
  // Gastos y costos: clases 5 y 6
  const disponibles = useMemo(() => (cuentas.data ?? []).filter((c) => /^[56]/.test(c.codigo)), [cuentas.data])

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (nombre.trim().length < 2 || !cuenta) return
    guardar.mutate({ ...(categoria && { id: categoria.id }), nombre: nombre.trim(), cuenta, activa }, { onSuccess: onClose })
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <FormField label="Nombre *">
        <input value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={80} className="input" autoFocus />
      </FormField>
      <FormField label="Cuenta del gasto *">
        <SelectorCuenta cuentas={disponibles} soloMovimiento value={cuenta} onChange={setCuenta} />
      </FormField>
      {categoria && (
        <label className="flex items-center gap-2 text-sm text-slate-300">
          <input type="checkbox" checked={activa} onChange={(e) => setActiva(e.target.checked)} />
          Activa
        </label>
      )}
      {guardar.error && (
        <p role="alert" className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">
          {mensajeError(guardar.error)}
        </p>
      )}
      <div className="flex justify-end gap-3">
        <button type="button" onClick={onClose} className="btn btn-secondary">
          Cancelar
        </button>
        <button type="submit" disabled={guardar.isPending || nombre.trim().length < 2 || !cuenta} className="btn btn-primary">
          {guardar.isPending && <Loader2 className="size-4 animate-spin" />}
          Guardar
        </button>
      </div>
    </form>
  )
}
