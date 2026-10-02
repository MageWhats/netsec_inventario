import { z } from 'zod'
import type { Tables, TablesInsert, TablesUpdate } from '@/types/database'
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
  // Desde la venta; con ella la consulta de seriales dice si una unidad sigue en garantía
  garantia_meses: z
    .number({ error: 'Escribe los meses (0 si no tiene garantía)' })
    .int('Solo meses enteros')
    .min(0, 'No puede ser negativa')
    .max(120, 'Máximo 120 meses'),
})

export type CategoriaForm = z.infer<typeof categoriaSchema>

export const categoriaVacia: CategoriaForm = { nombre: '', prefijo: '', garantia_meses: 0 }

export function categoriaAFormulario(c: CategoriaConUso): CategoriaForm {
  return { nombre: c.nombre, prefijo: c.prefijo, garantia_meses: c.garantia_meses }
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

const opcional = (max: number) => z.string().trim().max(max, `Máximo ${max} caracteres`)

export const empresaSchema = z.object({
  nombre: z.string().trim().min(2, 'El nombre es obligatorio').max(150, 'Máximo 150 caracteres'),
  nit: opcional(30),
  direccion: opcional(200),
  ciudad: opcional(100),
  telefono: z
    .string()
    .trim()
    .regex(/^[0-9+\s()-]{0,30}$/, 'Solo números, espacios y + ( ) -'),
  email: z.union([z.literal(''), z.email('Email inválido')]),
  sitio_web: opcional(200),
  pie_documentos: opcional(1000),
})

export type EmpresaForm = z.infer<typeof empresaSchema>

export function empresaAFormulario(e: Tables<'empresa'>): EmpresaForm {
  return {
    nombre: e.nombre,
    nit: e.nit ?? '',
    direccion: e.direccion ?? '',
    ciudad: e.ciudad ?? '',
    telefono: e.telefono ?? '',
    email: e.email ?? '',
    sitio_web: e.sitio_web ?? '',
    pie_documentos: e.pie_documentos ?? '',
  }
}

/** Los campos vacíos se guardan como null */
export function formularioAEmpresa(f: EmpresaForm): TablesUpdate<'empresa'> {
  const vacioANull = (v: string) => v || null
  return {
    nombre: f.nombre,
    nit: vacioANull(f.nit),
    direccion: vacioANull(f.direccion),
    ciudad: vacioANull(f.ciudad),
    telefono: vacioANull(f.telefono),
    email: vacioANull(f.email),
    sitio_web: vacioANull(f.sitio_web),
    pie_documentos: vacioANull(f.pie_documentos),
  }
}

export const usuarioSchema = z.object({
  nombre,
  email: z.email('Email inválido'),
  rol: z.enum(['admin', 'bodega', 'lectura', 'contador']),
})

export type UsuarioForm = z.infer<typeof usuarioSchema>

export const usuarioVacio: UsuarioForm = { nombre: '', email: '', rol: 'bodega' }

export function usuarioAFormulario(u: Usuario): UsuarioForm {
  return { nombre: u.nombre ?? '', email: u.email, rol: u.rol }
}
