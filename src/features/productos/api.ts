import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { traerCostosProductos } from '@/lib/costos'
import { prepararFoto } from '@/lib/imagen'
import { traerTodo } from '@/lib/paginar'
import type { Json, Tables, TablesInsert, TablesUpdate } from '@/types/database'

export type Categoria = Tables<'categorias'>
export type Familia = Tables<'familias'>
export type Unidad = Tables<'unidades'>

export type Producto = Tables<'productos'> & {
  categoria: Pick<Categoria, 'id' | 'nombre'> | null
  /** Producto con colores al que pertenece (null si no tiene colores) */
  familia: Pick<Familia, 'id' | 'nombre' | 'sku_base'> | null
  /** Suma del stock en todas las bodegas (calculado desde los movimientos) */
  stock: number
}

export const productosKeys = {
  all: ['productos'] as const,
  lista: () => [...productosKeys.all, 'lista'] as const,
  detalle: (id: string) => [...productosKeys.all, 'detalle', id] as const,
  tieneMovimientos: (id: string) => [...productosKeys.all, 'tiene-movimientos', id] as const,
  unidades: (id: string) => [...productosKeys.all, 'unidades', id] as const,
  busquedaSerie: (texto: string) => [...productosKeys.all, 'busqueda-serie', texto] as const,
}

// Todas las columnas menos precio_costo, que no se puede leer de la tabla (migración 0015): llega de traerCostosProductos
const SELECT_PRODUCTO = `
  id, sku, nombre, descripcion, categoria_id, marca, modelo, codigo_barras, es_serializado, precio_venta,
  stock_minimo, activo, imagen_url, created_at, updated_at, familia_id, color,
  categoria:categorias(id, nombre), familia:familias(id, nombre, sku_base)
`

async function obtenerStock(productoId?: string) {
  const { filas: data } = await traerTodo((desde, hasta) => {
    let query = supabase.from('stock_actual').select('producto_id, cantidad').order('producto_id').order('bodega_id')
    if (productoId) query = query.eq('producto_id', productoId)
    return query.range(desde, hasta)
  })

  const stock = new Map<string, number>()
  for (const fila of data) {
    if (!fila.producto_id) continue
    stock.set(fila.producto_id, (stock.get(fila.producto_id) ?? 0) + (fila.cantidad ?? 0))
  }
  return stock
}

// ---------------------------------------------------------------------
// Consultas
// ---------------------------------------------------------------------

export function useProductos() {
  return useQuery({
    queryKey: productosKeys.lista(),
    queryFn: async (): Promise<Producto[]> => {
      const [{ filas: data }, stock, costos] = await Promise.all([
        traerTodo((desde, hasta) =>
          supabase.from('productos').select(SELECT_PRODUCTO).order('nombre').order('id').range(desde, hasta),
        ),
        obtenerStock(),
        traerCostosProductos(),
      ])
      return data.map((p) => ({ ...p, precio_costo: costos.get(p.id) ?? 0, stock: stock.get(p.id) ?? 0 }))
    },
  })
}

export function useProducto(id: string) {
  return useQuery({
    queryKey: productosKeys.detalle(id),
    queryFn: async (): Promise<Producto | null> => {
      const [{ data, error }, stock, costos] = await Promise.all([
        supabase.from('productos').select(SELECT_PRODUCTO).eq('id', id).maybeSingle(),
        obtenerStock(id),
        traerCostosProductos(),
      ])
      if (error) throw error
      return data && { ...data, precio_costo: costos.get(data.id) ?? 0, stock: stock.get(data.id) ?? 0 }
    },
  })
}

/** Si el producto ya tiene movimientos, no se puede cambiar su modo de control (serial / cantidad) */
export function useTieneMovimientos(id: string | undefined) {
  return useQuery({
    queryKey: productosKeys.tieneMovimientos(id ?? ''),
    enabled: Boolean(id),
    queryFn: async () => {
      const { count, error } = await supabase
        .from('movimiento_items')
        .select('id', { count: 'exact', head: true })
        .eq('producto_id', id!)
      if (error) throw error
      return (count ?? 0) > 0
    },
  })
}

export function useCategorias() {
  return useQuery({
    queryKey: ['categorias'],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from('categorias').select('*').order('nombre')
      if (error) throw error
      return data
    },
  })
}

export function useUnidades(productoId: string, enabled = true) {
  return useQuery({
    queryKey: productosKeys.unidades(productoId),
    enabled,
    queryFn: async () => {
      const { filas } = await traerTodo((desde, hasta) =>
        supabase
          .from('unidades')
          .select('*')
          .eq('producto_id', productoId)
          .order('created_at', { ascending: false })
          .order('id')
          .range(desde, hasta),
      )
      return filas
    },
  })
}

