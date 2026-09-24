-- =====================================================================
-- Net&Sec Inventario - Clientes, proveedores y registro de movimientos
-- Ejecutar en Supabase → SQL Editor (una sola vez, después de 0001).
-- =====================================================================

-- ---------------------------------------------------------------------
-- Clientes
-- ---------------------------------------------------------------------
create type public.tipo_documento as enum ('CC', 'NIT', 'CE', 'PAS', 'TI', 'OTRO');

create table public.clientes (
  id             uuid primary key default gen_random_uuid(),
  tipo_documento public.tipo_documento not null default 'CC',
  documento      text not null,
  nombre         text not null,
  telefono       text,
  email          text,
  direccion      text,
  ciudad         text,
  notas          text,
  activo         boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (tipo_documento, documento)
);

create index clientes_nombre_idx on public.clientes (nombre);

create trigger clientes_updated_at
  before update on public.clientes
  for each row execute function public.set_updated_at();

alter table public.clientes enable row level security;

create policy "admin: acceso total" on public.clientes
  for all to authenticated using ((select public.es_admin())) with check ((select public.es_admin()));

-- ---------------------------------------------------------------------
-- Proveedores: campos que faltaban
-- ---------------------------------------------------------------------
alter table public.proveedores
  add column direccion  text,
  add column notas      text,
  add column activo     boolean not null default true,
  add column updated_at timestamptz not null default now();

create trigger proveedores_updated_at
  before update on public.proveedores
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- Movimientos: consecutivo, cliente y precio de venta
-- ---------------------------------------------------------------------
-- numero: consecutivo sin huecos, lo asigna registrar_movimiento()
alter table public.movimientos
  add column numero     bigint,
  add column cliente_id uuid references public.clientes (id) on delete restrict;

update public.movimientos m
set numero = n.rn
from (select id, row_number() over (order by created_at, id) as rn from public.movimientos) n
where n.id = m.id;

alter table public.movimientos
  alter column numero set not null,
  add constraint movimientos_numero_key unique (numero),
  add constraint movimientos_proveedor_solo_entrada check (proveedor_id is null or tipo = 'entrada'),
  add constraint movimientos_cliente_solo_salida check (cliente_id is null or tipo = 'salida');

-- Un proveedor con movimientos no se borra (se desactiva)
alter table public.movimientos drop constraint movimientos_proveedor_id_fkey;
alter table public.movimientos
  add constraint movimientos_proveedor_id_fkey
  foreign key (proveedor_id) references public.proveedores (id) on delete restrict;

create index movimientos_proveedor_idx on public.movimientos (proveedor_id);
create index movimientos_cliente_idx on public.movimientos (cliente_id);
create index movimiento_items_unidad_idx on public.movimiento_items (unidad_id);

alter table public.movimiento_items
  add column precio_unitario numeric(14, 2) check (precio_unitario >= 0),
  add constraint movimiento_items_costo_check check (costo_unitario >= 0);

-- ---------------------------------------------------------------------
-- Un producto con movimientos no puede cambiar entre serial / cantidad
-- ---------------------------------------------------------------------
create or replace function public.proteger_tipo_control()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.es_serializado is distinct from old.es_serializado
     and exists (select 1 from public.movimiento_items where producto_id = new.id) then
    raise exception 'No se puede cambiar el tipo de control de un producto que ya tiene movimientos';
  end if;
  return new;
end;
$$;

create trigger productos_proteger_tipo_control
  before update of es_serializado on public.productos
  for each row execute function public.proteger_tipo_control();

-- ---------------------------------------------------------------------
-- Historial inmutable: los movimientos solo se crean con
-- registrar_movimiento() y nunca se editan ni se borran (las
-- correcciones se hacen con ajustes). Las unidades solo cambian de
-- estado a través de los movimientos; a mano solo se editan MAC y notas.
-- ---------------------------------------------------------------------
drop policy "admin: acceso total" on public.movimientos;
drop policy "admin: acceso total" on public.movimiento_items;

