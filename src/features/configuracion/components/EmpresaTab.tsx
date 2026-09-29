import { zodResolver } from '@hookform/resolvers/zod'
import { CheckCircle2, Loader2, Save } from 'lucide-react'
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { FormField } from '@/components/ui/FormField'
import { LoadingBlock } from '@/components/ui/LoadingBlock'
import { mensajeError } from '@/lib/errores'
import { useEmpresa, useGuardarEmpresa } from '../api'
import { empresaAFormulario, empresaSchema, formularioAEmpresa, type EmpresaForm } from '../schema'

/** Datos que encabezan las remisiones y comprobantes en PDF */
export function EmpresaTab() {
  const { data: empresa, isLoading, error } = useEmpresa()
  const guardar = useGuardarEmpresa()
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<EmpresaForm>({ resolver: zodResolver(empresaSchema) })

  useEffect(() => {
    if (empresa) reset(empresaAFormulario(empresa))
  }, [empresa, reset])

  if (isLoading) return <LoadingBlock />
  if (error || !empresa) {
    return (
      <p className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400">
        {error ? mensajeError(error) : 'Falta ejecutar la migración 0016_empresa_y_garantias.sql en Supabase.'}
      </p>
    )
  }

  function onSubmit(valores: EmpresaForm) {
    guardar.mutate(formularioAEmpresa(valores), { onSuccess: () => reset(valores) })
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="max-w-3xl space-y-6">
      <p className="text-sm text-slate-400">
        Estos datos encabezan las remisiones y comprobantes en PDF que se descargan desde cada movimiento.
      </p>

      <section className="grid gap-4 rounded-2xl border border-brand-border bg-brand-card p-6 md:grid-cols-2">
        <FormField label="Razón social *" error={errors.nombre?.message} className="md:col-span-2">
          <input className="input" {...register('nombre')} />
        </FormField>
        <FormField label="NIT" error={errors.nit?.message}>
          <input className="input" placeholder="900.123.456-7" {...register('nit')} />
        </FormField>
        <FormField label="Teléfono" error={errors.telefono?.message}>
          <input className="input" inputMode="tel" {...register('telefono')} />
        </FormField>
        <FormField label="Dirección" error={errors.direccion?.message}>
          <input className="input" {...register('direccion')} />
        </FormField>
        <FormField label="Ciudad" error={errors.ciudad?.message}>
          <input className="input" {...register('ciudad')} />
        </FormField>
        <FormField label="Email" error={errors.email?.message}>
          <input type="email" className="input" {...register('email')} />
        </FormField>
        <FormField label="Sitio web" error={errors.sitio_web?.message}>
          <input className="input" placeholder="www.netsec.com.co" {...register('sitio_web')} />
        </FormField>
        <FormField
          label="Pie de las remisiones"
          error={errors.pie_documentos?.message}
          hint="Condiciones de garantía, cuentas para pagos… Sale al final de cada remisión"
          className="md:col-span-2"
        >
          <textarea rows={4} maxLength={1000} className="input" {...register('pie_documentos')} />
        </FormField>
      </section>

      {guardar.error && (
        <p role="alert" className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">
          {mensajeError(guardar.error)}
        </p>
      )}

      <div className="flex items-center justify-end gap-3">
        {guardar.isSuccess && !isDirty && (
          <span className="flex items-center gap-1.5 text-sm text-emerald-400">
            <CheckCircle2 className="size-4" />
            Guardado
          </span>
        )}
        <button type="submit" disabled={guardar.isPending || !isDirty} className="btn btn-primary">
          {guardar.isPending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
          Guardar cambios
        </button>
      </div>
    </form>
  )
}
