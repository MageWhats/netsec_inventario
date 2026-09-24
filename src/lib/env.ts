import { z } from 'zod'

const envSchema = z.object({
  VITE_SUPABASE_URL: z
    .string({ error: 'Falta la variable VITE_SUPABASE_URL' })
    .trim()
    .regex(
      /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/,
      'VITE_SUPABASE_URL debe tener el formato https://<id-proyecto>.supabase.co (la "Project URL" de Project Settings → API)',
    ),
  VITE_SUPABASE_ANON_KEY: z
    .string({ error: 'Falta la variable VITE_SUPABASE_ANON_KEY' })
    .trim()
    .min(20, 'VITE_SUPABASE_ANON_KEY parece vacía o incompleta'),
})

export type Env = z.infer<typeof envSchema>

export function parseEnv(): { env: Env; errors: null } | { env: null; errors: string[] } {
  const result = envSchema.safeParse(import.meta.env)
  if (result.success) return { env: result.data, errors: null }
  return { env: null, errors: result.error.issues.map((issue) => issue.message) }
}
