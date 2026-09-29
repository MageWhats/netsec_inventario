import { CheckCircle2, KeyRound, Loader2, ShieldAlert } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { FormField } from '@/components/ui/FormField'
import { LoadingBlock } from '@/components/ui/LoadingBlock'
import { PasswordInput } from '@/components/ui/PasswordInput'
import { useDefinirClaveAnulacion, useHayClaveAnulacion } from '@/features/movimientos/api'
import { mensajeError } from '@/lib/errores'

/** Clave de anulación: se pide para anular entradas y ventas (migración 0020) */
export function SeguridadTab() {
  const { data: hayClave, isLoading, error } = useHayClaveAnulacion()
  const definir = useDefinirClaveAnulacion()
  const [actual, setActual] = useState('')
  const [nueva, setNueva] = useState('')
  const [repetida, setRepetida] = useState('')
  const [intento, setIntento] = useState(false)
  const [guardada, setGuardada] = useState(false)

  if (isLoading) return <LoadingBlock />
  if (error) return <p className="text-sm text-red-400">{mensajeError(error)}</p>

  const errores: Record<string, string> = {}
  if (hayClave && !actual) errores.actual = 'Escribe la clave actual.'
  if (nueva.length < 4 || nueva.length > 32) errores.nueva = 'Entre 4 y 32 caracteres.'
  if (repetida !== nueva) errores.repetida = 'No coincide con la nueva clave.'

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    setIntento(true)
    setGuardada(false)
    if (Object.keys(errores).length) return
    definir.mutate(
      { p_nueva: nueva, p_actual: hayClave ? actual : null },
      {
        onSuccess: () => {
          setActual('')
          setNueva('')
          setRepetida('')
          setIntento(false)
          setGuardada(true)
        },
      },
    )
  }

  return (
    <section className="max-w-2xl rounded-2xl border border-brand-border bg-brand-card p-6">
      <div className="mb-5 flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-amber-500/15 text-amber-400">
          <KeyRound className="size-5" />
        </span>
        <div>
          <h2 className="font-semibold">Clave de anulación</h2>
          <p className="mt-1 text-sm text-slate-400">
            Se pide para anular una entrada o una venta, la última opción cuando algo se registró por error. Es distinta
            de las contraseñas de los usuarios: compártela solo con quien deba autorizar anulaciones. Se guarda cifrada
            y nadie puede verla, ni siquiera un administrador.
          </p>
        </div>
      </div>

      <p
        className={`mb-5 flex items-center gap-2 rounded-lg px-4 py-3 text-sm ${
          hayClave ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'
        }`}
      >
        {hayClave ? <CheckCircle2 className="size-4 shrink-0" /> : <ShieldAlert className="size-4 shrink-0" />}
        {hayClave
          ? 'La clave está definida. Puedes cambiarla con la clave actual.'
          : 'Aún no hay clave: mientras no la definas, no se puede anular ningún movimiento.'}
      </p>

      <form onSubmit={onSubmit} noValidate className="grid gap-4 sm:grid-cols-2">
        {hayClave && (
          <FormField label="Clave actual *" error={intento ? errores.actual : undefined} className="sm:col-span-2">
            <PasswordInput
              className="input"
              value={actual}
              onChange={(e) => setActual(e.target.value)}
              autoComplete="off"
            />
          </FormField>
        )}
        <FormField
          label={hayClave ? 'Nueva clave *' : 'Clave *'}
          error={intento ? errores.nueva : undefined}
          hint="Entre 4 y 32 caracteres"
        >
          <PasswordInput
            className="input"
            value={nueva}
            onChange={(e) => setNueva(e.target.value)}
            autoComplete="new-password"
          />
        </FormField>
        <FormField label="Repite la clave *" error={intento ? errores.repetida : undefined}>
          <PasswordInput
            className="input"
            value={repetida}
            onChange={(e) => setRepetida(e.target.value)}
            autoComplete="new-password"
          />
        </FormField>

        {definir.error && (
          <p role="alert" className="rounded-lg bg-red-500/10 px-4 py-3 text-sm text-red-400 sm:col-span-2">
            {mensajeError(definir.error)}
          </p>
        )}
        {guardada && (
          <p className="flex items-center gap-2 rounded-lg bg-emerald-500/10 px-4 py-3 text-sm text-emerald-400 sm:col-span-2">
            <CheckCircle2 className="size-4" />
            Clave guardada.
          </p>
        )}

        <div className="flex justify-end sm:col-span-2">
          <button type="submit" disabled={definir.isPending} className="btn btn-primary">
            {definir.isPending ? <Loader2 className="size-4 animate-spin" /> : <KeyRound className="size-4" />}
            {hayClave ? 'Cambiar clave' : 'Definir clave'}
          </button>
        </div>
      </form>

      <p className="mt-6 border-t border-brand-border pt-4 text-xs text-slate-500">
        Tras 5 intentos fallidos en 15 minutos, el usuario queda bloqueado 15 minutos. Si se olvida la clave, se borra
        desde Supabase → SQL Editor con{' '}
        <code className="text-slate-400">update public.seguridad set clave_anulacion = null;</code> y se define una
        nueva aquí.
      </p>
    </section>
  )
}
