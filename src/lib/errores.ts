import type { PostgrestError } from '@supabase/supabase-js'

/** Traduce los errores de Supabase/Postgres a mensajes legibles para el usuario */
export function mensajeError(error: unknown): string {
  const pgError = error as Partial<PostgrestError> | null
  if (pgError?.code === '23505') {
    if (pgError.message?.includes('codigo_barras')) return 'Ya existe otro producto con ese código de barras.'
    if (pgError.message?.includes('productos_sku')) return 'Ya existe otro producto con ese SKU.'
    if (pgError.message?.includes('clientes_tipo_documento')) return 'Ya existe un cliente con ese documento.'
    if (pgError.message?.includes('proveedores_nit')) return 'Ya existe un proveedor con ese NIT.'
    return 'Ya existe un registro con esos datos.'
  }
  if (pgError?.code === '23503') return 'No se puede eliminar porque tiene registros asociados.'
  if (pgError?.code === '42501') return 'No tienes permisos para realizar esta acción.'
  // Los errores de validación de registrar_movimiento() (RAISE EXCEPTION) ya vienen en español
  return pgError?.message ?? 'Ocurrió un error inesperado.'
}
