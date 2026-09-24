-- =====================================================================
-- Net&Sec Inventario - Esquema inicial
-- Ejecutar en Supabase → SQL Editor (una sola vez).
-- =====================================================================

-- ---------------------------------------------------------------------
-- Tipos
-- ---------------------------------------------------------------------
create type public.rol_usuario as enum ('admin', 'bodega', 'lectura');

create type public.tipo_movimiento as enum (
  'entrada',          -- compra / recepción de proveedor
  'salida',           -- venta / despacho
  'ajuste_entrada',   -- corrección de inventario (+)
  'ajuste_salida'     -- corrección de inventario (-): pérdida, daño, etc.
);

create type public.estado_unidad as enum (
  'disponible',
  'vendida',
  'en_garantia',
  'danada',
  'baja'
);

-- ---------------------------------------------------------------------
-- Utilidades
-- ---------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- Perfiles y roles
-- ---------------------------------------------------------------------
create table public.perfiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  nombre     text,
  rol        public.rol_usuario not null default 'lectura',
  created_at timestamptz not null default now()
);

-- Crea el perfil automáticamente al registrar un usuario en Auth
create or replace function public.crear_perfil_usuario()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.perfiles (id, nombre)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'nombre', new.email));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.crear_perfil_usuario();

-- ¿El usuario actual es admin? (security definer para evitar recursión de RLS)
create or replace function public.es_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.perfiles
    where id = (select auth.uid()) and rol = 'admin'
  );
$$;

-- Los usuarios que YA existen (tu usuario admin) pasan a ser admin
insert into public.perfiles (id, nombre, rol)
select id, email, 'admin' from auth.users
on conflict (id) do update set rol = 'admin';

-- ---------------------------------------------------------------------
-- Catálogos
-- ---------------------------------------------------------------------
create table public.bodegas (
  id         uuid primary key default gen_random_uuid(),
  nombre     text not null unique,
  direccion  text,
  activa     boolean not null default true,
  created_at timestamptz not null default now()
);

insert into public.bodegas (nombre) values ('Bodega principal');

create table public.categorias (
  id         uuid primary key default gen_random_uuid(),
  nombre     text not null unique,
  created_at timestamptz not null default now()
);

insert into public.categorias (nombre) values
  ('Relojes'),
  ('Cargadores'),
  ('Accesorios'),
  ('Switches'),
  ('Routers'),
  ('Access Points'),
  ('Cámaras de seguridad'),
  ('DVR / NVR'),
  ('Cableado');

