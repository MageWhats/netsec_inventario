-- =====================================================================
-- 0015: costos protegidos en la base de datos
--
-- Hasta ahora el rol bodega no veía costos en la app, pero podía leerlos
-- consultando la API directamente. Ahora las columnas de costo no se
-- pueden leer de las tablas (ningún rol de la app):
--   productos.precio_costo          costo promedio
--   movimiento_items.costo_unitario costo de cada línea
-- y se obtienen con funciones que solo los devuelven a admin y lectura:
--   costos_productos()   costo promedio de cada producto
--   costos_lineas(...)   costo de las líneas de un movimiento o período
-- A bodega le devuelven cero filas. El total a costo del historial
-- (movimientos_resumen.total_costo) queda en 0 para bodega.
--
-- Escribir no cambia: bodega sigue digitando el costo de la factura en
-- las entradas y registrar_movimiento() calcula el promedio.
--
-- OJO: si en el futuro se agrega una columna a productos o a
-- movimiento_items, hay que darle permiso de lectura:
--   grant select (nueva_columna) on public.productos to authenticated;
-- =====================================================================

-- ---------------------------------------------------------------------
-- ¿El usuario actual ve costos? admin y lectura
-- ---------------------------------------------------------------------
create or replace function public.ver_costos()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.rol_actual() in ('admin', 'lectura'), false);
$$;

revoke execute on function public.ver_costos from public, anon;
grant execute on function public.ver_costos to authenticated;

-- ---------------------------------------------------------------------
-- Lectura por columnas: todas menos el costo
-- ---------------------------------------------------------------------
revoke select on public.productos        from anon, authenticated;
revoke select on public.movimiento_items from anon, authenticated;

do $$
declare
  v_tabla    text;
  v_excluida text;
  v_columnas text;
begin
  for v_tabla, v_excluida in values ('productos', 'precio_costo'), ('movimiento_items', 'costo_unitario') loop
    select string_agg(quote_ident(attname), ', ' order by attnum) into v_columnas
    from pg_attribute
    where attrelid = format('public.%I', v_tabla)::regclass
      and attnum > 0
      and not attisdropped
      and attname <> v_excluida;

    execute format('grant select (%s) on public.%I to authenticated', v_columnas, v_tabla);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------
-- Costo promedio de cada producto (vacío si el usuario no ve costos)
-- ---------------------------------------------------------------------
create or replace function public.costos_productos()
returns table (producto_id uuid, precio_costo numeric)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.precio_costo
  from public.productos p
  where public.ver_costos();
$$;

-- ---------------------------------------------------------------------
-- Costo de las líneas de un movimiento, o de los movimientos de un
-- período (fecha del movimiento entre p_desde y p_hasta). Vacío si el
-- usuario no ve costos o si no se indica ningún filtro.
-- ---------------------------------------------------------------------
create or replace function public.costos_lineas(
  p_movimiento_id uuid default null,
  p_desde         timestamptz default null,
  p_hasta         timestamptz default null
)
returns table (id uuid, costo_unitario numeric)
language sql
stable
security definer
set search_path = ''
as $$
  select mi.id, mi.costo_unitario
  from public.movimiento_items mi
  join public.movimientos m on m.id = mi.movimiento_id
  where public.ver_costos()
    and (p_movimiento_id is not null or p_desde is not null or p_hasta is not null)
    and (p_movimiento_id is null or mi.movimiento_id = p_movimiento_id)
    and (p_desde is null or m.fecha >= p_desde)
    and (p_hasta is null or m.fecha <= p_hasta);
$$;

revoke execute on function public.costos_productos, public.costos_lineas from public, anon;
grant execute on function public.costos_productos, public.costos_lineas to authenticated;

-- ---------------------------------------------------------------------
-- Historial: el total a costo sale de una función que revisa el rol
-- (la vista ya no lee la columna de costo). Mismas columnas y orden.
-- ---------------------------------------------------------------------
create or replace function public._total_costo_movimiento(p_movimiento_id uuid)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when public.ver_costos() then coalesce(sum(cantidad * costo_unitario), 0)
    else 0
  end::numeric(14, 2)
  from public.movimiento_items
  where movimiento_id = p_movimiento_id;
$$;

revoke execute on function public._total_costo_movimiento from public, anon;
grant execute on function public._total_costo_movimiento to authenticated;

create or replace view public.movimientos_resumen
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
  public._total_costo_movimiento(m.id)::numeric(14, 2)       as total_costo,
  coalesce(sum(mi.cantidad * mi.precio_unitario), 0)::numeric(14, 2) as total_venta,
  m.motivo,
  m.movimiento_origen_id
from public.movimientos m
left join public.proveedores p on p.id = m.proveedor_id
left join public.clientes c on c.id = m.cliente_id
left join public.movimiento_items mi on mi.movimiento_id = m.id
group by m.id, p.nombre, c.nombre;
