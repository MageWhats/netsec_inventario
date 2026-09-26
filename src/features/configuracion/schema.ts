import { z } from 'zod'
import type { TablesInsert } from '@/types/database'
import type { BodegaConUso, CategoriaConUso } from './api'

const nombre = z.string().trim().min(2, 'El nombre es obligatorio').max(100, 'Máximo 100 caracteres')

export const categoriaSchema = z.object({ nombre })

export type CategoriaForm = z.infer<typeof categoriaSchema>

export const categoriaVacia: CategoriaForm = { nombre: '' }

export function categoriaAFormulario(c: CategoriaConUso): CategoriaForm {
  return { nombre: c.nombre }
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
