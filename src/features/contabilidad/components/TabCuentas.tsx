import { Loader2, Pencil, Plus, Search } from 'lucide-react'
import { useMemo, useState, type FormEvent } from 'react'
import { FormField } from '@/components/ui/FormField'
import { LoadingBlock } from '@/components/ui/LoadingBlock'
import { MenuExportar } from '@/components/ui/MenuExportar'
import { Modal } from '@/components/ui/Modal'
import { usePermisos } from '@/features/auth/permisos'
import { mensajeError } from '@/lib/errores'
import { tablaDesdeColumnas, type ColumnaExportable } from '@/lib/exportar'
import {
  NIVELES,
  codigosConHijas,
  useActualizarCuenta,
  useCrearCuenta,
  useCuentas,
  type Cuenta,
  type Naturaleza,
} from '../api'

const SANGRIA = ['', 'pl-0', 'pl-4', 'pl-8', 'pl-12', 'pl-16']
const NATURALEZAS: Record<Naturaleza, string> = { debito: 'Débito', credito: 'Crédito' }

const columnasExportar: ColumnaExportable<Cuenta & { hoja: boolean }>[] = [
  { titulo: 'Código', valor: (c) => c.codigo },
  { titulo: 'Nombre', valor: (c) => c.nombre },
  { titulo: 'Nivel', valor: (c) => NIVELES[c.nivel] },
  { titulo: 'Naturaleza', valor: (c) => NATURALEZAS[c.naturaleza] },
  { titulo: 'Recibe movimientos', valor: (c) => (c.hoja ? 'Sí' : 'No') },
  { titulo: 'Exige tercero', valor: (c) => (c.exige_tercero ? 'Sí' : 'No') },
  { titulo: 'Activa', valor: (c) => (c.activa ? 'Sí' : 'No') },
]

type Edicion = { modo: 'nueva'; padre: Cuenta } | { modo: 'editar'; cuenta: Cuenta } | null

