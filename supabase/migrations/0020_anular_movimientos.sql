-- =====================================================================
-- 0020: anular movimientos, con clave de anulación
--
-- Una entrada o una venta (salida) registrada por error se puede anular.
-- Los movimientos siguen sin editarse ni borrarse: anular registra el
-- movimiento contrario (un ajuste enlazado con anula_id) y marca el
-- original como anulado, con quién, cuándo y por qué. El stock, los
-- seriales y el costo promedio vuelven a como estaban.
--
-- - Venta: la mercancía vuelve a la bodega al costo con el que salió y los
--   seriales quedan disponibles. No se puede si tiene devoluciones o
--   abonos vigentes, ni si un serial se movió después. Si venía de una
--   cotización, la cotización vuelve a quedar abierta.
-- - Entrada: sale lo que entró, a su mismo costo, y el promedio se
--   recalcula sin ella. No se puede si ya salió parte de esa mercancía.
--   Los seriales quedan de baja y se renombran (SERIAL-ANULADO-xxxx) para
--   poder registrarlos de nuevo. Si recibía una orden de compra, lo
--   recibido deja de contar y la orden vuelve a quedar abierta.
-- - Los ajustes no se anulan: se corrigen con el ajuste contrario.
--
-- Solo admin anula, y además debe dar la clave de anulación, que se define
-- en Configuración y se guarda cifrada (bcrypt). Nadie puede leerla. Tras 5
-- intentos fallidos en 15 minutos, el usuario queda bloqueado 15 minutos.
-- Si se olvida la clave, se borra desde el SQL Editor de Supabase:
--   update public.seguridad set clave_anulacion = null;
-- y se define una nueva en Configuración.
--
-- Los reportes, el dashboard y la cartera ignoran los movimientos anulados
-- y sus contrarios; el historial de movimientos los muestra marcados.
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------
-- Clave de anulación e intentos fallidos
-- ---------------------------------------------------------------------
create table public.seguridad (
  id               smallint primary key default 1 check (id = 1),
  clave_anulacion  text,
  actualizada_at   timestamptz,
  actualizada_por  uuid references auth.users (id) on delete set null
);

insert into public.seguridad (id) values (1);

create table public.intentos_clave (
  id          bigint generated always as identity primary key,
  usuario_id  uuid,
  fecha       timestamptz not null default now()
);

create index intentos_clave_usuario_idx on public.intentos_clave (usuario_id, fecha desc);

-- Sin políticas: ningún rol de la app puede leerlas ni escribirlas (solo las funciones)
alter table public.seguridad      enable row level security;
alter table public.intentos_clave enable row level security;
revoke all on public.seguridad      from anon, authenticated;
revoke all on public.intentos_clave from anon, authenticated;

-- ---------------------------------------------------------------------
-- Movimientos: anulación
-- ---------------------------------------------------------------------
alter table public.movimientos
  add column anulado_at        timestamptz,
  add column anulado_por       uuid references auth.users (id) on delete set null,
  add column motivo_anulacion  text check (char_length(motivo_anulacion) <= 500),
  -- En el movimiento contrario: el movimiento que anula
  add column anula_id          uuid unique references public.movimientos (id) on delete restrict;

-- Una cotización se convierte en una sola venta vigente (si se anula, puede venderse de nuevo)
drop index public.movimientos_cotizacion_unica;
create unique index movimientos_cotizacion_unica on public.movimientos (cotizacion_id)
  where cotizacion_id is not null and anulado_at is null;

-- Nada nuevo se enlaza a un movimiento anulado (p. ej. una devolución de una venta anulada)
create or replace function public._no_enlazar_anulados()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.movimiento_origen_id is not null
     and exists (select 1 from public.movimientos where id = new.movimiento_origen_id and anulado_at is not null) then
    raise exception 'La venta está anulada';
  end if;
  return new;
end;
$$;

create trigger movimientos_no_enlazar_anulados
  before insert on public.movimientos
  for each row execute function public._no_enlazar_anulados();

-- ---------------------------------------------------------------------
-- Vistas: el historial agrega la anulación (al final); lo anulado deja de
-- contar en las órdenes de compra, las cotizaciones y la cartera
-- ---------------------------------------------------------------------
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
  m.movimiento_origen_id,
  m.anulado_at,
  m.anula_id
from public.movimientos m
left join public.proveedores p on p.id = m.proveedor_id
left join public.clientes c on c.id = m.cliente_id
left join public.movimiento_items mi on mi.movimiento_id = m.id
group by m.id, p.nombre, c.nombre;

