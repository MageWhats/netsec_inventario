import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Enums } from '@/types/database'
import { useAuth } from './auth-context'

export type Rol = Enums<'rol_usuario'>

export const ROLES: Record<Rol, { label: string; descripcion: string }> = {
  admin: { label: 'Administrador', descripcion: 'Acceso total, incluida la configuración y los usuarios' },
  bodega: {
    label: 'Bodega',
    descripcion: 'Registra entradas, salidas y conteos. No ve costos, márgenes ni reportes',
  },
  lectura: { label: 'Solo lectura', descripcion: 'Ve todo, incluidos costos y reportes, pero no modifica nada' },
  contador: {
    label: 'Contador',
    descripcion: 'Lleva la contabilidad: comprobantes, plan de cuentas y cierres. Ve el inventario sin modificarlo',
  },
}

/** Perfil del usuario con sesión iniciada (null si no tiene) */
export function usePerfil() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['perfil', user?.id],
    enabled: Boolean(user),
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('perfiles')
        .select('id, nombre, email, rol, activo')
        .eq('id', user!.id)
        .maybeSingle()
      if (error) throw error
      return data
    },
  })
}

export interface Permisos {
  rol: Rol | null
  /** Todo: productos, clientes, proveedores, ajustes, tomas, configuración */
  esAdmin: boolean
  /** Registrar entradas y salidas, y contar en tomas de inventario */
  puedeOperar: boolean
  /** Costos, márgenes, valor del inventario y reportes */
  verCostos: boolean
  /** Consultar la contabilidad: comprobantes, libros y balance */
  verContabilidad: boolean
  /** Registrar comprobantes, configurar cuentas y cerrar periodos */
  llevaContabilidad: boolean
  /** Reabrir un periodo cerrado: solo el contador */
  esContador: boolean
}

export function permisosDe(rol: Rol | null | undefined): Permisos {
  return {
    rol: rol ?? null,
    esAdmin: rol === 'admin',
    puedeOperar: rol === 'admin' || rol === 'bodega',
    verCostos: rol === 'admin' || rol === 'lectura' || rol === 'contador',
    verContabilidad: rol === 'admin' || rol === 'lectura' || rol === 'contador',
    llevaContabilidad: rol === 'admin' || rol === 'contador',
    esContador: rol === 'contador',
  }
}

/** Solo decide qué se muestra: la base de datos aplica las mismas reglas por su cuenta */
export function usePermisos(): Permisos {
  const { data: perfil } = usePerfil()
  return permisosDe(perfil?.activo ? perfil.rol : null)
}