/** Plan Único de Cuentas: árbol de clase a auxiliar. Solo el último nivel recibe movimientos. */
export function TabCuentas() {
  const { llevaContabilidad } = usePermisos()
  const { data: cuentas = [], isLoading, error } = useCuentas()
  const [busqueda, setBusqueda] = useState('')
  const [edicion, setEdicion] = useState<Edicion>(null)

  const conHijas = useMemo(() => codigosConHijas(cuentas), [cuentas])
  const filas = useMemo(() => {
    const t = busqueda.trim().toLowerCase()
    const todas = cuentas.map((c) => ({ ...c, hoja: !conHijas.has(c.codigo) }))
    if (!t) return todas
    return todas.filter((c) => c.codigo.startsWith(t) || c.nombre.toLowerCase().includes(t))
  }, [cuentas, conHijas, busqueda])

  if (isLoading) return <LoadingBlock />
  if (error) return <p className="text-sm text-red-400">{mensajeError(error)}</p>

  return (
    <>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <label className="relative w-full max-w-sm">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-500" />
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por código o nombre"
            className="input pl-9"
            aria-label="Buscar cuenta"
          />
        </label>
        <MenuExportar
          documento={() => ({
            titulo: 'Plan de cuentas',
            archivo: 'plan_de_cuentas',
            ...tablaDesdeColumnas(columnasExportar, filas),
          })}
        />
      </div>

      <div className="overflow-hidden rounded-2xl border border-brand-border bg-brand-card">
        <table className="w-full text-sm">
          <thead className="border-b border-brand-border text-left text-xs tracking-wide text-slate-400 uppercase">
            <tr>
              <th className="px-4 py-3 font-medium">Código</th>
              <th className="px-4 py-3 font-medium">Cuenta</th>
              <th className="hidden px-4 py-3 font-medium sm:table-cell">Naturaleza</th>
              <th className="px-4 py-3 font-medium">Uso</th>
              {llevaContabilidad && <th className="px-4 py-3" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-brand-border">
            {filas.map((c) => (
              <tr key={c.codigo} className={c.activa ? '' : 'opacity-50'}>
                <td className="px-4 py-2 font-mono whitespace-nowrap text-slate-300">{c.codigo}</td>
                <td className={`px-4 py-2 ${c.nivel <= 2 ? 'font-semibold text-slate-100' : 'text-slate-300'}`}>
                  <span className={`${busqueda ? '' : SANGRIA[c.nivel]} block`}>{c.nombre}</span>
                </td>
                <td className="hidden px-4 py-2 text-slate-400 sm:table-cell">{NATURALEZAS[c.naturaleza]}</td>
                <td className="px-4 py-2">
                  <div className="flex flex-wrap gap-1">
                    {c.hoja && (
                      <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs text-emerald-400">
                        Recibe movimientos
                      </span>
                    )}
                    {c.exige_tercero && (
                      <span className="rounded-full bg-blue-500/15 px-2 py-0.5 text-xs text-blue-400">Con tercero</span>
                    )}
                    {!c.activa && (
                      <span className="rounded-full bg-slate-500/15 px-2 py-0.5 text-xs text-slate-400">Inactiva</span>
                    )}
                  </div>
                </td>
                {llevaContabilidad && (
                  <td className="px-4 py-2 text-right whitespace-nowrap">
                    {c.nivel < 5 && (
                      <button
                        onClick={() => setEdicion({ modo: 'nueva', padre: c })}
                        className="rounded-lg p-1.5 text-slate-400 hover:bg-tinte/5 hover:text-slate-200"
                        title={`Nueva subcuenta de ${c.codigo}`}
                        aria-label={`Nueva subcuenta de ${c.codigo}`}
                      >
                        <Plus className="size-4" />
                      </button>
                    )}
                    <button
                      onClick={() => setEdicion({ modo: 'editar', cuenta: c })}
                      className="rounded-lg p-1.5 text-slate-400 hover:bg-tinte/5 hover:text-slate-200"
                      title="Editar"
                      aria-label={`Editar ${c.codigo}`}
                    >
                      <Pencil className="size-4" />
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal
        open={edicion !== null}
        onClose={() => setEdicion(null)}
        title={
          edicion?.modo === 'nueva'
            ? `Nueva subcuenta de ${edicion.padre.codigo} ${edicion.padre.nombre}`
            : `Editar cuenta ${edicion?.cuenta.codigo ?? ''}`
        }
      >
        {edicion && (
          <CuentaForm
            key={edicion.modo === 'nueva' ? `n-${edicion.padre.codigo}` : edicion.cuenta.codigo}
            edicion={edicion}
            cuentas={cuentas}
            onClose={() => setEdicion(null)}
          />
        )}
      </Modal>
    </>
  )
}

function CuentaForm({
  edicion,
  cuentas,
  onClose,
}: {
  edicion: NonNullable<Edicion>
  cuentas: Cuenta[]
  onClose: () => void
}) {
  const crear = useCrearCuenta()
  const actualizar = useActualizarCuenta()
  const base = edicion.modo === 'nueva' ? edicion.padre : edicion.cuenta
  // Dígitos que agrega cada nivel: grupo 1, cuenta 2, subcuenta 2, auxiliar 2
  const digitos = edicion.modo === 'nueva' ? (base.codigo.length === 1 ? 1 : 2) : 0
  const [sufijo, setSufijo] = useState('')
  const [nombre, setNombre] = useState(edicion.modo === 'editar' ? base.nombre : '')
  const [naturaleza, setNaturaleza] = useState<Naturaleza>(base.naturaleza)
  const [exigeTercero, setExigeTercero] = useState(base.exige_tercero)
  const [activa, setActiva] = useState(edicion.modo === 'editar' ? base.activa : true)
  const [intento, setIntento] = useState(false)

  const codigo = edicion.modo === 'nueva' ? base.codigo + sufijo : base.codigo
  const errorSufijo =
    edicion.modo !== 'nueva'
      ? undefined
      : !new RegExp(`^[0-9]{${digitos}}$`).test(sufijo)
        ? `Escribe ${digitos} dígito${digitos > 1 ? 's' : ''}.`
        : cuentas.some((c) => c.codigo === codigo)
          ? `La cuenta ${codigo} ya existe.`
          : undefined
  const errorNombre = nombre.trim().length < 2 ? 'Escribe el nombre.' : undefined
  const mutacion = edicion.modo === 'nueva' ? crear : actualizar

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    setIntento(true)
    if (errorSufijo || errorNombre) return
    const datos = { nombre: nombre.trim(), naturaleza, exige_tercero: exigeTercero, activa }
    if (edicion.modo === 'nueva') crear.mutate({ codigo, ...datos }, { onSuccess: onClose })
    else actualizar.mutate({ codigo, ...datos }, { onSuccess: onClose })
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      {edicion.modo === 'nueva' && (
        <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-amber-400">
          Al crearle una subcuenta, la {base.codigo} deja de recibir movimientos. No se puede si ya los tiene o si la
          usan los asientos automáticos.
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Código *" error={intento ? errorSufijo : undefined} hint={`Nivel: ${NIVELES[base.nivel + (edicion.modo === 'nueva' ? 1 : 0)]}`}>
          {edicion.modo === 'nueva' ? (
            <div className="flex items-center gap-1">
              <span className="font-mono text-slate-400">{base.codigo}</span>
              <input
                value={sufijo}
                onChange={(e) => setSufijo(e.target.value.replace(/\D/g, '').slice(0, digitos))}
                inputMode="numeric"
                placeholder={'0'.repeat(digitos)}
                className="input font-mono"
                autoFocus
              />
            </div>
          ) : (
            <input value={codigo} disabled className="input font-mono" />
          )}
        </FormField>
        <FormField label="Naturaleza *">
          <select value={naturaleza} onChange={(e) => setNaturaleza(e.target.value as Naturaleza)} className="input">
            {Object.entries(NATURALEZAS).map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label="Nombre *" error={intento ? errorNombre : undefined} className="sm:col-span-2">
          <input
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            maxLength={120}
            className="input"
            autoFocus={edicion.modo === 'editar'}
          />
        </FormField>
      </div>
      <label className="flex items-center gap-2 text-sm text-slate-300">
        <input type="checkbox" checked={exigeTercero} onChange={(e) => setExigeTercero(e.target.checked)} />
        Exige tercero en cada línea (clientes, proveedores, retenciones…)
      </label>
      {edicion.modo === 'editar' && (
        <label className="flex items-center gap-2 text-sm text-slate-300">
          <input type="checkbox" checked={activa} onChange={(e) => setActiva(e.target.checked)} />
          Activa (una cuenta inactiva no recibe movimientos nuevos)
        </label>
      )}
      {mutacion.error && (
        <p role="alert" className="text-sm text-red-400">
          {mensajeError(mutacion.error)}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onClose} className="btn btn-secondary">
          Cancelar
        </button>
        <button type="submit" disabled={mutacion.isPending} className="btn btn-primary">
          {mutacion.isPending && <Loader2 className="size-4 animate-spin" />}
          {edicion.modo === 'nueva' ? 'Crear cuenta' : 'Guardar'}
        </button>
      </div>
    </form>
  )
}