/** IDs de productos que tienen alguna unidad cuyo serial o MAC contiene el texto */
export function useBusquedaSerie(texto: string) {
  const termino = texto.trim()
  return useQuery({
    queryKey: productosKeys.busquedaSerie(termino),
    enabled: termino.length >= 3,
    queryFn: async () => {
      const patron = `%${termino.replace(/[%_,()]/g, '')}%`
      const { data, error } = await supabase
        .from('unidades')
        .select('producto_id')
        .or(`numero_serie.ilike.${patron},mac.ilike.${patron}`)
        .limit(200)
      if (error) throw error
      return new Set(data.map((u) => u.producto_id))
    },
  })
}

// ---------------------------------------------------------------------
// Mutaciones
// ---------------------------------------------------------------------

/** Datos comunes de un producto con colores (se copian a todos sus colores) */
export type DatosFamilia = Pick<
  Familia,
  'nombre' | 'categoria_id' | 'marca' | 'modelo' | 'descripcion' | 'es_serializado' | 'precio_venta'
>

/** Crea el producto con colores y un producto por color; devuelve el id del primer color */
export function useCrearFamilia() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (datos: {
      familia: DatosFamilia
      colores: string[]
      costoInicial: number
      stockMinimo: number
    }) => {
      const { data, error } = await supabase.rpc('crear_familia', {
        p_familia: datos.familia,
        p_colores: datos.colores,
        p_costo_inicial: datos.costoInicial,
        p_stock_minimo: datos.stockMinimo,
      })
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: productosKeys.all })
      // Crear un producto consume un número del consecutivo de su categoría
      queryClient.invalidateQueries({ queryKey: ['categorias'] })
    },
  })
}

export function useAgregarColor() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (datos: { familiaId: string; color: string; costoInicial: number; stockMinimo: number }) => {
      const { data, error } = await supabase.rpc('agregar_color', {
        p_familia_id: datos.familiaId,
        p_color: datos.color,
        p_costo_inicial: datos.costoInicial,
        p_stock_minimo: datos.stockMinimo,
      })
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: productosKeys.all })
      // Crear un producto consume un número del consecutivo de su categoría
      queryClient.invalidateQueries({ queryKey: ['categorias'] })
    },
  })
}

/** Guarda un color: los datos comunes en su familia (llegan a todos los colores) y los propios en el producto */
export function useGuardarColor() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      familiaId,
      comunes,
      propios,
    }: {
      id: string
      familiaId: string
      comunes: DatosFamilia
      propios: Pick<TablesUpdate<'productos'>, 'codigo_barras' | 'stock_minimo'>
    }) => {
      const familia = await supabase.from('familias').update(comunes).eq('id', familiaId)
      if (familia.error) throw familia.error
      const producto = await supabase.from('productos').update(propios).eq('id', id)
      if (producto.error) throw producto.error
      return id
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: productosKeys.all }),
  })
}

export function useGuardarProducto() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, valores }: { id?: string; valores: TablesInsert<'productos'> }) => {
      // El costo lo calcula la base de datos con cada entrada (costo promedio): al editar no se envía
      const query = id
        ? supabase.from('productos').update({ ...valores, precio_costo: undefined }).eq('id', id)
        : supabase.from('productos').insert(valores)
      const { data, error } = await query.select('id').single()
      if (error) throw error
      return data.id
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: productosKeys.all })
      // Crear un producto consume un número del consecutivo de su categoría
      queryClient.invalidateQueries({ queryKey: ['categorias'] })
    },
  })
}

// ---------------------------------------------------------------------
// Fotos (bucket "productos" de Supabase Storage, migración 0007)
// ---------------------------------------------------------------------

const BUCKET_FOTOS = 'productos'

/** Ruta dentro del bucket a partir de la URL pública guardada en imagen_url */
function rutaDeFoto(url: string | null) {
  const marca = `/object/public/${BUCKET_FOTOS}/`
  const i = url?.indexOf(marca) ?? -1
  return url && i >= 0 ? url.slice(i + marca.length) : null
}

async function borrarFoto(url: string | null) {
  const ruta = rutaDeFoto(url)
  // Si falla solo queda un archivo huérfano; no debe impedir el cambio de foto
  if (ruta) await supabase.storage.from(BUCKET_FOTOS).remove([ruta])
}

