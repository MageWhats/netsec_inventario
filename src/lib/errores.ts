import type { PostgrestError } from '@supabase/supabase-js'

/** Traduce los errores de Supabase/Postgres a mensajes legibles para el usuario */
export function mensajeError(error: unknown): string {
  const pgError = error as Partial<PostgrestError> | null
  if (pgError?.code === '23505') {
    if (pgError.message?.includes('codigo_barras')) return 'Ya existe otro producto con ese código de barras.'
    if (pgError.message?.includes('productos_sku')) return 'Ya existe otro producto con ese SKU.'
    if (pgError.message?.includes('clientes_tipo_documento')) return 'Ya existe un cliente con ese documento.'
    if (pgError.message?.includes('proveedores_nit')) return 'Ya existe un proveedor con ese NIT.'
    if (pgError.message?.includes('categorias_nombre')) return 'Ya existe una categoría con ese nombre.'
    if (pgError.message?.includes('bodegas_nombre')) return 'Ya existe una bodega con ese nombre.'
    return 'Ya existe un registro con esos datos.'
  }
  if (pgError?.code === '23503') return 'No se puede eliminar porque tiene registros asociados.'
  if (pgError?.code === '42501') return 'No tienes permisos para realizar esta acción.'
  // Reglas de la migración 0006: se llaman <tabla>_<campo>_formato / _largo
  if (pgError?.code === '23514') {
    const regla = /constraint "\w+?_(\w+)_(formato|largo|bucket)"/.exec(pgError.message ?? '')
    const campo = regla?.[1]?.replaceAll('_', ' ')
    if (regla?.[2] === 'largo') return `El campo «${campo}» es demasiado largo.`
    if (campo) return `El campo «${campo}» no tiene un formato válido.`
    return 'Algún dato no cumple las reglas permitidas.'
  }

  // Supabase Storage (fotos)
  const mensaje = (error as { message?: string } | null)?.message ?? ''
  if (/exceeded the maximum allowed size/i.test(mensaje)) return 'La foto supera el tamaño máximo (2 MB).'
  if (/mime type/i.test(mensaje)) return 'Formato de imagen no permitido: usa JPG, PNG o WebP.'
  if (/row-level security|unauthorized/i.test(mensaje)) return 'No tienes permisos para realizar esta acción.'
  if (/bucket not found/i.test(mensaje)) return 'Falta configurar el almacenamiento de fotos (migración 0007).'
  // Los errores de validación de registrar_movimiento() (RAISE EXCEPTION) ya vienen en español
  return pgError?.message ?? 'Ocurrió un error inesperado.'
}
