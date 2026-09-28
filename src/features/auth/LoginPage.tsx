import { zodResolver } from '@hookform/resolvers/zod'
import { Clock, Loader2, Lock, Mail } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { useForm } from 'react-hook-form'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { z } from 'zod'
import { FullScreenLoader } from '@/components/ui/FullScreenLoader'
import { LogoCompleto } from '@/components/ui/Logo'
import { PasswordInput } from '@/components/ui/PasswordInput'
import { mostrarSplash } from '@/components/ui/splash'
import { useAuth } from './auth-context'
import { descartarAvisoInactividad, huboCierrePorInactividad, MINUTOS_INACTIVIDAD } from './inactividad'
import { Turnstile } from './Turnstile'

/** Si está configurada, el login exige la verificación anti-bots (también hay que activarla en Supabase) */
const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY?.trim() || null

/** Mensaje para el usuario según el error de Supabase Auth */
function mensajeLogin(error: unknown): string {
  const e = error as { status?: number; code?: string; message?: string } | null
  if (e?.status === 429 || e?.code === 'over_request_rate_limit') {
    return 'Demasiados intentos seguidos. Espera unos minutos antes de volver a intentarlo.'
  }
  if (e?.message?.toLowerCase().includes('captcha')) {
    return 'No se pudo completar la verificación anti-bots. Espera a que aparezca la marca de verificación e inténtalo de nuevo.'
  }
  if (e?.code === 'email_not_confirmed') return 'Este usuario aún no ha confirmado su email.'
  return 'Email o contraseña incorrectos'
}

const loginSchema = z.object({
  email: z.email('Introduce un email válido'),
  password: z.string().min(6, 'La contraseña debe tener al menos 6 caracteres'),
})

type LoginForm = z.infer<typeof loginSchema>

export function LoginPage() {
  const { session, loading, signIn } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [serverError, setServerError] = useState<string | null>(null)
  const [captchaToken, setCaptchaToken] = useState<string | null>(null)
  const [reinicioCaptcha, setReinicioCaptcha] = useState(0)
  const [cerradaPorInactividad] = useState(huboCierrePorInactividad)

  // El aviso se muestra una sola vez
  useEffect(() => {
    if (cerradaPorInactividad) descartarAvisoInactividad()
  }, [cerradaPorInactividad])

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginForm>({ resolver: zodResolver(loginSchema) })

  const from = (location.state as { from?: string } | null)?.from ?? '/'

  if (loading) return <FullScreenLoader />
  if (session) return <Navigate to={from} replace />

  async function onSubmit(values: LoginForm) {
    setServerError(null)
    try {
      await signIn(values.email, values.password, captchaToken ?? undefined)
      // La animación del logo cubre la carga del dashboard
      mostrarSplash()
      navigate(from, { replace: true })
    } catch (error) {
      setServerError(mensajeLogin(error))
      // Cada token de verificación sirve para un solo intento
      if (TURNSTILE_SITE_KEY) setReinicioCaptcha((n) => n + 1)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md rounded-2xl border border-brand-border bg-brand-card p-8 shadow-xl sm:p-10">
        <div className="mb-8 text-center">
          <LogoCompleto className="mx-auto mb-6 h-44 sm:h-56" />
          <h1 className="text-lg font-semibold">Inventario</h1>
          <p className="mt-1 text-sm text-slate-400">Inicia sesión para continuar</p>
        </div>

        {cerradaPorInactividad && (
          <p role="status" className="mb-4 flex items-start gap-2 rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-amber-300">
            <Clock className="mt-0.5 size-4 shrink-0" />
            Tu sesión se cerró tras {MINUTOS_INACTIVIDAD} minutos sin actividad. Vuelve a iniciar sesión.
          </p>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <Field label="Email" icon={<Mail className="size-4" />} error={errors.email?.message}>
            <input
              type="email"
              autoComplete="email"
              placeholder="admin@netsec.com"
              className="input pl-9"
              {...register('email')}
            />
          </Field>

          <Field label="Contraseña" icon={<Lock className="size-4" />} error={errors.password?.message}>
            <PasswordInput
              autoComplete="current-password"
              placeholder="••••••••"
              className="input pl-9"
              {...register('password')}
            />
          </Field>

          {serverError && (
            <p role="alert" className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">
              {serverError}
            </p>
          )}

          {TURNSTILE_SITE_KEY && (
            <Turnstile siteKey={TURNSTILE_SITE_KEY} onToken={setCaptchaToken} reinicio={reinicioCaptcha} />
          )}

          <button
            type="submit"
            disabled={isSubmitting || (TURNSTILE_SITE_KEY !== null && !captchaToken)}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand-accent py-2.5 font-medium text-white transition hover:bg-blue-500 disabled:opacity-60"
          >
            {isSubmitting && <Loader2 className="size-4 animate-spin" />}
            Entrar
          </button>
        </form>
      </div>
    </div>
  )
}

function Field({
  label,
  icon,
  error,
  children,
}: {
  label: string
  icon: ReactNode
  error?: string
  children: ReactNode
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm text-slate-300">{label}</span>
      <div className="relative">
        <span className="pointer-events-none absolute top-1/2 z-10 left-3 -translate-y-1/2 text-slate-500">{icon}</span>
        {children}
      </div>
      {error && <span className="mt-1 block text-xs text-red-400">{error}</span>}
    </label>
  )
}