create or replace view public.orden_compra_items_estado
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
    where m.orden_compra_id = oci.orden_id and mi.producto_id = oci.producto_id and m.anulado_at is null
  ), 0)::integer as recibido
from public.orden_compra_items oci;

create or replace view public.cotizaciones_resumen
with (security_invoker = true) as
select
  q.id,
  q.numero,
  q.cliente_id,
  coalesce(c.nombre, q.cliente_nombre) as cliente_nombre,
  q.estado,
  q.valida_hasta,
  (q.estado = 'abierta' and q.valida_hasta < current_date) as vencida,
  q.notas,
  q.usuario_id,
  q.created_at,
  q.cerrada_at,
  (select m.id from public.movimientos m where m.cotizacion_id = q.id and m.anulado_at is null) as venta_id,
  count(i.id)::integer                                             as lineas,
  coalesce(sum(i.cantidad), 0)::integer                            as unidades,
  coalesce(sum(i.cantidad * i.precio_unitario), 0)::numeric(14, 2) as total
from public.cotizaciones q
left join public.clientes c on c.id = q.cliente_id
left join public.cotizacion_items i on i.cotizacion_id = q.id
group by q.id, c.nombre;

create or replace view public.cartera
with (security_invoker = true) as
select
  m.id,
  m.numero,
  m.fecha,
  m.vence,
  m.cliente_id,
  c.nombre as cliente_nombre,
  m.referencia,
  t.total,
  d.devuelto,
  p.pagado,
  (t.total - d.devuelto - p.pagado)::numeric(14, 2) as saldo,
  greatest(current_date - m.vence, 0)                as dias_vencida
from public.movimientos m
left join public.clientes c on c.id = m.cliente_id
cross join lateral (
  select coalesce(sum(mi.cantidad * coalesce(mi.precio_unitario, 0)), 0)::numeric(14, 2) as total
  from public.movimiento_items mi
  where mi.movimiento_id = m.id
) t
cross join lateral (
  select coalesce(sum(di.cantidad * coalesce((
    select sum(vi.cantidad * coalesce(vi.precio_unitario, 0)) / nullif(sum(vi.cantidad), 0)
    from public.movimiento_items vi
    where vi.movimiento_id = m.id and vi.producto_id = di.producto_id
  ), 0)), 0)::numeric(14, 2) as devuelto
  from public.movimientos dm
  join public.movimiento_items di on di.movimiento_id = dm.id
  where dm.movimiento_origen_id = m.id
) d
cross join lateral (
  select coalesce(sum(pg.valor), 0)::numeric(14, 2) as pagado
  from public.pagos pg
  where pg.movimiento_id = m.id and pg.anulado_at is null
) p
where m.credito and m.anulado_at is null and (select public.ver_costos());

-- ---------------------------------------------------------------------
-- Clave: estado, definir y verificar
-- ---------------------------------------------------------------------
create or replace function public.hay_clave_anulacion()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.es_admin() and exists (select 1 from public.seguridad where clave_anulacion is not null);
$$;