create table public.proveedores (
  id         uuid primary key default gen_random_uuid(),
  nombre     text not null,
  nit        text unique,
  contacto   text,
  telefono   text,
  email      text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Productos
--   es_serializado = true  → se controla cada unidad por número de serie
--   es_serializado = false → se controla solo por cantidad
-- ---------------------------------------------------------------------
create table public.productos (
  id             uuid primary key default gen_random_uuid(),
  sku            text not null unique,
  nombre         text not null,
  descripcion    text,
  categoria_id   uuid references public.categorias (id) on delete set null,
  marca          text,
  modelo         text,
  codigo_barras  text unique,
  es_serializado boolean not null default false,
  precio_costo   numeric(14, 2) not null default 0 check (precio_costo >= 0),
  precio_venta   numeric(14, 2) not null default 0 check (precio_venta >= 0),
  stock_minimo   integer not null default 0 check (stock_minimo >= 0),
  activo         boolean not null default true,
  imagen_url     text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index productos_categoria_idx on public.productos (categoria_id);

create trigger productos_updated_at
  before update on public.productos
  for each row execute function public.set_updated_at();

-- Unidades físicas de productos serializados (una fila por número de serie)
create table public.unidades (
  id           uuid primary key default gen_random_uuid(),
  producto_id  uuid not null references public.productos (id) on delete restrict,
  bodega_id    uuid not null references public.bodegas (id) on delete restrict,
  numero_serie text not null,
  mac          text,
  estado       public.estado_unidad not null default 'disponible',
  notas        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (producto_id, numero_serie)
);

create index unidades_serie_idx on public.unidades (numero_serie);
create index unidades_producto_estado_idx on public.unidades (producto_id, estado);

create trigger unidades_updated_at
  before update on public.unidades
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- Movimientos (cabecera + líneas). El stock NUNCA se edita a mano:
-- se calcula a partir de estas tablas.
-- ---------------------------------------------------------------------
create table public.movimientos (
  id           uuid primary key default gen_random_uuid(),
  tipo         public.tipo_movimiento not null,
  bodega_id    uuid not null references public.bodegas (id) on delete restrict,
  proveedor_id uuid references public.proveedores (id) on delete set null,
  referencia   text,            -- nº de factura, remisión, etc.
  notas        text,
  fecha        timestamptz not null default now(),
  usuario_id   uuid default auth.uid() references auth.users (id) on delete set null,
  created_at   timestamptz not null default now()
);

create index movimientos_fecha_idx on public.movimientos (fecha desc);

create table public.movimiento_items (
  id             uuid primary key default gen_random_uuid(),
  movimiento_id  uuid not null references public.movimientos (id) on delete cascade,
  producto_id    uuid not null references public.productos (id) on delete restrict,
  unidad_id      uuid references public.unidades (id) on delete restrict, -- solo serializados
  cantidad       integer not null check (cantidad > 0),
  costo_unitario numeric(14, 2),
  -- Un ítem con número de serie siempre mueve exactamente 1 unidad
  check (unidad_id is null or cantidad = 1)
);

create index movimiento_items_movimiento_idx on public.movimiento_items (movimiento_id);
create index movimiento_items_producto_idx on public.movimiento_items (producto_id);

-- ---------------------------------------------------------------------
-- Vista de stock por producto y bodega
-- ---------------------------------------------------------------------
create view public.stock_actual
with (security_invoker = true) as
select
  mi.producto_id,
  m.bodega_id,
  sum(
    case when m.tipo in ('entrada', 'ajuste_entrada') then mi.cantidad else -mi.cantidad end
  )::integer as cantidad
from public.movimiento_items mi
join public.movimientos m on m.id = mi.movimiento_id
group by mi.producto_id, m.bodega_id;

-- ---------------------------------------------------------------------
-- Seguridad: Row Level Security. Por ahora solo el rol admin accede.
-- ---------------------------------------------------------------------
alter table public.perfiles          enable row level security;
alter table public.bodegas           enable row level security;
alter table public.categorias        enable row level security;
alter table public.proveedores       enable row level security;
alter table public.productos         enable row level security;
alter table public.unidades          enable row level security;
alter table public.movimientos       enable row level security;
alter table public.movimiento_items  enable row level security;

-- Cada usuario puede ver su propio perfil; el admin ve todos
create policy "perfiles: ver propio o admin" on public.perfiles
  for select to authenticated
  using (id = (select auth.uid()) or (select public.es_admin()));

create policy "perfiles: admin gestiona" on public.perfiles
  for update to authenticated
  using ((select public.es_admin()))
  with check ((select public.es_admin()));

create policy "admin: acceso total" on public.bodegas
  for all to authenticated using ((select public.es_admin())) with check ((select public.es_admin()));
create policy "admin: acceso total" on public.categorias
  for all to authenticated using ((select public.es_admin())) with check ((select public.es_admin()));
create policy "admin: acceso total" on public.proveedores
  for all to authenticated using ((select public.es_admin())) with check ((select public.es_admin()));
create policy "admin: acceso total" on public.productos
  for all to authenticated using ((select public.es_admin())) with check ((select public.es_admin()));
create policy "admin: acceso total" on public.unidades
  for all to authenticated using ((select public.es_admin())) with check ((select public.es_admin()));
create policy "admin: acceso total" on public.movimientos
  for all to authenticated using ((select public.es_admin())) with check ((select public.es_admin()));
create policy "admin: acceso total" on public.movimiento_items
  for all to authenticated using ((select public.es_admin())) with check ((select public.es_admin()));