create policy "admin: lectura" on public.movimientos
  for select to authenticated using ((select public.es_admin()));
create policy "admin: lectura" on public.movimiento_items
  for select to authenticated using ((select public.es_admin()));

revoke insert, update, delete, truncate on public.movimientos from anon, authenticated;
revoke insert, update, delete, truncate on public.movimiento_items from anon, authenticated;
revoke insert, update, delete, truncate on public.unidades from anon, authenticated;
grant update (mac, notas) on public.unidades to authenticated;

-- ---------------------------------------------------------------------
-- Vista de movimientos con totales (para el historial)
-- ---------------------------------------------------------------------
create view public.movimientos_resumen
with (security_invoker = true) as
select
  m.id,
  m.numero,
  m.tipo,
  m.fecha,
  m.bodega_id,
  m.proveedor_id,
  p.nombre as proveedor_nombre,
  m.cliente_id,
  c.nombre as cliente_nombre,
  m.referencia,
  m.notas,
  m.usuario_id,
  m.created_at,
  count(mi.id)::integer                                      as lineas,
  coalesce(sum(mi.cantidad), 0)::integer                     as unidades,
  coalesce(sum(mi.cantidad * mi.costo_unitario), 0)::numeric(14, 2)  as total_costo,
  coalesce(sum(mi.cantidad * mi.precio_unitario), 0)::numeric(14, 2) as total_venta
from public.movimientos m
left join public.proveedores p on p.id = m.proveedor_id
left join public.clientes c on c.id = m.cliente_id
left join public.movimiento_items mi on mi.movimiento_id = m.id
group by m.id, p.nombre, c.nombre;

