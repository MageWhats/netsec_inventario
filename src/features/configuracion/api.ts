import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { FunctionsFetchError, FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import type { Enums, TablesInsert, TablesUpdate } from '@/types/database'

// Prefijos compartidos con useCategorias() (productos) y useBodegas() (movimientos):
// al invalidarlos se refrescan también los selectores del resto de la app.
const categoriasKeys = {
  all: ['categorias'] as const,
  conUso: () => [...categoriasKeys.all, 'con-uso'] as const,
}

const bodegasKeys = {
  all: ['bodegas'] as const,
  conUso: () => [...bodegasKeys.all, 'con-uso'] as const,
}

/** Categorías con la cantidad de productos que las usan (para saber si se pueden eliminar) */
export function useCategoriasConUso() {
  return useQuery({
    queryKey: categoriasKeys.conUso(),
    queryFn: async () => {
      // productos(count) lee la fila completa y choca con el permiso por columnas de 0015 (precio_costo)
      const { data, error } = await supabase.from('categorias').select('*, productos(id)').order('nombre')
      if (error) throw error
      return data.map(({ productos, ...categoria }) => ({ ...categoria, productos: productos.length }))
    },
  })
}

export type CategoriaConUso = NonNullable<ReturnType<typeof useCategoriasConUso>['data']>[number]

export function useGuardarCategoria() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, valores }: { id?: string; valores: TablesInsert<'categorias'> }) => {
      const query = id
        ? supabase.from('categorias').update(valores).eq('id', id)
        : supabase.from('categorias').insert(valores)
      const { error } = await query
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: categoriasKeys.all }),
  })
}

export function useEliminarCategoria() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('categorias').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: categoriasKeys.all }),
  })
}

/** Todas las bodegas (activas e inactivas) con la cantidad de movimientos registrados en cada una */
export function useBodegasConUso() {
  return useQuery({
    queryKey: bodegasKeys.conUso(),
    queryFn: async () => {
      const { data, error } = await supabase.from('bodegas').select('*, movimientos(count)').order('created_at')
      if (error) throw error
      return data.map(({ movimientos, ...bodega }) => ({ ...bodega, movimientos: movimientos[0]?.count ?? 0 }))
    },
  })
}

export type BodegaConUso = NonNullable<ReturnType<typeof useBodegasConUso>['data']>[number]

export function useGuardarBodega() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, valores }: { id?: string; valores: TablesInsert<'bodegas'> }) => {
      const query = id
        ? supabase.from('bodegas').update(valores).eq('id', id)
        : supabase.from('bodegas').insert(valores)
      const { error } = await query
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: bodegasKeys.all }),
  })
}

export function useCambiarActivaBodega() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, activa }: { id: string; activa: boolean }) => {
      const { error } = await supabase.from('bodegas').update({ activa }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: bodegasKeys.all }),
  })
}

export function useEliminarBodega() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('bodegas').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: bodegasKeys.all }),
  })
}

// ---------------------------------------------------------------------
// Empresa: una sola fila con los datos que encabezan los documentos (migración 0016)
// ---------------------------------------------------------------------
const empresaKeys = { all: ['empresa'] as const }

export function useEmpresa() {
  return useQuery({
    queryKey: empresaKeys.all,
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from('empresa').select('*').maybeSingle()
      if (error) throw error
      return data
    },
  })
}

export function useGuardarEmpresa() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (valores: TablesUpdate<'empresa'>) => {
      const { error } = await supabase.from('empresa').update(valores).eq('id', true)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: empresaKeys.all }),
  })
}

// ---------------------------------------------------------------------
// Usuarios
// ---------------------------------------------------------------------
const usuariosKeys = { all: ['usuarios'] as const }

/** Lista de usuarios con su estado de invitación (función usuarios_admin, solo admin) */
export function useUsuarios() {
  return useQuery({
    queryKey: usuariosKeys.all,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('usuarios_admin')
      if (error) throw error
      return data
    },
  })
}

export type Usuario = NonNullable<ReturnType<typeof useUsuarios>['data']>[number]

type AccionUsuario =
  | { accion: 'invitar'; email: string; nombre: string; rol: Enums<'rol_usuario'> }
  | { accion: 'reenviar' | 'desactivar' | 'reactivar'; id: string }

/** Acciones sobre cuentas de Auth: pasan por la Edge Function "usuarios" (usa la clave de servicio) */
export function useAccionUsuario() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (cuerpo: AccionUsuario) => {
      const { error } = await supabase.functions.invoke('usuarios', { body: cuerpo })
      if (!error) return
      // La función responde { error: "mensaje" } con el motivo en español
      if (error instanceof FunctionsHttpError) {
        const respuesta = await error.context.json().catch(() => null)
        if (respuesta?.error) throw new Error(respuesta.error)
      }
      if (error instanceof FunctionsFetchError) {
        throw new Error('No se pudo contactar el servicio de usuarios. ¿Está desplegada la Edge Function "usuarios"?')
      }
      throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: usuariosKeys.all }),
  })
}

export function useGuardarUsuario() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, valores }: { id: string; valores: { nombre: string; rol: Enums<'rol_usuario'> } }) => {
      const { error } = await supabase.from('perfiles').update(valores).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: usuariosKeys.all })
      queryClient.invalidateQueries({ queryKey: ['perfil'] })
    },
  })
}
