import { z } from 'zod'
import type { Enums, TablesInsert } from '@/types/database'
import type { Cliente } from './api'

export const TIPOS_DOCUMENTO: { value: Enums<'tipo_documento'>; label: string }[] = [
  { value: 'CC', label: 'Cédula de ciudadanía' },
  { value: 'NIT', label: 'NIT' },
  { value: 'CE', label: 'Cédula de extranjería' },
  { value: 'PAS', label: 'Pasaporte' },
  { value: 'TI', label: 'Tarjeta de identidad' },
  { value: 'OTRO', label: 'Otro' },
]

const textoOpcional = z.string().trim().max(200, 'Máximo 200 caracteres')

export const clienteSchema = z.object({
  tipo_documento: z.enum(['CC', 'NIT', 'CE', 'PAS', 'TI', 'OTRO']),
  documento: z
    .string()
    .trim()
    .min(3, 'El documento es obligatorio')
    .max(20, 'Máximo 20 caracteres')
    .regex(/^[A-Za-z0-9-]+$/, 'Solo números, letras y guion (sin puntos ni espacios)'),
  nombre: z.string().trim().min(2, 'El nombre es obligatorio').max(150, 'Máximo 150 caracteres'),
  telefono: z
    .string()
    .trim()
    .regex(/^[0-9+\s()-]*$/, 'Teléfono inválido')
    .max(30, 'Máximo 30 caracteres'),
  email: z.union([z.literal(''), z.email('Email inválido')]),
  direccion: textoOpcional,
  ciudad: textoOpcional,
  notas: z.string().trim().max(1000, 'Máximo 1000 caracteres'),
  // Plazo de pago habitual (días); vacío = sin plazo definido
  dias_credito: z
    .string()
    .trim()
    .regex(/^\d{0,3}$/, 'Escribe los días (0 a 365)')
    .refine((v) => v === '' || Number(v) <= 365, 'Máximo 365 días'),
  // Agente de retención: al pagar descuenta la retención en la fuente (se registra en el abono)
  agente_retencion: z.boolean(),
})

export type ClienteForm = z.infer<typeof clienteSchema>

export const clienteVacio: ClienteForm = {
  tipo_documento: 'CC',
  documento: '',
  nombre: '',
  telefono: '',
  email: '',
  direccion: '',
  ciudad: '',
  notas: '',
  dias_credito: '',
  agente_retencion: false,
}

export function clienteAFormulario(c: Cliente): ClienteForm {
  return {
    tipo_documento: c.tipo_documento,
    documento: c.documento,
    nombre: c.nombre,
    telefono: c.telefono ?? '',
    email: c.email ?? '',
    direccion: c.direccion ?? '',
    ciudad: c.ciudad ?? '',
    notas: c.notas ?? '',
    dias_credito: c.dias_credito === null ? '' : String(c.dias_credito),
    agente_retencion: c.agente_retencion,
  }
}

export function formularioACliente(f: ClienteForm): TablesInsert<'clientes'> {
  const nulo = (valor: string) => valor || null
  return {
    tipo_documento: f.tipo_documento,
    documento: f.documento.toUpperCase(),
    nombre: f.nombre,
    telefono: nulo(f.telefono),
    email: nulo(f.email.toLowerCase()),
    direccion: nulo(f.direccion),
    ciudad: nulo(f.ciudad),
    notas: nulo(f.notas),
    dias_credito: f.dias_credito === '' ? null : Number(f.dias_credito),
    agente_retencion: f.agente_retencion,
  }
}

export const etiquetaDocumento = (c: Pick<Cliente, 'tipo_documento' | 'documento'>) =>
  `${c.tipo_documento} ${c.documento}`