-- 'ok', 'sin_clave', 'bloqueada' o 'incorrecta'. Registra los intentos fallidos; quien la llama no
-- debe lanzar una excepción después de un fallo (se perdería el registro del intento).
create or replace function public._verificar_clave_anulacion(p_clave text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hash     text;
  v_fallidos integer;
begin
  select clave_anulacion into v_hash from public.seguridad where id = 1;
  if v_hash is null then
    return 'sin_clave';
  end if;

  select count(*) into v_fallidos
  from public.intentos_clave
  where usuario_id = auth.uid() and fecha > now() - interval '15 minutes';
  if v_fallidos >= 5 then
    return 'bloqueada';
  end if;

  if coalesce(p_clave, '') <> '' and extensions.crypt(p_clave, v_hash) = v_hash then
    delete from public.intentos_clave where usuario_id = auth.uid();
    return 'ok';
  end if;

  insert into public.intentos_clave (usuario_id) values (auth.uid());
  return 'incorrecta';
end;
$$;

revoke execute on function public._verificar_clave_anulacion from public, anon, authenticated;

create or replace function public._mensaje_clave(p_resultado text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_resultado
    when 'sin_clave' then 'Primero define la clave de anulación en Configuración → Seguridad'
    when 'bloqueada' then 'Demasiados intentos fallidos: espera 15 minutos e inténtalo de nuevo'
    when 'incorrecta' then 'La clave de anulación no es correcta'
  end;
$$;

-- Definir la clave (la primera vez) o cambiarla (con la actual). Devuelve { ok, error }.
create or replace function public.definir_clave_anulacion(p_nueva text, p_actual text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_resultado text;
begin
  if not public.es_admin() then
    raise exception 'Solo un administrador puede definir la clave de anulación' using errcode = '42501';
  end if;
  if char_length(coalesce(p_nueva, '')) < 4 or char_length(p_nueva) > 32 then
    raise exception 'La clave debe tener entre 4 y 32 caracteres';
  end if;

  if exists (select 1 from public.seguridad where clave_anulacion is not null) then
    v_resultado := public._verificar_clave_anulacion(p_actual);
    if v_resultado <> 'ok' then
      return jsonb_build_object('ok', false, 'error', public._mensaje_clave(v_resultado));
    end if;
  end if;

  update public.seguridad
  set clave_anulacion = extensions.crypt(p_nueva, extensions.gen_salt('bf', 10)),
      actualizada_at = now(),
      actualizada_por = auth.uid()
  where id = 1;
  return jsonb_build_object('ok', true);
end;
$$;

-- ---------------------------------------------------------------------
-- Costo promedio al sacar lo que había entrado: el inverso de
-- _promediar_costo. Se llama ANTES de insertar la línea de salida.
-- ---------------------------------------------------------------------
create or replace function public._despromediar_costo(p_producto_id uuid, p_cantidad integer, p_costo numeric)
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

  -- Si no queda nada, el promedio se conserva (la próxima entrada lo reemplaza)
  if v_stock - p_cantidad > 0 then
    perform set_config('netsec.costo_automatico', 'on', true);
    update public.productos
    set precio_costo = greatest(round((v_stock * precio_costo - p_cantidad * p_costo) / (v_stock - p_cantidad), 2), 0)
    where id = p_producto_id;
    perform set_config('netsec.costo_automatico', 'off', true);
  end if;
end;
$$;

revoke execute on function public._despromediar_costo from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Anular una entrada o una venta. Devuelve { ok, anulacion_id } o { ok: false, error }
-- (la clave incorrecta no lanza excepción, para que quede registrado el intento).
-- ---------------------------------------------------------------------
create or replace function public.anular_movimiento(p_id uuid, p_motivo text, p_clave text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_mov       public.movimientos;
  v_resultado text;
  v_tipo      public.tipo_movimiento;
  v_numero    bigint;
  v_nuevo_id  uuid;
  v_linea     record;
  v_stock     integer;
  v_nombre    text;
  v_etiqueta  text;
begin
  if not public.es_admin() then
    raise exception 'Solo un administrador puede anular movimientos' using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(p_motivo, ''))) < 5 then
    raise exception 'Explica el motivo de la anulación';
  end if;

  v_resultado := public._verificar_clave_anulacion(p_clave);
  if v_resultado <> 'ok' then
    return jsonb_build_object('ok', false, 'error', public._mensaje_clave(v_resultado));
  end if;

  select * into v_mov from public.movimientos where id = p_id for update;
  if not found then
    raise exception 'El movimiento no existe';
  end if;
  v_etiqueta := 'Net' || public.serie_movimiento(v_mov.tipo) || '-' || lpad(v_mov.numero::text, 6, '0');
  if v_mov.anulado_at is not null then
    raise exception 'El movimiento % ya está anulado', v_etiqueta;
  end if;
  if v_mov.anula_id is not null then
    raise exception 'El movimiento % es una anulación: no se puede anular', v_etiqueta;
  end if;
  if v_mov.tipo not in ('entrada', 'salida') then
    raise exception 'Los ajustes no se anulan: corrígelos con un ajuste contrario';
  end if;

  -- Bloquea los productos implicados, igual que registrar_movimiento
  perform 1
  from public.productos
  where id in (select producto_id from public.movimiento_items where movimiento_id = p_id)
  order by id
  for update;

  if v_mov.tipo = 'salida' then
    if exists (select 1 from public.movimientos where movimiento_origen_id = p_id) then
      raise exception 'La venta % tiene devoluciones: no se puede anular', v_etiqueta;
    end if;
    if exists (select 1 from public.pagos where movimiento_id = p_id and anulado_at is null) then
      raise exception 'La venta % tiene abonos: anúlalos primero', v_etiqueta;
    end if;
    -- Cada serial debe seguir vendido y sin movimientos posteriores
    select u.numero_serie into v_nombre
    from public.movimiento_items mi
    join public.unidades u on u.id = mi.unidad_id
    where mi.movimiento_id = p_id
      and (u.estado <> 'vendida' or exists (
        select 1 from public.movimiento_items x
        join public.movimientos xm on xm.id = x.movimiento_id
        where x.unidad_id = u.id and xm.created_at > v_mov.created_at
      ))
    limit 1;
    if found then
      raise exception 'El serial % se movió después de la venta: no se puede anular', v_nombre;
    end if;
    v_tipo := 'ajuste_entrada';
  else
    -- Entrada: todo lo que entró debe seguir en la bodega
    select p.nombre into v_nombre
    from (
      select producto_id, sum(cantidad) as cantidad
      from public.movimiento_items
      where movimiento_id = p_id and unidad_id is null
      group by producto_id
    ) l
    join public.productos p on p.id = l.producto_id
    where coalesce((
      select sum(s.cantidad) from public.stock_actual s where s.producto_id = l.producto_id and s.bodega_id = v_mov.bodega_id
    ), 0) < l.cantidad
    limit 1;
    if found then
      raise exception 'Ya salió parte de "%" de esa entrada: no se puede anular', v_nombre;
    end if;

    select u.numero_serie into v_nombre
    from public.movimiento_items mi
    join public.unidades u on u.id = mi.unidad_id
    where mi.movimiento_id = p_id
      and (u.estado <> 'disponible' or u.bodega_id <> v_mov.bodega_id or exists (
        select 1 from public.movimiento_items x where x.unidad_id = u.id and x.movimiento_id <> p_id
      ))
    limit 1;
    if found then
      raise exception 'El serial % ya se movió: no se puede anular la entrada', v_nombre;
    end if;
    v_tipo := 'ajuste_salida';
  end if;

  -- El movimiento contrario, con su consecutivo en la serie de ajustes
  perform pg_advisory_xact_lock(hashtext('movimientos.numero.' || public.serie_movimiento(v_tipo)));
  select coalesce(max(numero), 0) + 1 into v_numero
  from public.movimientos
  where public.serie_movimiento(tipo) = public.serie_movimiento(v_tipo);

  insert into public.movimientos (numero, tipo, bodega_id, referencia, notas, fecha, usuario_id, motivo, anula_id)
  values (
    v_numero, v_tipo, v_mov.bodega_id, v_mov.referencia,
    'Anulación de ' || v_etiqueta || ': ' || btrim(p_motivo),
    now(), auth.uid(), 'otro', p_id
  )
  returning id into v_nuevo_id;

  for v_linea in
    select mi.producto_id, mi.unidad_id, mi.cantidad, coalesce(mi.costo_unitario, p.precio_costo) as costo
    from public.movimiento_items mi
    join public.productos p on p.id = mi.producto_id
    where mi.movimiento_id = p_id
    order by mi.id
  loop
    -- El costo promedio se ajusta antes de insertar la línea (con el stock previo)
    if v_tipo = 'ajuste_entrada' then
      perform public._promediar_costo(v_linea.producto_id, v_linea.cantidad, v_linea.costo);
    else
      perform public._despromediar_costo(v_linea.producto_id, v_linea.cantidad, v_linea.costo);
    end if;

    if v_linea.unidad_id is not null then
      if v_tipo = 'ajuste_entrada' then
        update public.unidades set estado = 'disponible', bodega_id = v_mov.bodega_id where id = v_linea.unidad_id;
      else
        -- De baja y con el serial renombrado, para poder registrar de nuevo el serial correcto
        update public.unidades
        set estado = 'baja', numero_serie = numero_serie || '-ANULADO-' || left(v_nuevo_id::text, 4)
        where id = v_linea.unidad_id;
      end if;
    end if;

    insert into public.movimiento_items (movimiento_id, producto_id, unidad_id, cantidad, costo_unitario)
    values (v_nuevo_id, v_linea.producto_id, v_linea.unidad_id, v_linea.cantidad, v_linea.costo);
  end loop;

  if v_tipo = 'ajuste_salida' then
    -- Comprobación final: la entrada anulada no deja stock negativo
    select p.nombre, s.cantidad into v_nombre, v_stock
    from public.stock_actual s
    join public.productos p on p.id = s.producto_id
    where s.bodega_id = v_mov.bodega_id
      and s.producto_id in (select producto_id from public.movimiento_items where movimiento_id = p_id)
      and s.cantidad < 0
    limit 1;
    if found then
      raise exception 'Anular la entrada dejaría el stock de "%" en %', v_nombre, v_stock;
    end if;
  end if;

  update public.movimientos
  set anulado_at = now(), anulado_por = auth.uid(), motivo_anulacion = btrim(p_motivo)
  where id = p_id;

  -- La orden de compra vuelve a esperar lo que ya no cuenta como recibido
  if v_mov.orden_compra_id is not null then
    update public.ordenes_compra
    set estado = 'abierta', cerrada_at = null
    where id = v_mov.orden_compra_id and estado = 'recibida';
  end if;
  -- La cotización se puede volver a vender
  if v_mov.cotizacion_id is not null then
    update public.cotizaciones
    set estado = 'abierta', cerrada_at = null
    where id = v_mov.cotizacion_id and estado = 'aceptada';
  end if;

  return jsonb_build_object('ok', true, 'anulacion_id', v_nuevo_id);
end;
$$;

-- ---------------------------------------------------------------------
-- Cartera: una venta anulada no recibe abonos ni cambia de forma de pago
-- (iguales a 0019, con esa validación)
-- ---------------------------------------------------------------------
create or replace function public.cambiar_forma_pago(
  p_movimiento_id uuid,
  p_credito       boolean,
  p_vence         date default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_mov public.movimientos;
begin
  if not public.es_admin() then
    raise exception 'Solo un administrador puede cambiar la forma de pago' using errcode = '42501';
  end if;
  select * into v_mov from public.movimientos where id = p_movimiento_id for update;
  if not found or v_mov.tipo <> 'salida' then
    raise exception 'La venta no existe';
  end if;
  if v_mov.anulado_at is not null then
    raise exception 'La venta está anulada';
  end if;
  if p_credito then
    if v_mov.cliente_id is null then
      raise exception 'Una venta a consumidor final no puede quedar a crédito';
    end if;
    if p_vence is null then
      raise exception 'Indica la fecha límite de pago';
    end if;
    if p_vence < v_mov.fecha::date - 1 then
      raise exception 'La fecha límite de pago no puede ser anterior a la venta';
    end if;
  elsif exists (select 1 from public.pagos where movimiento_id = p_movimiento_id and anulado_at is null) then
    raise exception 'La venta tiene abonos: anúlalos antes de pasarla a contado';
  end if;

  update public.movimientos
  set credito = p_credito, vence = case when p_credito then p_vence end
  where id = p_movimiento_id;
end;
$$;

create or replace function public.registrar_pago(
  p_movimiento_id uuid,
  p_valor         numeric,
  p_metodo        public.metodo_pago,
  p_fecha         timestamptz default null,
  p_referencia    text default null,
  p_notas         text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_mov   public.movimientos;
  v_saldo numeric;
  v_id    uuid;
begin
  if not public.es_admin() then
    raise exception 'Solo un administrador puede registrar abonos' using errcode = '42501';
  end if;
  -- El bloqueo evita que dos abonos simultáneos superen el saldo
  select * into v_mov from public.movimientos where id = p_movimiento_id for update;
  if not found or v_mov.tipo <> 'salida' then
    raise exception 'La venta no existe';
  end if;
  if v_mov.anulado_at is not null then
    raise exception 'La venta está anulada';
  end if;
  if not v_mov.credito then
    raise exception 'La venta es de contado: no recibe abonos';
  end if;
  if p_valor is null or p_valor <= 0 then
    raise exception 'El valor del abono debe ser mayor que cero';
  end if;
  if p_fecha is not null and p_fecha > now() + interval '5 minutes' then
    raise exception 'La fecha del abono no puede ser futura';
  end if;
  if coalesce(p_fecha, now()) < v_mov.fecha - interval '1 day' then
    raise exception 'La fecha del abono no puede ser anterior a la venta';
  end if;

  select saldo into v_saldo from public.cartera where id = p_movimiento_id;
  if round(p_valor, 2) > coalesce(v_saldo, 0) then
    raise exception 'El abono supera el saldo de la venta (%)', to_char(coalesce(v_saldo, 0), 'FM999G999G999G990D00');
  end if;

  insert into public.pagos (movimiento_id, fecha, valor, metodo, referencia, notas)
  values (
    p_movimiento_id, coalesce(p_fecha, now()), round(p_valor, 2), p_metodo,
    nullif(btrim(p_referencia), ''), nullif(btrim(p_notas), '')
  )
  returning id into v_id;
  return v_id;
end;
$$;

revoke execute on function public.hay_clave_anulacion, public.definir_clave_anulacion, public.anular_movimiento
  from public, anon;
grant execute on function public.hay_clave_anulacion, public.definir_clave_anulacion, public.anular_movimiento
  to authenticated;
