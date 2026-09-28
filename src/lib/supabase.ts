import { createClient } from '@supabase/supabase-js'
import { parseEnv } from '@/lib/env'
import type { Database } from '@/types/database'

// main.tsx valida la configuración antes de cargar la app, así que aquí siempre es válida
const { env, errors } = parseEnv()
if (errors) throw new Error(errors.join('\n'))

/**
 * La sesión se guarda en sessionStorage: el navegador la borra al cerrar la pestaña o la app,
 * así que hay que volver a iniciar sesión cada vez que se abre.
 */
function almacenSesion(): Storage | undefined {
  try {
    // Sesiones antiguas guardadas en localStorage (antes quedaban abiertas indefinidamente)
    for (const clave of Object.keys(localStorage)) {
      if (clave.startsWith('sb-') && clave.endsWith('-auth-token')) localStorage.removeItem(clave)
    }
    return sessionStorage
  } catch {
    return undefined // Sin acceso al almacenamiento: Supabase usa su valor por defecto
  }
}

export const supabase = createClient<Database>(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
  auth: { storage: almacenSesion() },
})
