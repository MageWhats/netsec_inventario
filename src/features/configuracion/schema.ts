import { z } from 'zod'
import type { TablesInsert } from '@/types/database'
import type { BodegaConUso, CategoriaConUso, Usuario } from './api'

const nombre = z.string().trim().min(2, 'El nombre es obligatorio').max(100, 'Máximo 100 caracteres')

export const categoriaSchema = z.object({
  nombre,
  // Va en el SKU de sus productos: NS-<prefijo>-0001
  prefijo: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{2,5}$/, 'De 2 a 5 letras o números, sin espacios ni tildes'),
})

export type CategoriaForm = z.infer<typeof categoriaSchema>

export const categoriaVacia: CategoriaForm = { nombre: '', prefijo: '' }

export function categoriaAFormulario(c: CategoriaConUso): CategoriaForm {
  return { nombre: c.nombre, prefijo: c.prefijo }
}

export const bodegaSchema = z.object({
  nombre,
  direccion: z.string().trim().max(200, 'Máximo 200 caracteres'),
})

export type BodegaForm = z.infer<typeof bodegaSchema>

export const bodegaVacia: BodegaForm = { nombre: '', direccion: '' }

export function bodegaAFormulario(b: BodegaConUso): BodegaForm {
  return { nombre: b.nombre, direccion: b.direccion ?? '' }
}

export function formularioABodega(f: BodegaForm): TablesInsert<'bodegas'> {
  return { nombre: f.nombre, direccion: f.direccion || null }
}

export const usuarioSchema = z.object({
  nombre,
  email: z.email('Email inválido'),
  rol: z.enum(['admin', 'bodega', 'lectura']),
})

export type UsuarioForm = z.infer<typeof usuarioSchema>

export const usuarioVacio: UsuarioForm = { nombre: '', email: '', rol: 'bodega' }

export function usuarioAFormulario(u: Usuario): UsuarioForm {
  return { nombre: u.nombre ?? '', email: u.email, rol: u.rol }
}
