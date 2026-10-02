import { Banknote, Landmark, Loader2, Pencil, Plus } from 'lucide-react'
import { useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { FormField } from '@/components/ui/FormField'
import { LoadingBlock } from '@/components/ui/LoadingBlock'
import { Modal } from '@/components/ui/Modal'
import { usePermisos } from '@/features/auth/permisos'
import { formatearValor, useCuentas } from '@/features/contabilidad/api'
import { SelectorCuenta } from '@/features/contabilidad/components/Selectores'
import { mensajeError } from '@/lib/errores'
import {
  useActualizarCuentaTesoreria,
  useCrearCuentaTesoreria,
  useCuentasTesoreria,
  type CuentaTesoreria,
} from '../api'

/** Cada caja y cada cuenta bancaria con su saldo contable de hoy */
export function TabCuentas() {
  const { llevaContabilidad } = usePermisos()
  const { data: cuentas = [], isLoading, error } = useCuentasTesoreria()
  const [edicion, setEdicion] = useState<CuentaTesoreria | 'nueva' | null>(null)
  const total = cuentas.filter((c) => c.activa).reduce((s, c) => s + Number(c.saldo), 0)

  if (isLoading) return <LoadingBlock />
  if (error) return <p className="text-sm text-red-400">{mensajeError(error)}</p>

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-400">
          Dinero disponible hoy: <strong className="text-lg text-slate-100">{formatearValor(total)}</strong>
        </p>
        {llevaContabilidad && (
          <button onClick={() => setEdicion('nueva')} className="btn btn-primary">
            <Plus className="size-4" />
            Nueva caja o banco
          </button>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {cuentas.map((c) => {
          const Icono = c.tipo === 'banco' ? Landmark : Banknote
          return (
            <div
              key={c.id}
              className={`rounded-2xl border border-brand-border bg-brand-card p-4 ${c.activa ? '' : 'opacity-50'}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-medium">{c.nombre}</p>
                  <p className="truncate text-xs text-slate-500">
                    {[c.banco, c.numero_cuenta, `PUC ${c.cuenta}`].filter(Boolean).join(' · ')}
                    {!c.activa && ' · inactiva'}
                  </p>
                </div>
                <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-emerald-500/15 text-emerald-400">
                  <Icono className="size-4.5" />
                </span>
              </div>
              <p className={`mt-3 text-xl font-semibold ${Number(c.saldo) < 0 ? 'text-red-400' : ''}`}>
                {formatearValor(Number(c.saldo))}
              </p>
              <div className="mt-3 flex items-center justify-between text-sm">
                <Link to={`/contabilidad?t=auxiliar&cuenta=${c.cuenta}`} className="text-brand-cyan hover:underline">
                  Ver movimientos
                </Link>
                {llevaContabilidad && (
                  <button
                    onClick={() => setEdicion(c)}
                    className="rounded-lg p-1.5 text-slate-400 hover:bg-tinte/5 hover:text-slate-200"
                    aria-label={`Editar ${c.nombre}`}
                  >
                    <Pencil className="size-4" />
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <Modal
        open={edicion !== null}
        onClose={() => setEdicion(null)}
        title={edicion === 'nueva' ? 'Nueva caja o cuenta bancaria' : `Editar ${edicion?.nombre ?? ''}`}
      >
        {edicion === 'nueva' && <NuevaForm onClose={() => setEdicion(null)} />}
        {edicion && edicion !== 'nueva' && <EditarForm key={edicion.id} cuenta={edicion} onClose={() => setEdicion(null)} />}
      </Modal>
    </>
  )
}

function NuevaForm({ onClose }: { onClose: () => void }) {
  const crear = useCrearCuentaTesoreria()
  const cuentasPuc = useCuentas()
  const [tipo, setTipo] = useState<'banco' | 'caja'>('banco')
  const [nombre, setNombre] = useState('')
  const [banco, setBanco] = useState('')
  const [numero, setNumero] = useState('')
  const [existente, setExistente] = useState(false)
  const [cuenta, setCuenta] = useState('')
  const [intento, setIntento] = useState(false)
  const disponibles = useMemo(() => (cuentasPuc.data ?? []).filter((c) => c.codigo.startsWith('11')), [cuentasPuc.data])

  const errorNombre = nombre.trim().length < 2 ? 'Escribe el nombre.' : undefined
  const errorCuenta = existente && !cuenta ? 'Elige la cuenta del PUC.' : undefined

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    setIntento(true)
    if (errorNombre || errorCuenta) return
    crear.mutate(
      {
        p_nombre: nombre.trim(),
        p_tipo: tipo,
        p_banco: tipo === 'banco' ? banco.trim() || null : null,
        p_numero_cuenta: tipo === 'banco' ? numero.trim() || null : null,
        p_cuenta: existente ? cuenta : null,
      },
      { onSuccess: onClose },
    )
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      <div className="flex gap-2" role="radiogroup">
        {(['banco', 'caja'] as const).map((t) => (
          <button
            key={t}
            type="button"
            role="radio"
            aria-checked={tipo === t}
            onClick={() => setTipo(t)}
            className={`btn flex-1 ${tipo === t ? 'btn-primary' : 'btn-secondary'}`}
          >
            {t === 'banco' ? 'Cuenta bancaria' : 'Caja'}
          </button>
        ))}
      </div>
      <FormField label="Nombre *" error={intento ? errorNombre : undefined}>
        <input
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          maxLength={100}
          placeholder={tipo === 'banco' ? 'Bancolombia ahorros' : 'Caja menor'}
          className="input"
          autoFocus
        />
      </FormField>
      {tipo === 'banco' && (
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Banco">
            <input value={banco} onChange={(e) => setBanco(e.target.value)} maxLength={100} className="input" />
          </FormField>
          <FormField label="Número de cuenta">
            <input value={numero} onChange={(e) => setNumero(e.target.value)} maxLength={40} className="input" />
          </FormField>
        </div>
      )}
      <label className="flex items-center gap-2 text-sm text-slate-300">
        <input type="checkbox" checked={existente} onChange={(e) => setExistente(e.target.checked)} />
        Usar una cuenta del PUC que ya existe
      </label>
      {existente ? (
        <FormField label="Cuenta del PUC *" error={intento ? errorCuenta : undefined}>
          <SelectorCuenta cuentas={disponibles} soloMovimiento value={cuenta} onChange={setCuenta} />
        </FormField>
      ) : (
        <p className="text-xs text-slate-500">
          Se crea su auxiliar en el PUC: {tipo === 'banco' ? 'bajo 111005 (11100501, 11100502…)' : 'bajo 1105 (110510, 110515…)'}.
          Si 111005 ya tiene movimientos, no admite auxiliares: usa entonces una cuenta que ya exista.
        </p>
      )}
      {crear.error && (
        <p role="alert" className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">
          {mensajeError(crear.error)}
        </p>
      )}
      <div className="flex justify-end gap-3">
        <button type="button" onClick={onClose} className="btn btn-secondary">
          Cancelar
        </button>
        <button type="submit" disabled={crear.isPending} className="btn btn-primary">
          {crear.isPending && <Loader2 className="size-4 animate-spin" />}
          Crear
        </button>
      </div>
    </form>
  )
}

function EditarForm({ cuenta, onClose }: { cuenta: CuentaTesoreria; onClose: () => void }) {
  const actualizar = useActualizarCuentaTesoreria()
  const [nombre, setNombre] = useState(cuenta.nombre)
  const [banco, setBanco] = useState(cuenta.banco ?? '')
  const [numero, setNumero] = useState(cuenta.numero_cuenta ?? '')
  const [activa, setActiva] = useState(cuenta.activa)

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (nombre.trim().length < 2) return
    actualizar.mutate(
      { id: cuenta.id, nombre: nombre.trim(), banco: banco.trim() || null, numero_cuenta: numero.trim() || null, activa },
      { onSuccess: onClose },
    )
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <FormField label="Nombre *">
        <input value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={100} className="input" autoFocus />
      </FormField>
      {cuenta.tipo === 'banco' && (
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Banco">
            <input value={banco} onChange={(e) => setBanco(e.target.value)} maxLength={100} className="input" />
          </FormField>
          <FormField label="Número de cuenta">
            <input value={numero} onChange={(e) => setNumero(e.target.value)} maxLength={40} className="input" />
          </FormField>
        </div>
      )}
      <label className="flex items-center gap-2 text-sm text-slate-300">
        <input type="checkbox" checked={activa} onChange={(e) => setActiva(e.target.checked)} />
        Activa (una inactiva no recibe pagos ni cobros nuevos)
      </label>
      {actualizar.error && (
        <p role="alert" className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">
          {mensajeError(actualizar.error)}
        </p>
      )}
      <div className="flex justify-end gap-3">
        <button type="button" onClick={onClose} className="btn btn-secondary">
          Cancelar
        </button>
        <button type="submit" disabled={actualizar.isPending} className="btn btn-primary">
          {actualizar.isPending && <Loader2 className="size-4 animate-spin" />}
          Guardar
        </button>
      </div>
    </form>
  )
}
