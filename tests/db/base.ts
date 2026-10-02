/**
 * Base de datos de prueba: un PostgreSQL embebido (PGlite) con todas las migraciones de
 * supabase/migrations aplicadas en orden, y lo mínimo de Supabase simulado (roles anon y
 * authenticated, auth.users, auth.uid(), storage).
 *
 * `como(db, usuario, sql)` ejecuta una consulta como un usuario de la app (rol authenticated),
 * así las pruebas pasan por RLS y por los permisos de cada tabla, columna y función.
 */
import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const MIGRACIONES = fileURLToPath(new URL('../../supabase/migrations/', import.meta.url))

const SUPABASE_SIMULADO = `
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;

create schema auth;
grant usage on schema auth to anon, authenticated, service_role;
create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  raw_user_meta_data jsonb default '{}',
  encrypted_password text default 'x',
  last_sign_in_at timestamptz
);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create function auth.jwt() returns jsonb language sql stable as $$
  select jsonb_build_object('email', current_setting('request.jwt.claim.email', true)) $$;
grant execute on all functions in schema auth to anon, authenticated, service_role;

-- En Supabase las extensiones (pgcrypto) viven en el esquema extensions
create schema extensions;
grant usage on schema extensions to anon, authenticated, service_role;

create schema storage;
create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid);
alter table storage.objects enable row level security;
`

export const USUARIOS = {
  admin: '00000000-0000-0000-0000-00000000000a',
  bodega: '00000000-0000-0000-0000-00000000000b',
  lectura: '00000000-0000-0000-0000-00000000000c',
  contador: '00000000-0000-0000-0000-00000000000d',
} as const

export type Usuario = keyof typeof USUARIOS

const migraciones = () =>
  readdirSync(MIGRACIONES)
    .filter((f) => f.endsWith('.sql'))
    .sort()

async function aplicar(db: PGlite, archivos: string[]) {
  for (const archivo of archivos) {
    try {
      await db.exec(readFileSync(MIGRACIONES + archivo, 'utf8'))
    } catch (e) {
      throw new Error(`${archivo}: ${(e as Error).message}`, { cause: e })
    }
  }
}

/** Aplica las migraciones posteriores a `despues` (p. ej. '0022'): para probar una migración sobre datos existentes */
export const aplicarMigracionesDesde = (db: PGlite, despues: string) =>
  aplicar(
    db,
    migraciones().filter((f) => f.slice(0, 4) > despues),
  )

/**
 * Base nueva con las migraciones (todas, o hasta `hasta` inclusive) y un usuario de cada rol.
 * Los usuarios se crean al final, así que `hasta` debe incluir la migración del rol contador (0021).
 */
export async function crearBase(opciones: { hasta?: string } = {}): Promise<PGlite> {
  const db = new PGlite({ extensions: { pgcrypto } })
  await db.exec(SUPABASE_SIMULADO)
  await aplicar(
    db,
    migraciones().filter((f) => !opciones.hasta || f.slice(0, 4) <= opciones.hasta),
  )
  await db.exec(`
    insert into auth.users (id, email) values
      ('${USUARIOS.admin}', 'admin@netsec.test'),
      ('${USUARIOS.bodega}', 'bodega@netsec.test'),
      ('${USUARIOS.lectura}', 'lectura@netsec.test'),
      ('${USUARIOS.contador}', 'contador@netsec.test');
    update public.perfiles set rol = 'admin' where id = '${USUARIOS.admin}';
    update public.perfiles set rol = 'bodega' where id = '${USUARIOS.bodega}';
    update public.perfiles set rol = 'contador' where id = '${USUARIOS.contador}';
  `)
  return db
}

/** Ejecuta una consulta como un usuario de la app y devuelve las filas */
export async function como<T = Record<string, unknown>>(
  db: PGlite,
  usuario: Usuario,
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  await db.exec(`select set_config('request.jwt.claim.sub', '${USUARIOS[usuario]}', false); set role authenticated;`)
  try {
    return (await db.query<T>(sql, params)).rows
  } finally {
    await db.exec('reset role;')
  }
}

/** Una sola fila (la primera) */
export async function unaComo<T = Record<string, unknown>>(
  db: PGlite,
  usuario: Usuario,
  sql: string,
  params: unknown[] = [],
): Promise<T> {
  const [fila] = await como<T>(db, usuario, sql, params)
  if (!fila) throw new Error('La consulta no devolvió filas')
  return fila
}

// ---------------------------------------------------------------------
// Atajos para preparar datos
// ---------------------------------------------------------------------

export async function crearProducto(
  db: PGlite,
  datos: { nombre?: string; serializado?: boolean; precioVenta?: number } = {},
): Promise<string> {
  const [categoria] = (await db.query<{ id: string }>('select id from public.categorias order by nombre limit 1')).rows
  const fila = await unaComo<{ id: string }>(
    db,
    'admin',
    `insert into public.productos (nombre, categoria_id, es_serializado, precio_venta)
     values ($1, $2, $3, $4) returning id`,
    [datos.nombre ?? 'Switch 8 puertos', categoria!.id, datos.serializado ?? false, datos.precioVenta ?? 0],
  )
  return fila.id
}

export async function crearProveedor(db: PGlite, nombre = 'Proveedor de prueba'): Promise<string> {
  return (
    await unaComo<{ id: string }>(db, 'admin', 'insert into public.proveedores (nombre) values ($1) returning id', [
      nombre,
    ])
  ).id
}

/** Registra un movimiento y devuelve su id */
export async function registrar(
  db: PGlite,
  usuario: Usuario,
  tipo: 'entrada' | 'salida' | 'ajuste_entrada' | 'ajuste_salida',
  items: unknown[],
  extra: { motivo?: string; proveedorId?: string } = {},
): Promise<string> {
  const fila = await unaComo<{ id: string }>(
    db,
    usuario,
    `select public.registrar_movimiento(
       p_tipo => $1, p_items => $2::jsonb, p_motivo => $3::public.motivo_ajuste, p_proveedor_id => $4
     ) as id`,
    [tipo, JSON.stringify(items), extra.motivo ?? null, extra.proveedorId ?? null],
  )
  return fila.id
}

export async function stock(db: PGlite, productoId: string): Promise<number> {
  const [fila] = (
    await db.query<{ s: number | null }>(
      'select sum(cantidad)::int s from public.stock_actual where producto_id = $1',
      [productoId],
    )
  ).rows
  return fila?.s ?? 0
}

export async function costoPromedio(db: PGlite, productoId: string): Promise<number> {
  const [fila] = (
    await db.query<{ c: string }>('select precio_costo c from public.productos where id = $1', [productoId])
  ).rows
  return Number(fila!.c)
}

/** Mensaje del error, o null si la promesa no falla */
export async function error(promesa: Promise<unknown>): Promise<string | null> {
  try {
    await promesa
    return null
  } catch (e) {
    return (e as Error).message
  }
}
