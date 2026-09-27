import { z } from 'zod'
import type { TablesInsert } from '@/types/database'
import type { Producto } from './api'

const textoOpcional = z.string().trim().max(500, 'Máximo 500 caracteres')

const numero = (mensaje: string) =>
  z.number({ error: 'Introduce un número' }).refine((n) => n >= 0, mensaje)

export const productoSchema = z
  .object({
    // El SKU no está aquí: lo genera la base de datos con el prefijo de la categoría (migración 0014)
    nombre: z.string().trim().min(2, 'El nombre es obligatorio').max(150, 'Máximo 150 caracteres'),
    descripcion: textoOpcional,
    categoria_id: z.string().min(1, 'Elige una categoría'),
    marca: textoOpcional,
    modelo: textoOpcional,
    codigo_barras: z.string().trim().max(50, 'Máximo 50 caracteres'),
    es_serializado: z.boolean(),
    precio_costo: numero('El costo no puede ser negativo'),
    precio_venta: numero('El precio no puede ser negativo'),
    stock_minimo: numero('El stock mínimo no puede ser negativo').refine(Number.isInteger, 'Debe ser un número entero'),
  })
  .refine((p) => p.precio_venta === 0 || p.precio_venta >= p.precio_costo, {
    path: ['precio_venta'],
    message: 'El precio de venta es menor que el costo',
  })

export type ProductoForm = z.infer<typeof productoSchema>

export const productoVacio: ProductoForm = {
  nombre: '',
  descripcion: '',
  categoria_id: '',
  marca: '',
  modelo: '',
  codigo_barras: '',
  es_serializado: false,
  precio_costo: 0,
  precio_venta: 0,
  stock_minimo: 0,
}

export function productoAFormulario(p: Producto): ProductoForm {
  return {
    nombre: p.nombre,
    descripcion: p.descripcion ?? '',
    categoria_id: p.categoria_id ?? '',
    marca: p.marca ?? '',
    modelo: p.modelo ?? '',
    codigo_barras: p.codigo_barras ?? '',
    es_serializado: p.es_serializado,
    precio_costo: p.precio_costo,
    precio_venta: p.precio_venta,
    stock_minimo: p.stock_minimo,
  }
}

/** Los textos vacíos se guardan como NULL (evita choques con las restricciones UNIQUE) */
export function formularioAProducto(f: ProductoForm): TablesInsert<'productos'> {
  const nulo = (valor: string) => valor || null
  return {
    ...f,
    descripcion: nulo(f.descripcion),
    categoria_id: nulo(f.categoria_id),
    marca: nulo(f.marca),
    modelo: nulo(f.modelo),
    codigo_barras: nulo(f.codigo_barras),
  }
}
