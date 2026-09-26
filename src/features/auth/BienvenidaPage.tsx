import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2, Lock } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, useNavigate } from 'react-router-dom'
import { z } from 'zod'
import { FormField } from '@/components/ui/FormField'
import { FullScreenLoader } from '@/components/ui/FullScreenLoader'
import { LogoCompleto } from '@/components/ui/Logo'
import { supabase } from '@/lib/supabase'
import { useAuth } from './auth-context'

const contrasenaSchema = z
  .object({
    password: z.string().min(8, 'Mínimo 8 caracteres').max(72, 'Máximo 72 caracteres'),
    confirmacion: z.string(),
  })
  .refine((v) => v.password === v.confirmacion, { path: ['confirmacion'], message: 'Las contraseñas no coinciden' })

type ContrasenaForm = z.infer<typeof contrasenaSchema>

/**
 * Destino de los enlaces de invitación y de cambio de contraseña que envía la
 * Edge Function "usuarios". Supabase inicia la sesión con el enlace; aquí la
 * persona define su contraseña para poder entrar después con email y clave.
 */
export function BienvenidaPage() {
  const { session, loading, user } = useAuth()
  const navigate = useNavigate()
  const [errorServidor, setErrorServidor] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ContrasenaForm>({ resolver: zodResolver(contrasenaSchema) })

  if (loading) return <FullScreenLoader />

  async function onSubmit({ password }: ContrasenaForm) {
    setErrorServidor(null)
    const { error } = await supabase.auth.updateUser({ password })
    if (error) {
      setErrorServidor(
        error.code === 'weak_password'
          ? 'La contraseña es muy débil: usa una más larga, con letras y números.'
          : error.code === 'same_password'
            ? 'La nueva contraseña debe ser distinta a la anterior.'
            : 'No se pudo guardar la contraseña. Inténtalo de nuevo.',
      )
      return
    }
    navigate('/', { replace: true })
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md rounded-2xl border border-brand-border bg-brand-card p-8 shadow-xl sm:p-10">
        <div className="mb-8 text-center">
          <LogoCompleto className="mx-auto mb-6 h-32 sm:h-40" />
          <h1 className="text-lg font-semibold">Bienvenido al inventario</h1>
          {session && (
            <p className="mt-1 text-sm text-slate-400">
              Crea tu contraseña para <span className="text-slate-200">{user?.email}</span>
            </p>
          )}
        </div>

        {!session ? (
          <div className="space-y-4 text-center text-sm text-slate-400">
            <p>El enlace no es válido o ya expiró. Pide al administrador que te reenvíe la invitación.</p>
            <Link to="/login" className="text-brand-cyan hover:underline">
              Ir al inicio de sesión
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
            <FormField label="Contraseña" error={errors.password?.message}>
              <input type="password" autoComplete="new-password" className="input" autoFocus {...register('password')} />
            </FormField>
            <FormField label="Repite la contraseña" error={errors.confirmacion?.message}>
              <input type="password" autoComplete="new-password" className="input" {...register('confirmacion')} />
            </FormField>

            {errorServidor && (
              <p role="alert" className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">
                {errorServidor}
              </p>
            )}

            <button type="submit" disabled={isSubmitting} className="btn btn-primary w-full justify-center">
              {isSubmitting ? <Loader2 className="size-4 animate-spin" /> : <Lock className="size-4" />}
              Guardar y entrar
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