-- ---------------------------------------------------------------------
-- registrar_movimiento: crea la cabecera, las líneas y las unidades en
-- una sola transacción, validando stock, seriales y estados.
--
-- p_items es un arreglo JSON; cada elemento:
--   { "producto_id": uuid,
--     "cantidad": int,                  -- productos por cantidad
--     "series": [{ "numero_serie", "mac" }],  -- serializados: seriales nuevos (entradas/ajustes +)
--     "unidad_ids": [uuid],             -- serializados: unidades existentes (salidas/ajustes, reingresos)
--     "estado_destino": estado_unidad,  -- ajuste de salida serializado (danada, baja, en_garantia)
--     "costo_unitario": numeric,
--     "precio_unitario": numeric }
-- ---------------------------------------------------------------------
create or replace function public.registrar_movimiento(
  p_tipo         public.tipo_movimiento,
  p_items        jsonb,
  p_bodega_id    uuid default null,
  p_proveedor_id uuid default null,
  p_cliente_id   uuid default null,
  p_referencia   text default null,
  p_notas        text default null,
  p_fecha        timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_es_entrada     boolean := p_tipo in ('entrada', 'ajuste_entrada');
  v_bodega_id      uuid := p_bodega_id;
  v_mov_id         uuid;
  v_numero         bigint;
  v_item           jsonb;
  v_serie          jsonb;
  v_producto       record;
  v_unidad         record;
  v_unidad_id      uuid;
  v_numero_serie   text;
  v_cantidad       integer;
  v_stock          integer;
  v_costo          numeric;
  v_precio         numeric;
  v_estado_destino public.estado_unidad;
  v_lineas         integer := 0;
begin
  if not public.es_admin() then
    raise exception 'No tienes permisos para registrar movimientos' using errcode = '42501';
  end if;

  -- Validaciones de cabecera
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'El movimiento debe tener al menos un producto';
  end if;
  if p_fecha is not null and p_fecha > now() + interval '5 minutes' then
    raise exception 'La fecha del movimiento no puede ser futura';
  end if;
  if p_tipo in ('ajuste_entrada', 'ajuste_salida') and coalesce(btrim(p_notas), '') = '' then
    raise exception 'Los ajustes requieren indicar el motivo';
  end if;
  if p_proveedor_id is not null and p_tipo <> 'entrada' then
    raise exception 'Solo las entradas llevan proveedor';
  end if;
  if p_cliente_id is not null and p_tipo <> 'salida' then
    raise exception 'Solo las salidas llevan cliente';
  end if;
  if p_proveedor_id is not null
     and not exists (select 1 from public.proveedores where id = p_proveedor_id and activo) then
    raise exception 'El proveedor no existe o está inactivo';
  end if;
  if p_cliente_id is not null
     and not exists (select 1 from public.clientes where id = p_cliente_id and activo) then
    raise exception 'El cliente no existe o está inactivo';
  end if;

  if v_bodega_id is null then
    select id into v_bodega_id from public.bodegas where activa order by created_at limit 1;
  end if;
  if v_bodega_id is null or not exists (select 1 from public.bodegas where id = v_bodega_id and activa) then
    raise exception 'La bodega no existe o está inactiva';
  end if;

  -- Bloquea los productos implicados (en orden, para evitar interbloqueos):
  -- dos salidas simultáneas del mismo producto no pueden dejar stock negativo.
  perform 1
  from public.productos
  where id in (select (e ->> 'producto_id')::uuid from jsonb_array_elements(p_items) e)
  order by id
  for update;

  -- Consecutivo sin huecos: el bloqueo dura hasta el fin de la transacción y,
  -- si el movimiento falla, el número no se consume.
  perform pg_advisory_xact_lock(hashtext('movimientos.numero'));
  select coalesce(max(numero), 0) + 1 into v_numero from public.movimientos;

  insert into public.movimientos (numero, tipo, bodega_id, proveedor_id, cliente_id, referencia, notas, fecha, usuario_id)
  values (
    v_numero, p_tipo, v_bodega_id, p_proveedor_id, p_cliente_id,
    nullif(btrim(p_referencia), ''), nullif(btrim(p_notas), ''),
    coalesce(p_fecha, now()), auth.uid()
  )
  returning id into v_mov_id;

  for v_item in select * from jsonb_array_elements(p_items) loop
    select id, nombre, es_serializado, activo into v_producto
    from public.productos
    where id = (v_item ->> 'producto_id')::uuid;

    if not found then
      raise exception 'Producto no encontrado';
    end if;
    if not v_producto.activo then
      raise exception 'El producto "%" está inactivo', v_producto.nombre;
    end if;

    v_costo  := (v_item ->> 'costo_unitario')::numeric;
    v_precio := (v_item ->> 'precio_unitario')::numeric;
    if coalesce(v_costo, 0) < 0 or coalesce(v_precio, 0) < 0 then
      raise exception 'Los valores de "%" no pueden ser negativos', v_producto.nombre;
    end if;

    if v_producto.es_serializado then
      if v_es_entrada then
        -- Seriales nuevos
        for v_serie in select * from jsonb_array_elements(coalesce(v_item -> 'series', '[]'::jsonb)) loop
          v_numero_serie := upper(btrim(v_serie ->> 'numero_serie'));
          if coalesce(v_numero_serie, '') = '' then
            raise exception 'Hay un número de serie vacío en "%"', v_producto.nombre;
          end if;
          if exists (
            select 1 from public.unidades where producto_id = v_producto.id and numero_serie = v_numero_serie
          ) then
            raise exception 'El serial % ya está registrado para "%"', v_numero_serie, v_producto.nombre;
          end if;

          insert into public.unidades (producto_id, bodega_id, numero_serie, mac)
          values (v_producto.id, v_bodega_id, v_numero_serie, nullif(upper(btrim(v_serie ->> 'mac')), ''))
          returning id into v_unidad_id;

          insert into public.movimiento_items (movimiento_id, producto_id, unidad_id, cantidad, costo_unitario, precio_unitario)
          values (v_mov_id, v_producto.id, v_unidad_id, 1, v_costo, v_precio);
          v_lineas := v_lineas + 1;
        end loop;

        -- Reingreso de unidades existentes (devoluciones, regreso de garantía...): solo en ajustes
        for v_unidad_id in
          select (x #>> '{}')::uuid from jsonb_array_elements(coalesce(v_item -> 'unidad_ids', '[]'::jsonb)) x
        loop
          if p_tipo = 'entrada' then
            raise exception 'Las entradas solo registran seriales nuevos; usa un ajuste para reingresar unidades';
          end if;

          select * into v_unidad from public.unidades
          where id = v_unidad_id and producto_id = v_producto.id
          for update;
          if not found then
            raise exception 'Unidad no encontrada para "%"', v_producto.nombre;
          end if;
          if v_unidad.estado = 'disponible' then
            raise exception 'La unidad % ya está disponible', v_unidad.numero_serie;
          end if;

          update public.unidades set estado = 'disponible', bodega_id = v_bodega_id where id = v_unidad_id;

          insert into public.movimiento_items (movimiento_id, producto_id, unidad_id, cantidad, costo_unitario, precio_unitario)
          values (v_mov_id, v_producto.id, v_unidad_id, 1, v_costo, v_precio);
          v_lineas := v_lineas + 1;
        end loop;
      else
        v_estado_destino := case
          when p_tipo = 'salida' then 'vendida'
          else coalesce((v_item ->> 'estado_destino')::public.estado_unidad, 'baja')
        end;
        if v_estado_destino = 'disponible' then
          raise exception 'Estado de destino inválido para un ajuste de salida';
        end if;

        for v_unidad_id in
          select (x #>> '{}')::uuid from jsonb_array_elements(coalesce(v_item -> 'unidad_ids', '[]'::jsonb)) x
        loop
          select * into v_unidad from public.unidades
          where id = v_unidad_id and producto_id = v_producto.id
          for update;
          if not found then
            raise exception 'Unidad no encontrada para "%"', v_producto.nombre;
          end if;
          if v_unidad.estado <> 'disponible' or v_unidad.bodega_id <> v_bodega_id then
            raise exception 'La unidad % no está disponible en la bodega', v_unidad.numero_serie;
          end if;

          update public.unidades set estado = v_estado_destino where id = v_unidad_id;

          insert into public.movimiento_items (movimiento_id, producto_id, unidad_id, cantidad, costo_unitario, precio_unitario)
          values (v_mov_id, v_producto.id, v_unidad_id, 1, v_costo, v_precio);
          v_lineas := v_lineas + 1;
        end loop;
      end if;
    else
      v_cantidad := (v_item ->> 'cantidad')::integer;
      if v_cantidad is null or v_cantidad <= 0 then
        raise exception 'La cantidad de "%" debe ser mayor que cero', v_producto.nombre;
      end if;

      if not v_es_entrada then
        -- Incluye las líneas ya insertadas en este mismo movimiento
        select coalesce(sum(cantidad), 0) into v_stock
        from public.stock_actual
        where producto_id = v_producto.id and bodega_id = v_bodega_id;

        if v_stock < v_cantidad then
          raise exception 'Stock insuficiente de "%": hay %, se intentan sacar %', v_producto.nombre, v_stock, v_cantidad;
        end if;
      end if;

      insert into public.movimiento_items (movimiento_id, producto_id, cantidad, costo_unitario, precio_unitario)
      values (v_mov_id, v_producto.id, v_cantidad, v_costo, v_precio);
      v_lineas := v_lineas + 1;
    end if;
  end loop;

  if v_lineas = 0 then
    raise exception 'El movimiento no tiene unidades ni cantidades';
  end if;

  return v_mov_id;
end;
$$;

revoke execute on function public.registrar_movimiento from public, anon;
grant execute on function public.registrar_movimiento to authenticated;
