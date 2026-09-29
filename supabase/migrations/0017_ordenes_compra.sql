-- =====================================================================
-- 0017: órdenes de compra a proveedores
--
-- Una orden (OC-000001) lista los productos que se le piden a un
-- proveedor, con la cantidad y el costo pactado. Al llegar la mercancía se
-- "recibe": se registra una entrada normal (registrar_movimiento, con su
-- costo promedio) enlazada a la orden. Se puede recibir en varias entregas;
-- cuando llega todo, la orden queda "recibida". Una orden abierta se puede
-- cancelar (lo pendiente ya no llegará).
--
-- Solo admin crea, edita, recibe y cancela. Admin y lectura las ven (tienen
-- costos, que bodega no ve). Todo pasa por funciones: las tablas no se
-- modifican directamente desde la app.
-- =====================================================================

create type public.estado_orden_compra as enum ('abierta', 'recibida', 'cancelada');

create table public.ordenes_compra (
  id              uuid primary key default gen_random_uuid(),
  numero          bigint not null unique,
  proveedor_id    uuid not null references public.proveedores (id) on delete restrict,
  estado          public.estado_orden_compra not null default 'abierta',
  fecha_esperada  date,
  notas           text check (char_length(notas) <= 1000),
  usuario_id      uuid default auth.uid() references auth.users (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  cerrada_at      timestamptz
);

create index ordenes_compra_proveedor_idx on public.ordenes_compra (proveedor_id);

create trigger ordenes_compra_updated_at
  before update on public.ordenes_compra
  for each row execute function public.set_updated_at();

create table public.orden_compra_items (
  id              uuid primary key default gen_random_uuid(),
  orden_id        uuid not null references public.ordenes_compra (id) on delete cascade,
  producto_id     uuid not null references public.productos (id) on delete restrict,
  cantidad        integer not null check (cantidad > 0 and cantidad <= 100000),
  costo_unitario  numeric(14, 2) not null default 0 check (costo_unitario >= 0),
  unique (orden_id, producto_id)
);

create index orden_compra_items_producto_idx on public.orden_compra_items (producto_id);

-- Entradas que reciben una orden
alter table public.movimientos
  add column orden_compra_id uuid references public.ordenes_compra (id) on delete restrict;

create index movimientos_orden_compra_idx on public.movimientos (orden_compra_id) where orden_compra_id is not null;

-- ---------------------------------------------------------------------
-- Seguridad
-- ---------------------------------------------------------------------
alter table public.ordenes_compra     enable row level security;
alter table public.orden_compra_items enable row level security;

create policy "admin y lectura: lectura" on public.ordenes_compra
  for select to authenticated using ((select public.ver_costos()));
create policy "admin y lectura: lectura" on public.orden_compra_items
  for select to authenticated using ((select public.ver_costos()));

revoke insert, update, delete, truncate on public.ordenes_compra     from anon, authenticated;
revoke insert, update, delete, truncate on public.orden_compra_items from anon, authenticated;

-- ---------------------------------------------------------------------
-- Vistas: cada línea con lo recibido, y el listado con el avance
-- ---------------------------------------------------------------------
create view public.orden_compra_items_estado
with (security_invoker = true) as
select
  oci.id,
  oci.orden_id,
  oci.producto_id,
  oci.cantidad,
  oci.costo_unitario,
  coalesce((
    select sum(mi.cantidad)
    from public.movimientos m
    join public.movimiento_items mi on mi.movimiento_id = m.id
    where m.orden_compra_id = oci.orden_id and mi.producto_id = oci.producto_id
  ), 0)::integer as recibido
from public.orden_compra_items oci;

create view public.ordenes_compra_resumen
with (security_invoker = true) as
select
  o.id,
  o.numero,
  o.proveedor_id,
  p.nombre as proveedor_nombre,
  o.estado,
  o.fecha_esperada,
  o.notas,
  o.usuario_id,
  o.created_at,
  o.cerrada_at,
  count(e.id)::integer                                        as lineas,
  coalesce(sum(e.cantidad), 0)::integer                       as unidades,
  coalesce(sum(least(e.recibido, e.cantidad)), 0)::integer    as recibidas,
  coalesce(sum(e.cantidad * e.costo_unitario), 0)::numeric(14, 2) as total
from public.ordenes_compra o
join public.proveedores p on p.id = o.proveedor_id
left join public.orden_compra_items_estado e on e.orden_id = o.id
group by o.id, p.nombre;

-- ---------------------------------------------------------------------
-- Crear o editar una orden. p_items: [{ producto_id, cantidad, costo_unitario }]
-- Una orden solo se edita mientras esté abierta y sin entregas recibidas.
-- ---------------------------------------------------------------------
create or replace function public.guardar_orden_compra(
  p_proveedor_id   uuid,
  p_items          jsonb,
  p_id             uuid default null,
  p_fecha_esperada date default null,
  p_notas          text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id     uuid := p_id;
  v_numero bigint;
  v_item   jsonb;
  v_orden  public.ordenes_compra;
begin
  if not public.es_admin() then
    raise exception 'Solo un administrador puede gestionar órdenes de compra' using errcode = '42501';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'La orden debe tener al menos un producto';
  end if;
  if not exists (select 1 from public.proveedores where id = p_proveedor_id and activo) then
    raise exception 'El proveedor no existe o está inactivo';
  end if;

  if v_id is null then
    perform pg_advisory_xact_lock(hashtext('ordenes_compra.numero'));
    select coalesce(max(numero), 0) + 1 into v_numero from public.ordenes_compra;

    insert into public.ordenes_compra (numero, proveedor_id, fecha_esperada, notas)
    values (v_numero, p_proveedor_id, p_fecha_esperada, nullif(btrim(p_notas), ''))
    returning id into v_id;
  else
    select * into v_orden from public.ordenes_compra where id = v_id for update;
    if not found then
      raise exception 'La orden de compra no existe';
    end if;
    if v_orden.estado <> 'abierta' then
      raise exception 'La orden OC-% ya está cerrada', lpad(v_orden.numero::text, 6, '0');
    end if;
    if exists (select 1 from public.movimientos where orden_compra_id = v_id) then
      raise exception 'La orden OC-% ya tiene mercancía recibida: no se puede editar', lpad(v_orden.numero::text, 6, '0');
    end if;

    update public.ordenes_compra
    set proveedor_id = p_proveedor_id, fecha_esperada = p_fecha_esperada, notas = nullif(btrim(p_notas), '')
    where id = v_id;
    delete from public.orden_compra_items where orden_id = v_id;
  end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    if not exists (select 1 from public.productos where id = (v_item ->> 'producto_id')::uuid and activo) then
      raise exception 'Un producto de la orden no existe o está inactivo';
    end if;
    if exists (select 1 from public.orden_compra_items where orden_id = v_id and producto_id = (v_item ->> 'producto_id')::uuid) then
      raise exception 'Un producto está repetido en la orden';
    end if;
    insert into public.orden_compra_items (orden_id, producto_id, cantidad, costo_unitario)
    values (
      v_id,
      (v_item ->> 'producto_id')::uuid,
      (v_item ->> 'cantidad')::integer,
      coalesce((v_item ->> 'costo_unitario')::numeric, 0)
    );
  end loop;

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------
-- Cancelar una orden abierta (lo que falta por recibir ya no llegará)
-- ---------------------------------------------------------------------
create or replace function public.cancelar_orden_compra(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_orden public.ordenes_compra;
begin
  if not public.es_admin() then
    raise exception 'Solo un administrador puede gestionar órdenes de compra' using errcode = '42501';
  end if;
  select * into v_orden from public.ordenes_compra where id = p_id for update;
  if not found then
    raise exception 'La orden de compra no existe';
  end if;
  if v_orden.estado <> 'abierta' then
    raise exception 'La orden OC-% ya está cerrada', lpad(v_orden.numero::text, 6, '0');
  end if;
  update public.ordenes_compra set estado = 'cancelada', cerrada_at = now() where id = p_id;
end;
$$;

-- ---------------------------------------------------------------------
-- Recibir mercancía de una orden: registra la entrada (mismo formato de
-- p_items que registrar_movimiento) y la enlaza. No se puede recibir más
-- de lo pedido ni productos que no estén en la orden. Cuando llega todo,
-- la orden queda "recibida".
-- ---------------------------------------------------------------------
create or replace function public.recibir_orden_compra(
  p_orden_id   uuid,
  p_items      jsonb,
  p_referencia text default null,
  p_notas      text default null,
  p_fecha      timestamptz default null,
  p_bodega_id  uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_orden  public.ordenes_compra;
  v_mov_id uuid;
  v_exceso record;
begin
  if not public.es_admin() then
    raise exception 'Solo un administrador puede recibir órdenes de compra' using errcode = '42501';
  end if;
  select * into v_orden from public.ordenes_compra where id = p_orden_id for update;
  if not found then
    raise exception 'La orden de compra no existe';
  end if;
  if v_orden.estado <> 'abierta' then
    raise exception 'La orden OC-% ya está cerrada', lpad(v_orden.numero::text, 6, '0');
  end if;
  if exists (
    select 1 from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) e
    where not exists (
      select 1 from public.orden_compra_items
      where orden_id = p_orden_id and producto_id = (e ->> 'producto_id')::uuid
    )
  ) then
    raise exception 'Solo se pueden recibir productos de la orden';
  end if;

  v_mov_id := public.registrar_movimiento(
    p_tipo         => 'entrada',
    p_items        => p_items,
    p_bodega_id    => p_bodega_id,
    p_proveedor_id => v_orden.proveedor_id,
    p_referencia   => p_referencia,
    p_notas        => coalesce(nullif(btrim(p_notas), ''), 'Recepción de la orden OC-' || lpad(v_orden.numero::text, 6, '0')),
    p_fecha        => p_fecha
  );
  update public.movimientos set orden_compra_id = p_orden_id where id = v_mov_id;

  -- Con la entrada ya registrada, nada puede superar lo pedido
  select p.nombre, e.cantidad, e.recibido into v_exceso
  from public.orden_compra_items_estado e
  join public.productos p on p.id = e.producto_id
  where e.orden_id = p_orden_id and e.recibido > e.cantidad
  limit 1;
  if found then
    raise exception 'De "%" se pidieron % y se recibirían %: no se puede recibir más de lo pedido',
      v_exceso.nombre, v_exceso.cantidad, v_exceso.recibido;
  end if;

  if not exists (
    select 1 from public.orden_compra_items_estado where orden_id = p_orden_id and recibido < cantidad
  ) then
    update public.ordenes_compra set estado = 'recibida', cerrada_at = now() where id = p_orden_id;
  end if;

  return v_mov_id;
end;
$$;

revoke execute on function public.guardar_orden_compra, public.cancelar_orden_compra, public.recibir_orden_compra
  from public, anon;
grant execute on function public.guardar_orden_compra, public.cancelar_orden_compra, public.recibir_orden_compra
  to authenticated;
