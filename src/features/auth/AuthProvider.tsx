import type { Session } from '@supabase/supabase-js'
import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { supabase } from '@/lib/supabase'
import { AuthContext, type AuthContextValue } from './auth-context'
import { reiniciarActividad, useCierrePorInactividad } from './inactividad'

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })

    const { data } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession)
    })
    return () => data.subscription.unsubscribe()
  }, [])

  const signOut = useCallback(async () => {
    reiniciarActividad(false)
    await supabase.auth.signOut()
    // Evita que datos del usuario anterior queden en caché
    queryClient.clear()
  }, [queryClient])

  useCierrePorInactividad(session !== null, signOut)

  const value: AuthContextValue = {
    session,
    user: session?.user ?? null,
    loading,
    async signIn(email, password, captchaToken) {
      // Antes de iniciar sesión, para que el contador de inactividad no arranque con el valor de una sesión vieja
      reiniciarActividad(true)
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
        options: captchaToken ? { captchaToken } : undefined,
      })
      if (error) throw error
    },
    signOut,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
