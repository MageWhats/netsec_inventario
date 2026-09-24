-- =====================================================================
-- Net&Sec Inventario - Toma de inventario físico
-- Ejecutar en Supabase → SQL Editor (una sola vez, después de 0002).
--
-- Flujo: iniciar_toma() congela la lista de productos a contar →
-- se cuenta (cantidades y seriales escaneados) → finalizar_toma() compara
-- con el stock del sistema y genera un ajuste + (sobrantes) y un ajuste −
-- (faltantes) con registrar_movimiento(), en una sola transacción.
-- Las tablas solo se modifican con estas funciones.
-- =====================================================================

create type public.estado_toma as enum ('en_curso', 'finalizada', 'cancelada');

create table public.tomas_inventario (
  id                uuid primary key default gen_random_uuid(),
  numero            bigint generated always as identity unique,
  estado            public.estado_toma not null default 'en_curso',
  bodega_id         uuid not null references public.bodegas (id) on delete restrict,
  categoria_id      uuid references public.categorias (id) on delete restrict, -- null = todo el inventario
  notas             text,
  usuario_id        uuid default auth.uid() references auth.users (id) on delete set null,
  created_at        timestamptz not null default now(),
  cerrada_at        timestamptz,
  ajuste_entrada_id uuid references public.movimientos (id) on delete restrict,
  ajuste_salida_id  uuid references public.movimientos (id) on delete restrict
);

-- Solo una toma abierta por bodega: dos conteos simultáneos se pisarían
create unique index tomas_inventario_una_en_curso on public.tomas_inventario (bodega_id) where estado = 'en_curso';

-- Productos incluidos en la toma. contado = null → aún no se ha contado (no se ajusta)
create table public.toma_productos (
  toma_id       uuid not null references public.tomas_inventario (id) on delete cascade,
  producto_id   uuid not null references public.productos (id) on delete restrict,
  stock_inicial integer not null, -- stock del sistema al iniciar, solo como referencia
  contado       integer check (contado >= 0),
  updated_at    timestamptz not null default now(),
  primary key (toma_id, producto_id)
);

-- Seriales encontrados físicamente
create table public.toma_seriales (
  id          uuid primary key default gen_random_uuid(),
  toma_id     uuid not null,
  producto_id uuid not null,
  unidad_id   uuid not null references public.unidades (id) on delete restrict,
  created_at  timestamptz not null default now(),
  unique (toma_id, unidad_id),
  foreign key (toma_id, producto_id) references public.toma_productos (toma_id, producto_id) on delete cascade
);

create index toma_seriales_producto_idx on public.toma_seriales (toma_id, producto_id);

alter table public.tomas_inventario enable row level security;
alter table public.toma_productos   enable row level security;
alter table public.toma_seriales    enable row level security;

create policy "admin: lectura" on public.tomas_inventario
  for select to authenticated using ((select public.es_admin()));
create policy "admin: lectura" on public.toma_productos
  for select to authenticated using ((select public.es_admin()));
create policy "admin: lectura" on public.toma_seriales
  for select to authenticated using ((select public.es_admin()));

revoke insert, update, delete, truncate on public.tomas_inventario from anon, authenticated;
revoke insert, update, delete, truncate on public.toma_productos   from anon, authenticated;
revoke insert, update, delete, truncate on public.toma_seriales    from anon, authenticated;

-- Listado con avance del conteo
create view public.tomas_resumen
with (security_invoker = true) as
select
  t.*,
  c.nombre as categoria_nombre,
  count(tp.producto_id)::integer                             as productos,
  count(tp.producto_id) filter (where tp.contado is not null)::integer as contados
from public.tomas_inventario t
left join public.categorias c on c.id = t.categoria_id
left join public.toma_productos tp on tp.toma_id = t.id
group by t.id, c.nombre;

-- ---------------------------------------------------------------------
-- Utilidades internas
-- ---------------------------------------------------------------------

-- Bloquea la toma y verifica que se pueda modificar
create or replace function public._toma_en_curso(p_toma_id uuid)
returns public.tomas_inventario
language plpgsql
set search_path = ''
as $$
declare
  v_toma public.tomas_inventario;
