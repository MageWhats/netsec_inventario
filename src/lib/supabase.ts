import { createClient } from '@supabase/supabase-js'
import { parseEnv } from '@/lib/env'
import type { Database } from '@/types/database'

// main.tsx valida la configuración antes de cargar la app, así que aquí siempre es válida
const { env, errors } = parseEnv()
if (errors) throw new Error(errors.join('\n'))

export const supabase = createClient<Database>(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY)