export function useSubirFoto() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ producto, archivo }: { producto: Pick<Producto, 'id' | 'imagen_url'>; archivo: File }) => {
      const { blob, extension } = await prepararFoto(archivo)
      // Nombre aleatorio: la URL no se puede adivinar y cada foto nueva evita la caché de la anterior
      const ruta = `${producto.id}/${crypto.randomUUID()}.${extension}`
      const fotos = supabase.storage.from(BUCKET_FOTOS)

      const { error: errorSubida } = await fotos.upload(ruta, blob, {
        contentType: blob.type,
        cacheControl: '31536000',
        upsert: false,
      })
      if (errorSubida) throw errorSubida

      const url = fotos.getPublicUrl(ruta).data.publicUrl
      const { error } = await supabase.from('productos').update({ imagen_url: url }).eq('id', producto.id)
      if (error) {
        await fotos.remove([ruta])
        throw error
      }
      await borrarFoto(producto.imagen_url)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: productosKeys.all }),
  })
}

export function useQuitarFoto() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (producto: Pick<Producto, 'id' | 'imagen_url'>) => {
      const { error } = await supabase.from('productos').update({ imagen_url: null }).eq('id', producto.id)
      if (error) throw error
      await borrarFoto(producto.imagen_url)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: productosKeys.all }),
  })
}

export function useCambiarActivo() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, activo }: { id: string; activo: boolean }) => {
      const { error } = await supabase.from('productos').update({ activo }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: productosKeys.all }),
  })
}

/** Solo datos descriptivos: el estado de una unidad cambia a través de los movimientos */
export function useActualizarUnidad() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, valores }: { id: string; valores: Pick<TablesUpdate<'unidades'>, 'mac' | 'notas'> }) => {
      const { data, error } = await supabase.from('unidades').update(valores).eq('id', id).select('producto_id').single()
      if (error) throw error
      return data.producto_id
    },
    onSuccess: (productoId) => queryClient.invalidateQueries({ queryKey: productosKeys.unidades(productoId) }),
  })
}

// ---------------------------------------------------------------------
// Historial
// ---------------------------------------------------------------------

const SELECT_MOVIMIENTO_ITEM =
  'cantidad, movimiento:movimientos!inner(id, numero, tipo, fecha, referencia, notas, motivo, cliente:clientes(id, nombre), proveedor:proveedores(id, nombre))'

/** Kardex: movimientos del producto agrupados, con el saldo acumulado después de cada uno */
export function useKardex(productoId: string) {
  return useQuery({
    queryKey: [...productosKeys.all, 'kardex', productoId],
    queryFn: async () => {
      const { filas: data } = await traerTodo((desde, hasta) =>
        supabase
          .from('movimiento_items')
          .select(SELECT_MOVIMIENTO_ITEM)
          .eq('producto_id', productoId)
          .order('id')
          .range(desde, hasta),
      )

      type Fila = (typeof data)[number]['movimiento'] & { entra: number; sale: number; saldo: number }
      const porMovimiento = new Map<string, Fila>()
      for (const item of data) {
        const m = item.movimiento
        const fila = porMovimiento.get(m.id) ?? { ...m, entra: 0, sale: 0, saldo: 0 }
        if (m.tipo === 'entrada' || m.tipo === 'ajuste_entrada') fila.entra += item.cantidad
        else fila.sale += item.cantidad
        porMovimiento.set(m.id, fila)
      }

      const filas = [...porMovimiento.values()].sort((a, b) => a.fecha.localeCompare(b.fecha) || a.numero - b.numero)
      let saldo = 0
      for (const f of filas) {
        saldo += f.entra - f.sale
        f.saldo = saldo
      }
      return filas.reverse() // más recientes primero
    },
  })
}

/** Movimientos por los que ha pasado una unidad (trazabilidad del serial) */
export function useHistorialUnidad(unidadId: string | undefined) {
  return useQuery({
    queryKey: [...productosKeys.all, 'historial-unidad', unidadId],
    enabled: Boolean(unidadId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('movimiento_items')
        .select(SELECT_MOVIMIENTO_ITEM)
        .eq('unidad_id', unidadId!)
      if (error) throw error
      return data
        .map((item) => item.movimiento)
        .sort((a, b) => b.fecha.localeCompare(a.fecha) || b.numero - a.numero)
    },
  })
}

// ---------------------------------------------------------------------
// Importación desde Excel / CSV (migración 0018)
// ---------------------------------------------------------------------

/** Crea todos los productos (y el ajuste de stock inicial) en una sola transacción */
export function useImportarProductos() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (productos: Json) => {
      const { data, error } = await supabase.rpc('importar_productos', { p_productos: productos })
      if (error) throw error
      return data as { creados: number; ajuste_id: string | null }
    },
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: productosKeys.all }),
        queryClient.invalidateQueries({ queryKey: ['categorias'] }),
        queryClient.invalidateQueries({ queryKey: ['movimientos'] }),
      ]),
  })
}
