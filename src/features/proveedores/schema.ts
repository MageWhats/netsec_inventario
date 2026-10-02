import { z } from 'zod'
import type { TablesInsert } from '@/types/database'
import type { Proveedor } from './api'

const textoOpcional = z.string().trim().max(200, 'Máximo 200 caracteres')

export const proveedorSchema = z.object({
  nombre: z.string().trim().min(2, 'El nombre es obligatorio').max(150, 'Máximo 150 caracteres'),
  nit: z
    .string()
    .trim()
    .max(20, 'Máximo 20 caracteres')
    .regex(/^[A-Za-z0-9-]*$/, 'Solo números, letras y guion (sin puntos ni espacios)'),
  contacto: textoOpcional,
  telefono: z
    .string()
    .trim()
    .regex(/^[0-9+\s()-]*$/, 'Teléfono inválido')
    .max(30, 'Máximo 30 caracteres'),
  email: z.union([z.literal(''), z.email('Email inválido')]),
  direccion: textoOpcional,
  notas: z.string().trim().max(1000, 'Máximo 1000 caracteres'),
  // Plazo de pago habitual (días); vacío = sin plazo definido
  dias_credito: z
    .string()
    .trim()
    .regex(/^\d{0,3}$/, 'Escribe los días (0 a 365)')
    .refine((v) => v === '' || Number(v) <= 365, 'Máximo 365 días'),
  // Responsable de IVA: sus facturas traen IVA, que Net&Sec suma al costo (no lo descuenta)
  responsable_iva: z.boolean(),
})

export type ProveedorForm = z.infer<typeof proveedorSchema>

export const proveedorVacio: ProveedorForm = {
  nombre: '',
  nit: '',
  contacto: '',
  telefono: '',
  email: '',
  direccion: '',
  notas: '',
  dias_credito: '',
  responsable_iva: false,
}

export function proveedorAFormulario(p: Proveedor): ProveedorForm {
  return {
    nombre: p.nombre,
    nit: p.nit ?? '',
    contacto: p.contacto ?? '',
    telefono: p.telefono ?? '',
    email: p.email ?? '',
    direccion: p.direccion ?? '',
    notas: p.notas ?? '',
    dias_credito: p.dias_credito === null ? '' : String(p.dias_credito),
    responsable_iva: p.responsable_iva,
  }
}

export function formularioAProveedor(f: ProveedorForm): TablesInsert<'proveedores'> {
  const nulo = (valor: string) => valor || null
  return {
    nombre: f.nombre,
    nit: nulo(f.nit.toUpperCase()),
    contacto: nulo(f.contacto),
    telefono: nulo(f.telefono),
    email: nulo(f.email.toLowerCase()),
    direccion: nulo(f.direccion),
    notas: nulo(f.notas),
    dias_credito: f.dias_credito === '' ? null : Number(f.dias_credito),
    responsable_iva: f.responsable_iva,
  }
}
