-- =====================================================================
-- 0019: cotizaciones y cartera (cuentas por cobrar)
--
-- Cotizaciones (COT-000001): productos y precios que se le ofrecen a un
-- cliente (registrado o no), con una fecha de validez. No mueven
-- inventario. Mientras están abiertas se editan; se rechazan o se
-- convierten en venta: la salida queda enlazada y la cotización pasa a
-- "aceptada". Admin y bodega las crean; todos las ven (llevan precios de
-- venta, no costos).
--
-- Cartera: cada venta (salida) es de contado o a crédito. Las de crédito
-- llevan una fecha límite de pago y reciben abonos hasta quedar saldadas.
-- Lo que el cliente devuelve (ajuste + "devolución de cliente" enlazado a
-- la venta) descuenta del saldo, al precio al que se vendió. Las ventas
-- anteriores a esta migración quedan de contado; admin puede pasar una
-- venta a crédito (o de vuelta a contado si no tiene abonos).
-- Los abonos no se borran: se anulan con un motivo. Solo admin registra y
-- anula abonos; admin y lectura ven la cartera.
--
-- Las ventas se registran con registrar_venta(), que llama a
-- registrar_movimiento() y guarda la forma de pago y la cotización.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Cotizaciones
-- ---------------------------------------------------------------------
create type public.estado_cotizacion as enum ('abierta', 'aceptada', 'rechazada');

