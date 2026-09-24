import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2, Lock, Mail, PackageSearch } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { useForm } from 'react-hook-form'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { z } from 'zod'
import { FullScreenLoader } from '@/components/ui/FullScreenLoader'
import { useAuth } from './auth-context'

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
      await signIn(values.email, values.password)
      navigate(from, { replace: true })
    } catch {
      setServerError('Email o contraseña incorrectos')
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-2xl border border-brand-border bg-brand-card p-8 shadow-xl">
        <div className="mb-8 text-center">
          <PackageSearch className="mx-auto mb-3 size-10 text-brand-accent" />
          <h1 className="bg-gradient-to-r from-brand-accent to-brand-cyan bg-clip-text text-2xl font-bold text-transparent">
            Net&amp;Sec Inventario
          </h1>
          <p className="mt-1 text-sm text-slate-400">Inicia sesión para continuar</p>
        </div>

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
            <input
              type="password"
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

          <button
            type="submit"
            disabled={isSubmitting}
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
        <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-slate-500">{icon}</span>
        {children}
      </div>
      {error && <span className="mt-1 block text-xs text-red-400">{error}</span>}
    </label>
  )
}
