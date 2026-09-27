-- =====================================================================
-- 0014: SKU automático por categoría
--
-- El SKU deja de escribirse a mano: lo genera la base de datos al crear el
-- producto con el formato NS-<prefijo de la categoría>-<consecutivo>, y cada
-- categoría lleva su propio consecutivo (NS-SW-0001, NS-SW-0002, NS-RT-0001…).
--
-- - Un producto con colores recibe un solo número y cada color le agrega su
--   sufijo, como hasta ahora: NS-REL-0001-NEG, NS-REL-0001-AZU.
-- - El SKU no cambia nunca, aunque después se cambie la categoría (las
--   etiquetas impresas y el historial siguen sirviendo).
-- - Los productos que ya existen se renumeran en el orden en que se crearon.
--   Los que no tienen categoría conservan su SKU actual.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Prefijo y consecutivo de cada categoría
-- ---------------------------------------------------------------------
alter table public.categorias
  add column prefijo    text,
  add column ultimo_sku integer not null default 0 check (ultimo_sku >= 0);

-- Prefijos de las categorías iniciales; las demás toman sus 3 primeras letras
update public.categorias c
set prefijo = coalesce(
  case lower(btrim(c.nombre))
    when 'relojes' then 'REL'
    when 'cargadores' then 'CAR'
    when 'accesorios' then 'ACC'
    when 'switches' then 'SW'
    when 'routers' then 'RT'
    when 'access points' then 'AP'
    when 'cámaras de seguridad' then 'CAM'
    when 'dvr / nvr' then 'DVR'
    when 'cableado' then 'CAB'
  end,
  nullif(left(upper(regexp_replace(
    translate(btrim(c.nombre), 'áéíóúüñÁÉÍÓÚÜÑ', 'aeiouunAEIOUUN'), '[^A-Za-z0-9]', '', 'g')), 3), ''),
  'CAT'
);

-- Si dos categorías quedaron con el mismo prefijo, a las siguientes se les agrega un número
update public.categorias c
set prefijo = left(c.prefijo, 3) || d.n
from (
  select id, row_number() over (partition by prefijo order by created_at, id) as n
  from public.categorias
) d
where d.id = c.id and d.n > 1;

alter table public.categorias
  alter column prefijo set not null,
  add constraint categorias_prefijo_formato check (prefijo ~ '^[A-Z0-9]{2,5}$');

create unique index categorias_prefijo_key on public.categorias (prefijo);

-- ---------------------------------------------------------------------
-- _siguiente_sku: toma el siguiente número de la categoría. El UPDATE
-- bloquea la fila de la categoría, así dos productos creados al mismo
-- tiempo nunca reciben el mismo número.
-- ---------------------------------------------------------------------
create or replace function public._siguiente_sku(p_categoria_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_prefijo text;
  v_numero  integer;
  v_sku     text;
begin
  if p_categoria_id is null then
    raise exception 'Elige una categoría: el SKU se genera con su prefijo';
  end if;

  loop
    update public.categorias
    set ultimo_sku = ultimo_sku + 1
    where id = p_categoria_id
    returning prefijo, ultimo_sku into v_prefijo, v_numero;

    if not found then
      raise exception 'La categoría no existe';
    end if;

    -- Al menos 4 dígitos; a partir del 10000 crece solo
    v_sku := 'NS-' || v_prefijo || '-' || lpad(v_numero::text, greatest(4, length(v_numero::text)), '0');

    -- Por si algún SKU anterior ya usaba ese código: se salta el número
    exit when not exists (select 1 from public.productos where lower(sku) = lower(v_sku))
          and not exists (select 1 from public.familias where lower(sku_base) = lower(v_sku));
  end loop;

  return v_sku;
end;
$$;

revoke execute on function public._siguiente_sku from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Al crear: el SKU lo pone la base de datos (se ignora el que llegue).
-- Los colores reciben el SKU de su familia + sufijo en agregar_color().
-- ---------------------------------------------------------------------
alter table public.productos alter column sku set default '';
alter table public.familias alter column sku_base set default '';

-- security definer: _siguiente_sku no se expone a los usuarios
create or replace function public.asignar_sku()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_table_name = 'familias' then
    new.sku_base := public._siguiente_sku(new.categoria_id);
  elsif new.familia_id is null then
    new.sku := public._siguiente_sku(new.categoria_id);
  end if;
  return new;
end;
$$;

revoke execute on function public.asignar_sku from public, anon, authenticated;

create trigger productos_asignar_sku
  before insert on public.productos
  for each row execute function public.asignar_sku();

create trigger familias_asignar_sku
  before insert on public.familias
  for each row execute function public.asignar_sku();

-- ---------------------------------------------------------------------
-- El SKU no se edita (solo la renumeración de abajo puede cambiarlo)
-- ---------------------------------------------------------------------
create or replace function public.proteger_sku()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_cambio boolean;
begin
  if coalesce(current_setting('netsec.renumerando_sku', true), '') = 'on' then
    return new;
  end if;
  -- Cada tabla por separado: PL/pgSQL no permite nombrar un campo que la fila no tiene
  if tg_table_name = 'productos' then
    v_cambio := new.sku is distinct from old.sku;
  else
    v_cambio := new.sku_base is distinct from old.sku_base;
  end if;
  if v_cambio then
    raise exception 'El SKU se genera automáticamente y no se puede cambiar';
  end if;
  return new;
end;
$$;

revoke execute on function public.proteger_sku from public, anon, authenticated;

create trigger productos_proteger_sku
  before update of sku on public.productos
  for each row execute function public.proteger_sku();

create trigger familias_proteger_sku
  before update of sku_base on public.familias
  for each row execute function public.proteger_sku();

-- ---------------------------------------------------------------------
-- crear_familia: igual que en 0011, pero el SKU base ya no se recibe
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

  insert into public.familias (nombre, categoria_id, marca, modelo, descripcion, es_serializado, precio_venta)
  values (
    btrim(p_familia ->> 'nombre'),
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

-- ---------------------------------------------------------------------
-- Renumerar lo que ya existe, en el orden en que se creó. Productos
-- sueltos y productos con colores comparten el consecutivo de su categoría.
-- ---------------------------------------------------------------------
do $$
declare
  v_item record;
  v_base text;
begin
  perform set_config('netsec.renumerando_sku', 'on', true);

  for v_item in
    select 'producto' as tipo, id, categoria_id, created_at, null::text as sku_base
    from public.productos
    where familia_id is null and categoria_id is not null
    union all
    select 'familia', id, categoria_id, created_at, sku_base
    from public.familias
    where categoria_id is not null
    order by created_at, id
  loop
    if v_item.tipo = 'producto' then
      update public.productos set sku = public._siguiente_sku(v_item.categoria_id) where id = v_item.id;
    else
      v_base := public._siguiente_sku(v_item.categoria_id);
      update public.familias set sku_base = v_base where id = v_item.id;
      -- Cada color conserva su sufijo (-NEG, -AZU…) sobre la nueva base
      update public.productos
      set sku = v_base || case
        when left(sku, length(v_item.sku_base)) = v_item.sku_base then substr(sku, length(v_item.sku_base) + 1)
        else '-' || sku
      end
      where familia_id = v_item.id;
    end if;
  end loop;

  perform set_config('netsec.renumerando_sku', 'off', true);
end;
$$;
