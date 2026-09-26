-- =====================================================================
-- 0011: productos con colores (variantes)
--
-- Una familia ("Reloj X") guarda los datos comunes: nombre, categoría,
-- marca, modelo, descripción, precio de venta y tipo de control. Cada
-- color es un producto normal ("Reloj X · Negro") con su SKU, código de
-- barras, stock mínimo, foto, stock y costo promedio propios, así que
-- movimientos, tomas, kardex y reportes funcionan igual que siempre.
--
-- Los datos comunes solo se editan en la familia y se copian a todos sus
-- colores. Los productos sin colores no cambian.
-- =====================================================================

create table public.familias (
  id             uuid primary key default gen_random_uuid(),
  nombre         text not null check (char_length(btrim(nombre)) between 2 and 120),
  sku_base       text not null unique check (sku_base ~ '^[A-Za-z0-9._-]{1,40}$'),
  categoria_id   uuid references public.categorias (id) on delete set null,
  marca          text check (char_length(marca) <= 500),
  modelo         text check (char_length(modelo) <= 500),
  descripcion    text check (char_length(descripcion) <= 500),
  es_serializado boolean not null default false,
  precio_venta   numeric(14, 2) not null default 0 check (precio_venta >= 0),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create trigger familias_updated_at
  before update on public.familias
  for each row execute function public.set_updated_at();

create trigger auditoria_familias
  after insert or update or delete on public.familias
  for each row execute function public.registrar_auditoria();

alter table public.familias enable row level security;
create policy "admin: acceso total" on public.familias
  for all to authenticated using ((select public.es_admin())) with check ((select public.es_admin()));

alter table public.productos
  add column familia_id uuid references public.familias (id) on delete restrict,
  add column color text check (char_length(btrim(color)) between 1 and 25),
  add constraint productos_color_con_familia check ((familia_id is null) = (color is null));

create index productos_familia_idx on public.productos (familia_id);
create unique index productos_familia_color_key on public.productos (familia_id, lower(btrim(color)))
  where familia_id is not null;

-- ---------------------------------------------------------------------
-- Los datos comunes de un color solo cambian desde su familia
-- ---------------------------------------------------------------------
create or replace function public.proteger_datos_familia()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.familia_id is not null
     and coalesce(current_setting('netsec.sincronizando_familia', true), '') <> 'on'
     and (
       new.nombre is distinct from old.nombre
       or new.categoria_id is distinct from old.categoria_id
       or new.marca is distinct from old.marca
       or new.modelo is distinct from old.modelo
       or new.descripcion is distinct from old.descripcion
       or new.precio_venta is distinct from old.precio_venta
       or new.es_serializado is distinct from old.es_serializado
       or new.color is distinct from old.color
       or new.familia_id is distinct from old.familia_id
     ) then
    raise exception 'Los datos comunes de un producto con colores se editan en el producto, no en cada color';
  end if;
  return new;
end;
$$;

create trigger productos_proteger_datos_familia
  before update on public.productos
  for each row execute function public.proteger_datos_familia();

-- Copia los datos comunes de la familia a todos sus colores
create or replace function public.sincronizar_familia()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform set_config('netsec.sincronizando_familia', 'on', true);
  update public.productos
  set nombre = new.nombre || ' · ' || color,
      categoria_id = new.categoria_id,
      marca = new.marca,
      modelo = new.modelo,
      descripcion = new.descripcion,
      precio_venta = new.precio_venta,
      es_serializado = new.es_serializado
  where familia_id = new.id;
  perform set_config('netsec.sincronizando_familia', 'off', true);
  return new;
end;
$$;

create trigger familias_sincronizar
  after update on public.familias
  for each row execute function public.sincronizar_familia();

-- ---------------------------------------------------------------------
-- SKU de un color: SKU base + las 3 primeras letras del color, sin tildes
-- (REL-X + Negro → REL-X-NEG). Si ya existe, se le agrega un número.
-- ---------------------------------------------------------------------
create or replace function public._sku_color(p_sku_base text, p_color text)
returns text
language plpgsql
set search_path = ''
as $$
declare
  v_codigo text := left(upper(regexp_replace(
    translate(btrim(p_color), 'áéíóúüñÁÉÍÓÚÜÑ', 'aeiouunAEIOUUN'), '[^A-Za-z0-9]', '', 'g')), 3);
  v_sku    text;
  v_n      integer := 1;
begin
  if v_codigo = '' then
    v_codigo := 'COL';
  end if;
  v_sku := p_sku_base || '-' || v_codigo;
  while exists (select 1 from public.productos where lower(sku) = lower(v_sku)) loop
    v_n := v_n + 1;
    v_sku := p_sku_base || '-' || v_codigo || v_n;
  end loop;
  return v_sku;
end;
$$;

revoke execute on function public._sku_color from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- agregar_color: crea el producto de un color nuevo en una familia
-- ---------------------------------------------------------------------
create or replace function public.agregar_color(
  p_familia_id    uuid,
  p_color         text,
  p_costo_inicial numeric default 0,
  p_stock_minimo  integer default 0
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_familia public.familias;
  v_color   text := btrim(p_color);
  v_id      uuid;
begin
  if not public.es_admin() then
    raise exception 'No tienes permisos para crear productos' using errcode = '42501';
  end if;
  select * into v_familia from public.familias where id = p_familia_id;
  if not found then
    raise exception 'El producto con colores no existe';
  end if;
  if coalesce(v_color, '') = '' then
    raise exception 'El color no puede estar vacío';
  end if;
  if exists (select 1 from public.productos where familia_id = p_familia_id and lower(btrim(color)) = lower(v_color)) then
    raise exception 'El color "%" ya existe en %', v_color, v_familia.nombre;
  end if;

  insert into public.productos (
    sku, nombre, familia_id, color, categoria_id, marca, modelo, descripcion,
    es_serializado, precio_costo, precio_venta, stock_minimo
  )
  values (
    public._sku_color(v_familia.sku_base, v_color), v_familia.nombre || ' · ' || v_color, v_familia.id, v_color,
    v_familia.categoria_id, v_familia.marca, v_familia.modelo, v_familia.descripcion,
    v_familia.es_serializado, coalesce(p_costo_inicial, 0), v_familia.precio_venta, coalesce(p_stock_minimo, 0)
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke execute on function public.agregar_color from public, anon;
grant execute on function public.agregar_color to authenticated;

-- ---------------------------------------------------------------------
-- crear_familia: la familia y todos sus colores en una sola transacción.
-- p_familia: { nombre, sku_base, categoria_id, marca, modelo, descripcion,
--              es_serializado, precio_venta }
-- Devuelve el id del primer color.
-- ---------------------------------------------------------------------
create or replace function public.crear_familia(
  p_familia       jsonb,
  p_colores       text[],
  p_costo_inicial numeric default 0,
  p_stock_minimo  integer default 0
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_familia_id uuid;
  v_color      text;
  v_id         uuid;
  v_primero    uuid;
begin
  if not public.es_admin() then
    raise exception 'No tienes permisos para crear productos' using errcode = '42501';
  end if;
  if coalesce(array_length(p_colores, 1), 0) = 0 then
    raise exception 'Agrega al menos un color';
  end if;
  if exists (select 1 from public.productos where lower(sku) = lower(btrim(p_familia ->> 'sku_base')))
     or exists (select 1 from public.familias where lower(sku_base) = lower(btrim(p_familia ->> 'sku_base'))) then
    raise exception 'El SKU % ya está en uso', upper(btrim(p_familia ->> 'sku_base'));
  end if;

  insert into public.familias (nombre, sku_base, categoria_id, marca, modelo, descripcion, es_serializado, precio_venta)
  values (
    btrim(p_familia ->> 'nombre'),
    upper(btrim(p_familia ->> 'sku_base')),
    nullif(p_familia ->> 'categoria_id', '')::uuid,
    nullif(btrim(p_familia ->> 'marca'), ''),
    nullif(btrim(p_familia ->> 'modelo'), ''),
    nullif(btrim(p_familia ->> 'descripcion'), ''),
    coalesce((p_familia ->> 'es_serializado')::boolean, false),
    coalesce((p_familia ->> 'precio_venta')::numeric, 0)
  )
  returning id into v_familia_id;

  foreach v_color in array p_colores loop
    v_id := public.agregar_color(v_familia_id, v_color, p_costo_inicial, p_stock_minimo);
    v_primero := coalesce(v_primero, v_id);
  end loop;

  return v_primero;
end;
$$;

revoke execute on function public.crear_familia from public, anon;
grant execute on function public.crear_familia to authenticated;
