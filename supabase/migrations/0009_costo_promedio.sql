-- =====================================================================
-- 0009: costo promedio ponderado
--
-- El precio de costo de cada producto deja de editarse a mano: lo calcula
-- la base de datos con cada entrada de mercancía.
--
--   nuevo costo = (stock actual × costo actual + unidades que entran × su costo)
--                 ÷ (stock actual + unidades que entran)
--
-- - Entradas y ajustes +: recalculan el promedio con su costo unitario
--   (si un ajuste + entra al promedio vigente, el promedio no cambia).
-- - Salidas y ajustes −: salen siempre al costo promedio del momento y lo
--   guardan en la línea, así el margen de una venta no cambia después.
-- - Los movimientos que ya existen no se modifican: solo se recalcula el
--   costo promedio actual de cada producto recorriendo su historial.
-- =====================================================================

-- ---------------------------------------------------------------------
-- El costo solo lo cambia el cálculo automático
-- ---------------------------------------------------------------------
create or replace function public.proteger_precio_costo()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.precio_costo is distinct from old.precio_costo
     and coalesce(current_setting('netsec.costo_automatico', true), '') <> 'on' then
    raise exception 'El precio de costo se calcula automáticamente con las entradas (costo promedio ponderado)';
  end if;
  return new;
end;
$$;

create trigger productos_proteger_precio_costo
  before update of precio_costo on public.productos
  for each row execute function public.proteger_precio_costo();

-- ---------------------------------------------------------------------
-- _promediar_costo: suma al promedio unidades que entran. Se llama ANTES
-- de insertar la línea, así el stock leído es el previo a la entrada.
-- Uso interno de registrar_movimiento() (no se expone a la app).
-- ---------------------------------------------------------------------
create or replace function public._promediar_costo(p_producto_id uuid, p_cantidad integer, p_costo numeric)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_stock integer;
begin
  select greatest(coalesce(sum(cantidad), 0), 0) into v_stock
  from public.stock_actual
  where producto_id = p_producto_id;

  perform set_config('netsec.costo_automatico', 'on', true);
  update public.productos
  set precio_costo = case
    when v_stock = 0 then p_costo
    else round((v_stock * precio_costo + p_cantidad * p_costo) / (v_stock + p_cantidad), 2)
  end
  where id = p_producto_id;
  perform set_config('netsec.costo_automatico', 'off', true);
end;
$$;

revoke execute on function public._promediar_costo from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Costo promedio actual de cada producto, recorriendo su historial en el
-- orden en que se registraron los movimientos
-- ---------------------------------------------------------------------
do $$
declare
  v_producto record;
  v_item     record;
  v_stock    integer;
  v_costo    numeric;
  v_hubo     boolean;
begin
  perform set_config('netsec.costo_automatico', 'on', true);

  for v_producto in select id, precio_costo from public.productos loop
    v_stock := 0;
    v_costo := v_producto.precio_costo;
    v_hubo  := false;

    for v_item in
      select m.tipo, mi.cantidad, mi.costo_unitario
      from public.movimiento_items mi
      join public.movimientos m on m.id = mi.movimiento_id
      where mi.producto_id = v_producto.id
      order by m.created_at, m.id, mi.id
    loop
      if v_item.tipo in ('entrada', 'ajuste_entrada') then
        if v_stock <= 0 then
          v_costo := coalesce(v_item.costo_unitario, v_costo);
        else
          v_costo := (v_stock * v_costo + v_item.cantidad * coalesce(v_item.costo_unitario, v_costo))
                     / (v_stock + v_item.cantidad);
        end if;
        v_stock := v_stock + v_item.cantidad;
        v_hubo  := true;
      else
        v_stock := v_stock - v_item.cantidad;
      end if;
    end loop;

    if v_hubo then
      update public.productos set precio_costo = round(v_costo, 2) where id = v_producto.id;
    end if;
  end loop;

  perform set_config('netsec.costo_automatico', 'off', true);
end;
$$;

-- ---------------------------------------------------------------------
-- registrar_movimiento: igual que en 0008, salvo el costo (ver v_costo y
-- las llamadas a _promediar_costo)
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

  -- Consecutivo sin huecos por serie (E, S, A): el bloqueo dura hasta el fin de la
  -- transacción y, si el movimiento falla, el número no se consume.
  perform pg_advisory_xact_lock(hashtext('movimientos.numero.' || public.serie_movimiento(p_tipo)));
  select coalesce(max(numero), 0) + 1 into v_numero
  from public.movimientos
  where public.serie_movimiento(tipo) = public.serie_movimiento(p_tipo);

  insert into public.movimientos (numero, tipo, bodega_id, proveedor_id, cliente_id, referencia, notas, fecha, usuario_id)
  values (
    v_numero, p_tipo, v_bodega_id, p_proveedor_id, p_cliente_id,
    nullif(btrim(p_referencia), ''), nullif(btrim(p_notas), ''),
    coalesce(p_fecha, now()), auth.uid()
  )
  returning id into v_mov_id;

  for v_item in select * from jsonb_array_elements(p_items) loop
    select id, nombre, es_serializado, activo, precio_costo into v_producto
    from public.productos
    where id = (v_item ->> 'producto_id')::uuid;

    if not found then
      raise exception 'Producto no encontrado';
    end if;
    if not v_producto.activo then
      raise exception 'El producto "%" está inactivo', v_producto.nombre;
    end if;

    -- Lo que sale del inventario (salidas y ajustes −) sale siempre al costo promedio del momento,
    -- y lo guarda para que el margen de la venta no cambie después. Lo que entra usa el costo
    -- indicado (o el promedio, si no viene) y recalcula el promedio del producto.
    v_costo  := case
      when v_es_entrada then coalesce((v_item ->> 'costo_unitario')::numeric, v_producto.precio_costo)
      else v_producto.precio_costo
    end;
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

          perform public._promediar_costo(v_producto.id, 1, v_costo);

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
          perform public._promediar_costo(v_producto.id, 1, v_costo);

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

      if v_es_entrada then
        perform public._promediar_costo(v_producto.id, v_cantidad, v_costo);
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