begin
  if not public.es_admin() then
    raise exception 'No tienes permisos para gestionar tomas de inventario' using errcode = '42501';
  end if;
  select * into v_toma from public.tomas_inventario where id = p_toma_id for update;
  if not found then
    raise exception 'La toma de inventario no existe';
  end if;
  if v_toma.estado <> 'en_curso' then
    raise exception 'La toma #% ya está cerrada', v_toma.numero;
  end if;
  return v_toma;
end;
$$;

revoke execute on function public._toma_en_curso from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- iniciar_toma: crea la toma con los productos activos del alcance
-- ---------------------------------------------------------------------
create or replace function public.iniciar_toma(
  p_categoria_id uuid default null,
  p_notas        text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_bodega_id uuid;
  v_toma_id   uuid;
begin
  if not public.es_admin() then
    raise exception 'No tienes permisos para gestionar tomas de inventario' using errcode = '42501';
  end if;

  select id into v_bodega_id from public.bodegas where activa order by created_at limit 1;
  if v_bodega_id is null then
    raise exception 'No hay ninguna bodega activa';
  end if;
  if exists (select 1 from public.tomas_inventario where bodega_id = v_bodega_id and estado = 'en_curso') then
    raise exception 'Ya hay una toma de inventario en curso: finalízala o cancélala antes de iniciar otra';
  end if;

  insert into public.tomas_inventario (bodega_id, categoria_id, notas)
  values (v_bodega_id, p_categoria_id, nullif(btrim(p_notas), ''))
  returning id into v_toma_id;

  insert into public.toma_productos (toma_id, producto_id, stock_inicial)
  select
    v_toma_id,
    p.id,
    coalesce((select sum(s.cantidad) from public.stock_actual s where s.producto_id = p.id and s.bodega_id = v_bodega_id), 0)
  from public.productos p
  where p.activo and (p_categoria_id is null or p.categoria_id = p_categoria_id);

  if not found then
    raise exception 'No hay productos activos para contar en ese alcance';
  end if;

  return v_toma_id;
end;
$$;

-- ---------------------------------------------------------------------
-- contar_producto: fija la cantidad contada (null = quitar el conteo).
-- En productos con serial solo sirve para marcar 0 o desmarcar cuando no
-- hay seriales escaneados; el resto se cuenta escaneando.
-- ---------------------------------------------------------------------
create or replace function public.contar_producto(p_toma_id uuid, p_producto_id uuid, p_contado integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_serializado boolean;
begin
  perform public._toma_en_curso(p_toma_id);

  if p_contado is not null and p_contado < 0 then
    raise exception 'La cantidad contada no puede ser negativa';
  end if;

  select p.es_serializado into v_serializado
  from public.toma_productos tp
  join public.productos p on p.id = tp.producto_id
  where tp.toma_id = p_toma_id and tp.producto_id = p_producto_id;
  if not found then
    raise exception 'El producto no hace parte de esta toma';
  end if;

  if v_serializado then
    if coalesce(p_contado, 0) <> 0 then
      raise exception 'Los productos con serial se cuentan escaneando cada unidad';
    end if;
    if exists (select 1 from public.toma_seriales where toma_id = p_toma_id and producto_id = p_producto_id) then
      raise exception 'El producto ya tiene seriales escaneados: quítalos uno a uno';
    end if;
  end if;

  update public.toma_productos
  set contado = p_contado, updated_at = now()
  where toma_id = p_toma_id and producto_id = p_producto_id;
end;
$$;

-- ---------------------------------------------------------------------
-- sumar_conteo: suma unidades al conteo (p. ej. un escaneo por unidad).
-- Atómico, para que dos personas puedan contar a la vez.
-- ---------------------------------------------------------------------
create or replace function public.sumar_conteo(p_toma_id uuid, p_producto_id uuid, p_cantidad integer default 1)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_contado integer;
begin
  perform public._toma_en_curso(p_toma_id);

  if exists (select 1 from public.productos where id = p_producto_id and es_serializado) then
    raise exception 'Los productos con serial se cuentan escaneando el serial de cada unidad';
  end if;

  update public.toma_productos
  set contado = greatest(coalesce(contado, 0) + p_cantidad, 0), updated_at = now()
  where toma_id = p_toma_id and producto_id = p_producto_id
  returning contado into v_contado;
  if not found then
    raise exception 'El producto no hace parte de esta toma';
  end if;

  return v_contado;
end;
$$;

-- ---------------------------------------------------------------------
-- escanear_serial: registra una unidad encontrada físicamente
-- ---------------------------------------------------------------------
create or replace function public.escanear_serial(p_toma_id uuid, p_numero_serie text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_serie     text := upper(btrim(p_numero_serie));
  v_unidad    record;
  v_coinciden integer;
begin
  perform public._toma_en_curso(p_toma_id);

  if coalesce(v_serie, '') = '' then
    raise exception 'El serial está vacío';
  end if;

  -- El serial es único por producto: solo cuentan los productos incluidos en la toma
  select count(*) into v_coinciden
  from public.unidades u
  join public.toma_productos tp on tp.producto_id = u.producto_id and tp.toma_id = p_toma_id
  where u.numero_serie = v_serie;

  if v_coinciden = 0 then
    if exists (select 1 from public.unidades where numero_serie = v_serie) then
      raise exception 'El serial % es de un producto que no hace parte de esta toma', v_serie;
    end if;
    raise exception 'El serial % no está registrado: ingrésalo con una entrada o un ajuste +', v_serie;
  end if;
  if v_coinciden > 1 then
    raise exception 'El serial % existe en varios productos; revísalo manualmente', v_serie;
  end if;

  select u.id, u.producto_id, u.estado, p.nombre into v_unidad
  from public.unidades u
  join public.toma_productos tp on tp.producto_id = u.producto_id and tp.toma_id = p_toma_id
  join public.productos p on p.id = u.producto_id
  where u.numero_serie = v_serie;

  if exists (select 1 from public.toma_seriales where toma_id = p_toma_id and unidad_id = v_unidad.id) then
    raise exception 'El serial % ya fue escaneado en esta toma', v_serie;
  end if;

  insert into public.toma_seriales (toma_id, producto_id, unidad_id)
  values (p_toma_id, v_unidad.producto_id, v_unidad.id);

  update public.toma_productos
  set contado = (select count(*) from public.toma_seriales where toma_id = p_toma_id and producto_id = v_unidad.producto_id),
      updated_at = now()
  where toma_id = p_toma_id and producto_id = v_unidad.producto_id;

  return jsonb_build_object(
    'producto_id', v_unidad.producto_id,
    'producto', v_unidad.nombre,
    'numero_serie', v_serie,
    'estado', v_unidad.estado
  );
end;
$$;

-- ---------------------------------------------------------------------
-- quitar_serial: deshace un escaneo
-- ---------------------------------------------------------------------
create or replace function public.quitar_serial(p_toma_id uuid, p_unidad_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_producto_id uuid;
begin
  perform public._toma_en_curso(p_toma_id);

  delete from public.toma_seriales
  where toma_id = p_toma_id and unidad_id = p_unidad_id
  returning producto_id into v_producto_id;
  if not found then
    raise exception 'Ese serial no estaba escaneado en esta toma';
  end if;

  update public.toma_productos
  set contado = (select count(*) from public.toma_seriales where toma_id = p_toma_id and producto_id = v_producto_id),
      updated_at = now()
  where toma_id = p_toma_id and producto_id = v_producto_id;
end;
$$;

-- ---------------------------------------------------------------------
-- finalizar_toma: compara el conteo con el stock ACTUAL y genera los ajustes.
-- Los productos sin contar (contado null) o ya inactivos no se ajustan.
-- ---------------------------------------------------------------------
create or replace function public.finalizar_toma(p_toma_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_toma       public.tomas_inventario;
  v_producto   record;
  v_stock      integer;
  v_diferencia integer;
  v_ids        jsonb;
  v_entradas   jsonb := '[]'::jsonb;
  v_salidas    jsonb := '[]'::jsonb;
  v_entrada_id uuid;
  v_salida_id  uuid;
begin
  v_toma := public._toma_en_curso(p_toma_id);

  for v_producto in
    select p.id, p.es_serializado, p.precio_costo, tp.contado
    from public.toma_productos tp
    join public.productos p on p.id = tp.producto_id
    where tp.toma_id = p_toma_id and tp.contado is not null and p.activo
    order by p.id
  loop
    if not v_producto.es_serializado then
      select coalesce(sum(cantidad), 0) into v_stock
      from public.stock_actual
      where producto_id = v_producto.id and bodega_id = v_toma.bodega_id;

      v_diferencia := v_producto.contado - v_stock;
      if v_diferencia > 0 then
        v_entradas := v_entradas || jsonb_build_array(jsonb_build_object(
          'producto_id', v_producto.id, 'cantidad', v_diferencia, 'costo_unitario', v_producto.precio_costo));
      elsif v_diferencia < 0 then
        v_salidas := v_salidas || jsonb_build_array(jsonb_build_object(
          'producto_id', v_producto.id, 'cantidad', -v_diferencia, 'costo_unitario', v_producto.precio_costo));
      end if;
    else
      -- Sobrantes: unidades encontradas que el sistema no tenía como disponibles (vendidas, de baja...)
      select coalesce(jsonb_agg(u.id), '[]'::jsonb) into v_ids
      from public.toma_seriales ts
      join public.unidades u on u.id = ts.unidad_id
      where ts.toma_id = p_toma_id and ts.producto_id = v_producto.id and u.estado <> 'disponible';

      if jsonb_array_length(v_ids) > 0 then
        v_entradas := v_entradas || jsonb_build_array(jsonb_build_object(
          'producto_id', v_producto.id, 'unidad_ids', v_ids, 'costo_unitario', v_producto.precio_costo));
      end if;

      -- Faltantes: unidades disponibles en la bodega que no se encontraron
      select coalesce(jsonb_agg(u.id), '[]'::jsonb) into v_ids
      from public.unidades u
      where u.producto_id = v_producto.id
        and u.bodega_id = v_toma.bodega_id
        and u.estado = 'disponible'
        and not exists (select 1 from public.toma_seriales ts where ts.toma_id = p_toma_id and ts.unidad_id = u.id);

      if jsonb_array_length(v_ids) > 0 then
        v_salidas := v_salidas || jsonb_build_array(jsonb_build_object(
          'producto_id', v_producto.id, 'unidad_ids', v_ids, 'estado_destino', 'baja',
          'costo_unitario', v_producto.precio_costo));
      end if;
    end if;
  end loop;

  if jsonb_array_length(v_entradas) > 0 then
    v_entrada_id := public.registrar_movimiento(
      p_tipo      => 'ajuste_entrada',
      p_items     => v_entradas,
      p_bodega_id => v_toma.bodega_id,
      p_referencia => 'Toma #' || v_toma.numero,
      p_notas     => 'Sobrantes de la toma de inventario #' || v_toma.numero
    );
  end if;

  if jsonb_array_length(v_salidas) > 0 then
    v_salida_id := public.registrar_movimiento(
      p_tipo      => 'ajuste_salida',
      p_items     => v_salidas,
      p_bodega_id => v_toma.bodega_id,
      p_referencia => 'Toma #' || v_toma.numero,
      p_notas     => 'Faltantes de la toma de inventario #' || v_toma.numero
    );
  end if;

  update public.tomas_inventario
  set estado = 'finalizada', cerrada_at = now(), ajuste_entrada_id = v_entrada_id, ajuste_salida_id = v_salida_id
  where id = p_toma_id;

  return jsonb_build_object('ajuste_entrada_id', v_entrada_id, 'ajuste_salida_id', v_salida_id);
end;
$$;

-- ---------------------------------------------------------------------
-- cancelar_toma: cierra la toma sin tocar el inventario
-- ---------------------------------------------------------------------
create or replace function public.cancelar_toma(p_toma_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public._toma_en_curso(p_toma_id);
  update public.tomas_inventario set estado = 'cancelada', cerrada_at = now() where id = p_toma_id;
end;
$$;

revoke execute on function public.iniciar_toma    from public, anon;
revoke execute on function public.contar_producto from public, anon;
revoke execute on function public.sumar_conteo    from public, anon;
revoke execute on function public.escanear_serial from public, anon;
revoke execute on function public.quitar_serial   from public, anon;
revoke execute on function public.finalizar_toma  from public, anon;
revoke execute on function public.cancelar_toma   from public, anon;

grant execute on function public.iniciar_toma    to authenticated;
grant execute on function public.contar_producto to authenticated;
grant execute on function public.sumar_conteo    to authenticated;
grant execute on function public.escanear_serial to authenticated;
grant execute on function public.quitar_serial   to authenticated;
grant execute on function public.finalizar_toma  to authenticated;
grant execute on function public.cancelar_toma   to authenticated;