create table public.cotizaciones (
  id              uuid primary key default gen_random_uuid(),
  numero          bigint not null unique,
  -- Cliente registrado, o solo el nombre de un prospecto
  cliente_id      uuid references public.clientes (id) on delete restrict,
  cliente_nombre  text check (char_length(cliente_nombre) <= 200),
  estado          public.estado_cotizacion not null default 'abierta',
  valida_hasta    date not null,
  notas           text check (char_length(notas) <= 1000),
  usuario_id      uuid default auth.uid() references auth.users (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  cerrada_at      timestamptz,
  constraint cotizaciones_cliente check (cliente_id is not null or coalesce(btrim(cliente_nombre), '') <> '')
);

create index cotizaciones_cliente_idx on public.cotizaciones (cliente_id) where cliente_id is not null;

create trigger cotizaciones_updated_at
  before update on public.cotizaciones
  for each row execute function public.set_updated_at();

create table public.cotizacion_items (
  id               uuid primary key default gen_random_uuid(),
  cotizacion_id    uuid not null references public.cotizaciones (id) on delete cascade,
  producto_id      uuid not null references public.productos (id) on delete restrict,
  cantidad         integer not null check (cantidad > 0 and cantidad <= 100000),
  precio_unitario  numeric(14, 2) not null default 0 check (precio_unitario >= 0),
  unique (cotizacion_id, producto_id)
);

create index cotizacion_items_producto_idx on public.cotizacion_items (producto_id);

-- ---------------------------------------------------------------------
-- Ventas: forma de pago y cotización de origen
-- ---------------------------------------------------------------------
alter table public.movimientos
  add column credito       boolean not null default false,
  add column vence         date,
  add column cotizacion_id uuid references public.cotizaciones (id) on delete restrict,
  add constraint movimientos_credito check (not credito or (tipo = 'salida' and vence is not null));

create index movimientos_credito_idx on public.movimientos (fecha) where credito;

-- Una cotización se convierte en una sola venta
create unique index movimientos_cotizacion_unica on public.movimientos (cotizacion_id) where cotizacion_id is not null;

-- ---------------------------------------------------------------------
-- Abonos a ventas a crédito
-- ---------------------------------------------------------------------
create type public.metodo_pago as enum ('efectivo', 'transferencia', 'tarjeta', 'cheque', 'otro');

create table public.pagos (
  id                uuid primary key default gen_random_uuid(),
  movimiento_id     uuid not null references public.movimientos (id) on delete restrict,
  fecha             timestamptz not null default now(),
  valor             numeric(14, 2) not null check (valor > 0),
  metodo            public.metodo_pago not null,
  referencia        text check (char_length(referencia) <= 100),
  notas             text check (char_length(notas) <= 500),
  usuario_id        uuid default auth.uid() references auth.users (id) on delete set null,
  created_at        timestamptz not null default now(),
  anulado_at        timestamptz,
  anulado_por       uuid references auth.users (id) on delete set null,
  motivo_anulacion  text check (char_length(motivo_anulacion) <= 500)
);

create index pagos_movimiento_idx on public.pagos (movimiento_id);

-- ---------------------------------------------------------------------
-- Seguridad
-- ---------------------------------------------------------------------
alter table public.cotizaciones     enable row level security;
alter table public.cotizacion_items enable row level security;
alter table public.pagos            enable row level security;

create policy "usuarios: lectura" on public.cotizaciones
  for select to authenticated using ((select public.puede_ver()));
create policy "usuarios: lectura" on public.cotizacion_items
  for select to authenticated using ((select public.puede_ver()));
-- Cartera: admin y lectura (bodega no maneja cobros)
create policy "admin y lectura: lectura" on public.pagos
  for select to authenticated using ((select public.ver_costos()));

revoke insert, update, delete, truncate on public.cotizaciones     from anon, authenticated;
revoke insert, update, delete, truncate on public.cotizacion_items from anon, authenticated;
revoke insert, update, delete, truncate on public.pagos            from anon, authenticated;

-- ---------------------------------------------------------------------
-- Vistas
-- ---------------------------------------------------------------------
create view public.cotizaciones_resumen
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
  (select m.id from public.movimientos m where m.cotizacion_id = q.id) as venta_id,
  count(i.id)::integer                                             as lineas,
  coalesce(sum(i.cantidad), 0)::integer                            as unidades,
  coalesce(sum(i.cantidad * i.precio_unitario), 0)::numeric(14, 2) as total
from public.cotizaciones q
left join public.clientes c on c.id = q.cliente_id
left join public.cotizacion_items i on i.cotizacion_id = q.id
group by q.id, c.nombre;

-- Ventas a crédito con lo pagado y el saldo. Lo devuelto se valora al precio
-- promedio al que ese producto salió en la venta.
create view public.cartera
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
where m.credito and (select public.ver_costos());

-- ---------------------------------------------------------------------
-- Crear o editar una cotización. p_items: [{ producto_id, cantidad, precio_unitario }]
-- ---------------------------------------------------------------------
create or replace function public.guardar_cotizacion(
  p_items          jsonb,
  p_valida_hasta   date,
  p_id             uuid default null,
  p_cliente_id     uuid default null,
  p_cliente_nombre text default null,
  p_notas          text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id         uuid := p_id;
  v_numero     bigint;
  v_item       jsonb;
  v_cotizacion public.cotizaciones;
  v_nombre     text := case when p_cliente_id is null then nullif(btrim(p_cliente_nombre), '') end;
begin
  if not public.puede_operar() then
    raise exception 'No tienes permisos para gestionar cotizaciones' using errcode = '42501';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'La cotización debe tener al menos un producto';
  end if;
  if p_cliente_id is null and v_nombre is null then
    raise exception 'Elige el cliente o escribe su nombre';
  end if;
  if p_cliente_id is not null and not exists (select 1 from public.clientes where id = p_cliente_id and activo) then
    raise exception 'El cliente no existe o está inactivo';
  end if;
  if p_valida_hasta is null then
    raise exception 'Indica hasta cuándo es válida la cotización';
  end if;

  if v_id is null then
    if p_valida_hasta < current_date then
      raise exception 'La fecha de validez no puede estar en el pasado';
    end if;
    perform pg_advisory_xact_lock(hashtext('cotizaciones.numero'));
    select coalesce(max(numero), 0) + 1 into v_numero from public.cotizaciones;

    insert into public.cotizaciones (numero, cliente_id, cliente_nombre, valida_hasta, notas)
    values (v_numero, p_cliente_id, v_nombre, p_valida_hasta, nullif(btrim(p_notas), ''))
    returning id into v_id;
  else
    select * into v_cotizacion from public.cotizaciones where id = v_id for update;
    if not found then
      raise exception 'La cotización no existe';
    end if;
    if v_cotizacion.estado <> 'abierta' then
      raise exception 'La cotización COT-% ya está cerrada', lpad(v_cotizacion.numero::text, 6, '0');
    end if;

    update public.cotizaciones
    set cliente_id = p_cliente_id, cliente_nombre = v_nombre, valida_hasta = p_valida_hasta,
        notas = nullif(btrim(p_notas), '')
    where id = v_id;
    delete from public.cotizacion_items where cotizacion_id = v_id;
  end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    if not exists (select 1 from public.productos where id = (v_item ->> 'producto_id')::uuid and activo) then
      raise exception 'Un producto de la cotización no existe o está inactivo';
    end if;
    if exists (
      select 1 from public.cotizacion_items where cotizacion_id = v_id and producto_id = (v_item ->> 'producto_id')::uuid
    ) then
      raise exception 'Un producto está repetido en la cotización';
    end if;
    insert into public.cotizacion_items (cotizacion_id, producto_id, cantidad, precio_unitario)
    values (
      v_id,
      (v_item ->> 'producto_id')::uuid,
      (v_item ->> 'cantidad')::integer,
      coalesce((v_item ->> 'precio_unitario')::numeric, 0)
    );
  end loop;

  return v_id;
end;
$$;

-- El cliente no la aceptó (o ya no aplica)
create or replace function public.rechazar_cotizacion(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cotizacion public.cotizaciones;
begin
  if not public.puede_operar() then
    raise exception 'No tienes permisos para gestionar cotizaciones' using errcode = '42501';
  end if;
  select * into v_cotizacion from public.cotizaciones where id = p_id for update;
  if not found then
    raise exception 'La cotización no existe';
  end if;
  if v_cotizacion.estado <> 'abierta' then
    raise exception 'La cotización COT-% ya está cerrada', lpad(v_cotizacion.numero::text, 6, '0');
  end if;
  update public.cotizaciones set estado = 'rechazada', cerrada_at = now() where id = p_id;
end;
$$;

-- ---------------------------------------------------------------------
-- Registrar una venta: la salida (registrar_movimiento), su forma de pago
-- y, si viene de una cotización, la cierra como aceptada.
-- ---------------------------------------------------------------------
create or replace function public.registrar_venta(
  p_items         jsonb,
  p_cliente_id    uuid default null,
  p_referencia    text default null,
  p_notas         text default null,
  p_fecha         timestamptz default null,
  p_bodega_id     uuid default null,
  p_credito       boolean default false,
  p_vence         date default null,
  p_cotizacion_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_mov_id     uuid;
  v_cotizacion public.cotizaciones;
  v_fecha      timestamptz := coalesce(p_fecha, now());
begin
  if not public.puede_operar() then
    raise exception 'No tienes permisos para registrar movimientos' using errcode = '42501';
  end if;
  if coalesce(p_credito, false) then
    if p_cliente_id is null then
      raise exception 'Una venta a crédito requiere el cliente';
    end if;
    if p_vence is null then
      raise exception 'Indica la fecha límite de pago de la venta a crédito';
    end if;
    -- Un día de tolerancia: la fecha de la venta está en UTC y la app en hora de Colombia
    if p_vence < v_fecha::date - 1 then
      raise exception 'La fecha límite de pago no puede ser anterior a la venta';
    end if;
  end if;

  if p_cotizacion_id is not null then
    select * into v_cotizacion from public.cotizaciones where id = p_cotizacion_id for update;
    if not found then
      raise exception 'La cotización no existe';
    end if;
    if v_cotizacion.estado <> 'abierta' then
      raise exception 'La cotización COT-% ya está cerrada', lpad(v_cotizacion.numero::text, 6, '0');
    end if;
  end if;

  v_mov_id := public.registrar_movimiento(
    p_tipo       => 'salida',
    p_items      => p_items,
    p_bodega_id  => p_bodega_id,
    p_cliente_id => p_cliente_id,
    p_referencia => p_referencia,
    p_notas      => p_notas,
    p_fecha      => p_fecha
  );

  update public.movimientos
  set credito = coalesce(p_credito, false),
      vence = case when coalesce(p_credito, false) then p_vence end,
      cotizacion_id = p_cotizacion_id
  where id = v_mov_id;

  if p_cotizacion_id is not null then
    update public.cotizaciones set estado = 'aceptada', cerrada_at = now() where id = p_cotizacion_id;
  end if;

  return v_mov_id;
end;
$$;

-- ---------------------------------------------------------------------
-- Cambiar la forma de pago de una venta ya registrada (p. ej. las ventas a
-- crédito de antes de esta migración). A contado solo si no tiene abonos.
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

-- ---------------------------------------------------------------------
-- Abonos
-- ---------------------------------------------------------------------
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

create or replace function public.anular_pago(p_id uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pago public.pagos;
begin
  if not public.es_admin() then
    raise exception 'Solo un administrador puede anular abonos' using errcode = '42501';
  end if;
  if coalesce(btrim(p_motivo), '') = '' then
    raise exception 'Escribe el motivo de la anulación';
  end if;
  select * into v_pago from public.pagos where id = p_id for update;
  if not found then
    raise exception 'El abono no existe';
  end if;
  if v_pago.anulado_at is not null then
    raise exception 'El abono ya está anulado';
  end if;
  update public.pagos
  set anulado_at = now(), anulado_por = auth.uid(), motivo_anulacion = btrim(p_motivo)
  where id = p_id;
end;
$$;

revoke execute on function
  public.guardar_cotizacion, public.rechazar_cotizacion, public.registrar_venta,
  public.cambiar_forma_pago, public.registrar_pago, public.anular_pago
  from public, anon;
grant execute on function
  public.guardar_cotizacion, public.rechazar_cotizacion, public.registrar_venta,
  public.cambiar_forma_pago, public.registrar_pago, public.anular_pago
  to authenticated;
