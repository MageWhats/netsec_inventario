-- =====================================================================
-- 0013: usuarios y roles
--
-- Hasta ahora solo el rol admin podía usar la app. Ahora:
--   admin    todo
--   bodega   ve el inventario; registra entradas y salidas; cuenta en las
--            tomas de inventario (finalizarlas genera ajustes: solo admin)
--   lectura  ve todo, no modifica nada
-- Los ajustes, productos, clientes, proveedores y la configuración siguen
-- siendo solo de admin.
--
-- Los usuarios se invitan por correo desde la app (Edge Function
-- "usuarios"). Un usuario desactivado pierde el acceso de inmediato.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Perfiles: correo (para listarlos) y estado
-- ---------------------------------------------------------------------
alter table public.perfiles
  add column email  text,
  add column activo boolean not null default true;

update public.perfiles p set email = u.email from auth.users u where u.id = p.id;

create or replace function public.crear_perfil_usuario()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.perfiles (id, nombre, email)
  values (new.id, coalesce(nullif(btrim(new.raw_user_meta_data ->> 'nombre'), ''), new.email), new.email);
  return new;
end;
$$;

-- Desde la app solo se editan nombre, rol y estado (el correo lo pone Auth)
revoke update on public.perfiles from authenticated;
grant update (nombre, rol, activo) on public.perfiles to authenticated;

-- ---------------------------------------------------------------------
-- Rol del usuario actual (null si no tiene perfil o está desactivado)
-- ---------------------------------------------------------------------
create or replace function public.rol_actual()
returns public.rol_usuario
language sql
stable
security definer
set search_path = ''
as $$
  select rol from public.perfiles where id = (select auth.uid()) and activo;
$$;

create or replace function public.es_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.rol_actual() = 'admin', false);
$$;

-- admin o bodega: registran entradas, salidas y conteos
create or replace function public.puede_operar()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.rol_actual() in ('admin', 'bodega'), false);
$$;

-- Cualquier usuario activo
create or replace function public.puede_ver()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.rol_actual() is not null;
$$;

revoke execute on function public.rol_actual, public.puede_operar, public.puede_ver from public, anon;
grant execute on function public.rol_actual, public.puede_operar, public.puede_ver to authenticated;

-- ---------------------------------------------------------------------
-- Lectura para todos los usuarios activos. Las políticas "admin: acceso
-- total" se mantienen: solo admin crea, edita y elimina.
-- ---------------------------------------------------------------------
create policy "usuarios: lectura" on public.bodegas     for select to authenticated using ((select public.puede_ver()));
create policy "usuarios: lectura" on public.categorias  for select to authenticated using ((select public.puede_ver()));
create policy "usuarios: lectura" on public.proveedores for select to authenticated using ((select public.puede_ver()));
create policy "usuarios: lectura" on public.clientes    for select to authenticated using ((select public.puede_ver()));
create policy "usuarios: lectura" on public.productos   for select to authenticated using ((select public.puede_ver()));
create policy "usuarios: lectura" on public.familias    for select to authenticated using ((select public.puede_ver()));
create policy "usuarios: lectura" on public.unidades    for select to authenticated using ((select public.puede_ver()));

drop policy "admin: lectura" on public.movimientos;
drop policy "admin: lectura" on public.movimiento_items;
drop policy "admin: lectura" on public.tomas_inventario;
drop policy "admin: lectura" on public.toma_productos;
drop policy "admin: lectura" on public.toma_seriales;

create policy "usuarios: lectura" on public.movimientos      for select to authenticated using ((select public.puede_ver()));
create policy "usuarios: lectura" on public.movimiento_items for select to authenticated using ((select public.puede_ver()));
create policy "usuarios: lectura" on public.tomas_inventario for select to authenticated using ((select public.puede_ver()));
create policy "usuarios: lectura" on public.toma_productos   for select to authenticated using ((select public.puede_ver()));
create policy "usuarios: lectura" on public.toma_seriales    for select to authenticated using ((select public.puede_ver()));

-- Historial de cambios: admin y lectura (bodega no ve reportes)
drop policy "admin: lectura" on public.auditoria;
create policy "admin y lectura: lectura" on public.auditoria
  for select to authenticated using ((select public.rol_actual()) in ('admin', 'lectura'));

-- Perfiles: todos ven los nombres (quién registró cada movimiento)
drop policy "perfiles: ver propio o admin" on public.perfiles;
create policy "perfiles: ver propio o usuarios" on public.perfiles
  for select to authenticated using (id = (select auth.uid()) or (select public.puede_ver()));

-- ---------------------------------------------------------------------
-- Protecciones de perfiles
-- ---------------------------------------------------------------------
create or replace function public.proteger_perfiles()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.id = (select auth.uid())
     and (new.rol is distinct from old.rol or new.activo is distinct from old.activo) then
    raise exception 'No puedes cambiar tu propio rol ni desactivar tu propia cuenta';
  end if;

  if old.rol = 'admin' and old.activo
     and (tg_op = 'DELETE' or new.rol <> 'admin' or not new.activo)
     and not exists (select 1 from public.perfiles where rol = 'admin' and activo and id <> old.id) then
    raise exception 'Debe quedar al menos un administrador activo';
  end if;

  return coalesce(new, old);
end;
$$;

create trigger perfiles_proteger
  before update of rol, activo or delete on public.perfiles
  for each row execute function public.proteger_perfiles();

-- ---------------------------------------------------------------------
-- Lista de usuarios para la pantalla de Configuración (solo admin).
-- pendiente = aún no ha creado su contraseña desde la invitación.
-- ---------------------------------------------------------------------
create or replace function public.usuarios_admin()
returns table (
  id             uuid,
  nombre         text,
  email          text,
  rol            public.rol_usuario,
  activo         boolean,
  pendiente      boolean,
  ultimo_ingreso timestamptz,
  created_at     timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.es_admin() then
    raise exception 'No tienes permisos para ver los usuarios' using errcode = '42501';
  end if;

  return query
  select p.id, p.nombre, coalesce(p.email, u.email)::text, p.rol, p.activo,
         coalesce(u.encrypted_password, '') = '', u.last_sign_in_at, p.created_at
  from public.perfiles p
  join auth.users u on u.id = p.id
  order by p.activo desc, p.nombre;
end;
$$;

revoke execute on function public.usuarios_admin from public, anon;
grant execute on function public.usuarios_admin to authenticated;

-- ---------------------------------------------------------------------
-- Tomas de inventario: bodega cuenta; finalizar o cancelar es de admin
-- (finalizar genera ajustes). _toma_en_curso la usan los conteos.
-- ---------------------------------------------------------------------
create or replace function public._toma_en_curso(p_toma_id uuid)
returns public.tomas_inventario
language plpgsql
set search_path = ''
as $$
declare
  v_toma public.tomas_inventario;
begin
  if not public.puede_operar() then
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

create or replace function public.cancelar_toma(p_toma_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.es_admin() then
    raise exception 'Solo un administrador puede cancelar una toma de inventario' using errcode = '42501';
  end if;
  perform public._toma_en_curso(p_toma_id);
  update public.tomas_inventario set estado = 'cancelada', cerrada_at = now() where id = p_toma_id;
end;
$$;

-- ---------------------------------------------------------------------
-- iniciar_toma: igual que en 0003, abierta también a bodega
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
  if not public.puede_operar() then
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
-- finalizar_toma: igual que en 0010, solo admin
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
  if not public.es_admin() then
    raise exception 'Solo un administrador puede finalizar una toma de inventario' using errcode = '42501';
  end if;
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
      p_notas     => 'Sobrantes de la toma de inventario #' || v_toma.numero,
      p_motivo    => 'sobrante_conteo'
    );
  end if;

  if jsonb_array_length(v_salidas) > 0 then
    v_salida_id := public.registrar_movimiento(
      p_tipo      => 'ajuste_salida',
      p_items     => v_salidas,
      p_bodega_id => v_toma.bodega_id,
      p_referencia => 'Toma #' || v_toma.numero,
      p_notas     => 'Faltantes de la toma de inventario #' || v_toma.numero,
      p_motivo    => 'faltante_conteo'
    );
  end if;

  update public.tomas_inventario
  set estado = 'finalizada', cerrada_at = now(), ajuste_entrada_id = v_entrada_id, ajuste_salida_id = v_salida_id
  where id = p_toma_id;

  return jsonb_build_object('ajuste_entrada_id', v_entrada_id, 'ajuste_salida_id', v_salida_id);
end;
$$;

-- ---------------------------------------------------------------------
-- registrar_movimiento: igual que en 0010, salvo los permisos
-- ---------------------------------------------------------------------
create or replace function public.registrar_movimiento(
  p_tipo         public.tipo_movimiento,
  p_items        jsonb,
  p_bodega_id    uuid default null,
  p_proveedor_id uuid default null,
  p_cliente_id   uuid default null,
  p_referencia   text default null,
  p_notas        text default null,
  p_fecha        timestamptz default null,
  p_motivo       public.motivo_ajuste default null,
  p_movimiento_origen_id uuid default null
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
  v_referencia     text := nullif(btrim(p_referencia), '');
  v_origen         record;
  v_devolucion     boolean := p_motivo = 'devolucion_cliente';
  v_vendido        integer;
  v_devuelto       integer;
begin
  -- Entradas y salidas: admin y bodega. Ajustes (y devoluciones): solo admin
  if p_tipo in ('entrada', 'salida') then
    if not public.puede_operar() then
      raise exception 'No tienes permisos para registrar movimientos' using errcode = '42501';
    end if;
  elsif not public.es_admin() then
    raise exception 'Solo un administrador puede registrar ajustes' using errcode = '42501';
  end if;

  -- Validaciones de cabecera
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'El movimiento debe tener al menos un producto';
  end if;
  if p_fecha is not null and p_fecha > now() + interval '5 minutes' then
    raise exception 'La fecha del movimiento no puede ser futura';
  end if;
  -- Motivo: obligatorio en los ajustes, solo en ellos y en la dirección que le corresponde
  if p_tipo in ('ajuste_entrada', 'ajuste_salida') and p_motivo is null then
    raise exception 'Los ajustes requieren indicar el motivo';
  end if;
  if p_motivo is not null and p_tipo not in ('ajuste_entrada', 'ajuste_salida') then
    raise exception 'Solo los ajustes llevan motivo';
  end if;
  if public.motivo_es_entrada(p_motivo) is not null
     and public.motivo_es_entrada(p_motivo) <> (p_tipo = 'ajuste_entrada') then
    raise exception 'El motivo no corresponde a un ajuste %', case when p_tipo = 'ajuste_entrada' then '+' else '−' end;
  end if;
  if p_motivo = 'otro' and coalesce(btrim(p_notas), '') = '' then
    raise exception 'Describe el motivo del ajuste en las notas';
  end if;

  -- Devolución de cliente: siempre desde la venta original, que aporta su factura electrónica
  if p_movimiento_origen_id is not null and not v_devolucion then
    raise exception 'Solo las devoluciones de cliente se enlazan con una venta';
  end if;
  if v_devolucion then
    if p_movimiento_origen_id is null then
      raise exception 'Una devolución de cliente requiere la venta (salida) de origen';
    end if;
    select id, tipo, referencia into v_origen from public.movimientos where id = p_movimiento_origen_id;
    if not found or v_origen.tipo <> 'salida' then
      raise exception 'La venta de origen no existe';
    end if;
    v_referencia := coalesce(v_referencia, v_origen.referencia);
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

  insert into public.movimientos (
    numero, tipo, bodega_id, proveedor_id, cliente_id, referencia, notas, fecha, usuario_id, motivo, movimiento_origen_id
  )
  values (
    v_numero, p_tipo, v_bodega_id, p_proveedor_id, p_cliente_id,
    v_referencia, nullif(btrim(p_notas), ''),
    coalesce(p_fecha, now()), auth.uid(), p_motivo, p_movimiento_origen_id
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
    -- Una devolución solo reingresa lo que salió en esa venta, y vuelve al costo con el que salió
    if v_devolucion then
      if not exists (
        select 1 from public.movimiento_items where movimiento_id = p_movimiento_origen_id and producto_id = v_producto.id
      ) then
        raise exception '"%" no hace parte de esa venta', v_producto.nombre;
      end if;
      select sum(cantidad * costo_unitario) / nullif(sum(cantidad), 0) into v_costo
      from public.movimiento_items
      where movimiento_id = p_movimiento_origen_id and producto_id = v_producto.id;
      v_costo := coalesce(v_costo, v_producto.precio_costo);
    end if;

    v_precio := (v_item ->> 'precio_unitario')::numeric;
    if coalesce(v_costo, 0) < 0 or coalesce(v_precio, 0) < 0 then
      raise exception 'Los valores de "%" no pueden ser negativos', v_producto.nombre;
    end if;

    if v_producto.es_serializado then
      if v_es_entrada then
        if v_devolucion and jsonb_array_length(coalesce(v_item -> 'series', '[]'::jsonb)) > 0 then
          raise exception 'En una devolución se reingresan las unidades vendidas, no seriales nuevos';
        end if;

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
          if v_devolucion and not exists (
            select 1 from public.movimiento_items
            where movimiento_id = p_movimiento_origen_id and unidad_id = v_unidad_id
          ) then
            raise exception 'La unidad % no salió en esa venta', v_unidad.numero_serie;
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

      if v_devolucion then
        -- Incluye lo devuelto antes y las líneas ya insertadas en esta misma devolución
        select coalesce(sum(cantidad), 0) into v_vendido
        from public.movimiento_items
        where movimiento_id = p_movimiento_origen_id and producto_id = v_producto.id;

        select coalesce(sum(mi.cantidad), 0) into v_devuelto
        from public.movimiento_items mi
        join public.movimientos m on m.id = mi.movimiento_id
        where m.movimiento_origen_id = p_movimiento_origen_id and mi.producto_id = v_producto.id;

        if v_devuelto + v_cantidad > v_vendido then
          raise exception 'En esa venta salieron % de "%" y ya se devolvieron %: no se pueden devolver % más',
            v_vendido, v_producto.nombre, v_devuelto, v_cantidad;
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
