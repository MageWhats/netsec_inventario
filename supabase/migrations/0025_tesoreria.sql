-- =====================================================================
-- 0025: contabilidad, fase 4 (tesorería)
--
-- - Cuentas de tesorería: cada caja y cada cuenta bancaria, enlazada con
--   su cuenta del PUC. Al crear un banco sin indicar la cuenta, se crea su
--   auxiliar bajo 111005 (11100501, 11100502...); una caja, bajo 1105.
-- - Abonos: se elige a qué caja o banco entra el dinero.
-- - Comprobantes de egreso (CE): pago a un proveedor (D 2205) o cualquier
--   otro pago (gastos, comisiones bancarias, impuestos...) contra la cuenta
--   que se elija / C la caja o el banco.
-- - Traslados (TR) entre cajas y bancos: D destino / C origen.
-- - Anticipos de clientes (RA): D caja o banco / C 2805 cliente. Se
--   aplican después a una venta a crédito como un abono: D 2805 / C 130505.
-- - Edades: lo pendiente de cada tercero en una cuenta (clientes 130505,
--   proveedores 2205) por antigüedad, con los pagos aplicados primero a lo
--   más antiguo.
-- Los documentos de tesorería exigen la fecha de arranque. Los registran
-- admin y la contadora; no se editan: se anulan con su comprobante inverso.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Cuentas de tesorería
-- ---------------------------------------------------------------------
create table public.cuentas_tesoreria (
  id            uuid primary key default gen_random_uuid(),
  nombre        text not null unique check (char_length(btrim(nombre)) between 2 and 100),
  tipo          text not null check (tipo in ('caja', 'banco')),
  cuenta        text not null unique references public.cuentas (codigo),
  banco         text check (char_length(banco) <= 100),
  numero_cuenta text check (char_length(numero_cuenta) <= 40),
  activa        boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create trigger cuentas_tesoreria_updated_at
  before update on public.cuentas_tesoreria
  for each row execute function public.set_updated_at();
create trigger auditoria_cuentas_tesoreria
  after insert or update or delete on public.cuentas_tesoreria
  for each row execute function public.registrar_auditoria();

insert into public.cuentas_tesoreria (nombre, tipo, cuenta) values ('Caja general', 'caja', '110505');

-- ---------------------------------------------------------------------
-- Egresos, traslados y anticipos
-- ---------------------------------------------------------------------
create table public.egresos (
  id                  uuid primary key default gen_random_uuid(),
  numero              integer not null unique check (numero > 0),
  fecha               date not null,
  clase               text not null check (clase in ('proveedor', 'otro')),
  cuenta_tesoreria_id uuid not null references public.cuentas_tesoreria (id),
  -- Pago a proveedor: D 2205. Otro: D la cuenta indicada
  cuenta_contrapartida text references public.cuentas (codigo),
  proveedor_id        uuid references public.proveedores (id),
  cliente_id          uuid references public.clientes (id),
  tercero_id          uuid references public.terceros (id),
  valor               numeric(14, 2) not null check (valor > 0),
  metodo              public.metodo_pago not null,
  concepto            text not null check (char_length(btrim(concepto)) between 3 and 300),
  referencia          text check (char_length(referencia) <= 100),
  usuario_id          uuid references public.perfiles (id),
  created_at          timestamptz not null default now(),
  anulado_at          timestamptz,
  anulado_por         uuid references public.perfiles (id),
  motivo_anulacion    text check (char_length(motivo_anulacion) <= 300),
  check (num_nonnulls(proveedor_id, cliente_id, tercero_id) <= 1),
  check (clase <> 'proveedor' or proveedor_id is not null),
  check (clase <> 'otro' or cuenta_contrapartida is not null)
);

create table public.traslados (
  id               uuid primary key default gen_random_uuid(),
  numero           integer not null unique check (numero > 0),
  fecha            date not null,
  origen_id        uuid not null references public.cuentas_tesoreria (id),
  destino_id       uuid not null references public.cuentas_tesoreria (id),
  valor            numeric(14, 2) not null check (valor > 0),
  notas            text check (char_length(notas) <= 300),
  usuario_id       uuid references public.perfiles (id),
  created_at       timestamptz not null default now(),
  anulado_at       timestamptz,
  anulado_por      uuid references public.perfiles (id),
  motivo_anulacion text check (char_length(motivo_anulacion) <= 300),
  check (origen_id <> destino_id)
);

create table public.anticipos (
  id                  uuid primary key default gen_random_uuid(),
  numero              integer not null unique check (numero > 0),
  fecha               date not null,
  cliente_id          uuid not null references public.clientes (id),
  cuenta_tesoreria_id uuid not null references public.cuentas_tesoreria (id),
  valor               numeric(14, 2) not null check (valor > 0),
  metodo              public.metodo_pago not null,
  referencia          text check (char_length(referencia) <= 100),
  notas               text check (char_length(notas) <= 300),
  usuario_id          uuid references public.perfiles (id),
  created_at          timestamptz not null default now(),
  anulado_at          timestamptz,
  anulado_por         uuid references public.perfiles (id),
  motivo_anulacion    text check (char_length(motivo_anulacion) <= 300)
);

create index egresos_fecha_idx on public.egresos (fecha desc);
create index traslados_fecha_idx on public.traslados (fecha desc);
create index anticipos_cliente_idx on public.anticipos (cliente_id);

-- Un abono puede salir de un anticipo, y entrar a una caja o banco elegido
alter table public.pagos
  add column cuenta_tesoreria_id uuid references public.cuentas_tesoreria (id),
  add column anticipo_id         uuid references public.anticipos (id);

create index pagos_anticipo_idx on public.pagos (anticipo_id) where anticipo_id is not null;

-- Comprobantes de cada documento
alter table public.comprobantes
  add column egreso_id   uuid references public.egresos (id) on delete restrict,
  add column traslado_id uuid references public.traslados (id) on delete restrict,
  add column anticipo_id uuid references public.anticipos (id) on delete restrict;

create unique index comprobantes_egreso on public.comprobantes (egreso_id) where anula_id is null;
create unique index comprobantes_traslado on public.comprobantes (traslado_id) where anula_id is null;
create unique index comprobantes_anticipo on public.comprobantes (anticipo_id) where anula_id is null;

insert into public.tipos_comprobante (codigo, nombre, manual) values
  ('CE', 'Comprobante de egreso', false),
  ('TR', 'Traslado de fondos', false),
  ('RA', 'Recibo de anticipo', false);

insert into public.parametros_contables (clave, nombre, cuenta) values
  ('anticipos_clientes', 'Anticipos de clientes', '2805');

-- ---------------------------------------------------------------------
-- Seguridad
-- ---------------------------------------------------------------------
alter table public.cuentas_tesoreria enable row level security;
alter table public.egresos           enable row level security;
alter table public.traslados         enable row level security;
alter table public.anticipos         enable row level security;

create policy "contabilidad: lectura" on public.cuentas_tesoreria
  for select to authenticated using ((select public.ver_contabilidad()));
create policy "contabilidad: lectura" on public.egresos
  for select to authenticated using ((select public.ver_contabilidad()));
create policy "contabilidad: lectura" on public.traslados
  for select to authenticated using ((select public.ver_contabilidad()));
create policy "contabilidad: lectura" on public.anticipos
  for select to authenticated using ((select public.ver_contabilidad()));

-- Las cuentas se crean con su función; se editan nombre, datos del banco y estado
create policy "contabilidad: edita" on public.cuentas_tesoreria
  for update to authenticated using ((select public.lleva_contabilidad())) with check ((select public.lleva_contabilidad()));
revoke insert, update, delete, truncate on public.cuentas_tesoreria from anon, authenticated;
grant update (nombre, banco, numero_cuenta, activa) on public.cuentas_tesoreria to authenticated;
revoke insert, update, delete, truncate on public.egresos, public.traslados, public.anticipos from anon, authenticated;
revoke all on public.cuentas_tesoreria, public.egresos, public.traslados, public.anticipos from anon;

-- ---------------------------------------------------------------------
-- Ayudas
-- ---------------------------------------------------------------------
-- Exige que la contabilidad haya arrancado y que la fecha sea desde el arranque
create or replace function public._exigir_arranque(p_fecha date, p_que text)
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if not public._validar_fecha_arranque(p_fecha, p_que) then
    raise exception 'Define primero la fecha de arranque de la contabilidad (Contabilidad → Configuración)';
  end if;
end;
$$;

-- Cuenta del PUC de una cuenta de tesorería activa
create or replace function public._cuenta_tesoreria(p_id uuid)
returns text
language plpgsql
stable
set search_path = ''
as $$
declare
  v_cuenta text;
begin
  select cuenta into v_cuenta from public.cuentas_tesoreria where id = p_id and activa;
  if v_cuenta is null then
    raise exception 'La caja o cuenta bancaria no existe o está inactiva';
  end if;
  return v_cuenta;
end;
$$;

-- Saldo contable de una cuenta del PUC (y sus subcuentas) a una fecha, en su naturaleza
create or replace function public._saldo_cuenta(p_cuenta text, p_hasta date, p_tercero jsonb default '{}')
returns numeric
language sql
stable
set search_path = ''
as $$
  select coalesce(sum(a.debito - a.credito), 0)
    * (select case naturaleza when 'debito' then 1 else -1 end from public.cuentas where codigo = p_cuenta)
  from public.asientos a
  join public.comprobantes c on c.id = a.comprobante_id
  where a.cuenta like p_cuenta || '%' and c.fecha <= p_hasta
    and (p_tercero ->> 'proveedor_id' is null or a.proveedor_id = (p_tercero ->> 'proveedor_id')::uuid)
    and (p_tercero ->> 'cliente_id' is null or a.cliente_id = (p_tercero ->> 'cliente_id')::uuid);
$$;

-- Siguiente número de una serie de documentos
create or replace function public._siguiente_documento(p_tabla text)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_numero integer;
begin
  perform pg_advisory_xact_lock(hashtext('documentos.numero.' || p_tabla));
  execute format('select coalesce(max(numero), 0) + 1 from public.%I', p_tabla) into v_numero;
  return v_numero;
end;
$$;

revoke execute on function public._exigir_arranque, public._cuenta_tesoreria, public._saldo_cuenta,
  public._siguiente_documento from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Crear una caja o una cuenta bancaria
-- ---------------------------------------------------------------------
create or replace function public.crear_cuenta_tesoreria(
  p_nombre        text,
  p_tipo          text,
  p_banco         text default null,
  p_numero_cuenta text default null,
  p_cuenta        text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_padre  text := case p_tipo when 'banco' then '111005' when 'caja' then '1105' end;
  v_cuenta text := nullif(btrim(p_cuenta), '');
  v_paso   integer := case p_tipo when 'caja' then 5 else 1 end;
  v_sufijo integer;
  v_id     uuid;
begin
  if not public.lleva_contabilidad() then
    raise exception 'Solo un administrador o la contadora crean cajas y cuentas bancarias' using errcode = '42501';
  end if;
  if v_padre is null then
    raise exception 'Tipo inválido: caja o banco';
  end if;
  if char_length(btrim(coalesce(p_nombre, ''))) < 2 then
    raise exception 'Escribe el nombre';
  end if;

  if v_cuenta is null then
    -- Auxiliar nuevo: el siguiente código libre bajo la cuenta padre
    -- Cajas: 110510, 110515...; bancos: 11100501, 11100502...
    select coalesce(max(right(codigo, 2)::integer), 0) + v_paso into v_sufijo
    from public.cuentas
    where padre = v_padre;
    if v_sufijo > 99 then
      raise exception 'No quedan códigos libres bajo la cuenta %', v_padre;
    end if;
    v_cuenta := v_padre || lpad(v_sufijo::text, 2, '0');
    insert into public.cuentas (codigo, nombre, naturaleza)
    values (v_cuenta, left(btrim(p_nombre), 120), 'debito');
  else
    if not exists (select 1 from public.cuentas where codigo = v_cuenta and activa) or not public.cuenta_es_hoja(v_cuenta) then
      raise exception 'La cuenta % no existe o no es de último nivel', v_cuenta;
    end if;
    if v_cuenta not like '11%' then
      raise exception 'Una caja o un banco va en una cuenta del grupo 11 (disponible)';
    end if;
  end if;

  insert into public.cuentas_tesoreria (nombre, tipo, cuenta, banco, numero_cuenta)
  values (btrim(p_nombre), p_tipo, v_cuenta, nullif(btrim(p_banco), ''), nullif(btrim(p_numero_cuenta), ''))
  returning id into v_id;
  return v_id;
end;
$$;

-- Caja o banco de cada cuenta de tesorería, con su saldo a una fecha
create or replace function public.saldos_tesoreria(p_hasta date default null)
returns table (id uuid, nombre text, tipo text, cuenta text, banco text, numero_cuenta text, activa boolean, saldo numeric)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.ver_contabilidad() then
    raise exception 'No tienes permisos para ver la contabilidad' using errcode = '42501';
  end if;
  return query
  select t.id, t.nombre, t.tipo, t.cuenta, t.banco, t.numero_cuenta, t.activa,
    public._saldo_cuenta(t.cuenta, coalesce(p_hasta, public.hoy_colombia()))
  from public.cuentas_tesoreria t
  order by t.tipo, t.nombre;
end;
$$;

-- ---------------------------------------------------------------------
-- Abonos: con la caja o banco elegido, o desde un anticipo
-- ---------------------------------------------------------------------
create or replace function public._contabilizar_pago(p_pago_id uuid)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_pago    public.pagos;
  v_mov     public.movimientos;
  v_fecha   date;
  v_cliente jsonb;
  v_debe    jsonb;
begin
  select * into v_pago from public.pagos where id = p_pago_id;
  select * into v_mov from public.movimientos where id = v_pago.movimiento_id;
  v_fecha := (v_pago.fecha at time zone 'America/Bogota')::date;
  if exists (select 1 from public.comprobantes where pago_id = p_pago_id)
     or not public._validar_fecha_arranque(v_fecha, 'abonos') then
    return null;
  end if;
  v_cliente := jsonb_build_object('cliente_id', v_mov.cliente_id);

  v_debe := case
    when v_pago.anticipo_id is not null then
      jsonb_build_object('cuenta', public._cuenta('anticipos_clientes'), 'debito', v_pago.valor,
        'descripcion', 'Anticipo RA-' || lpad((select numero::text from public.anticipos where id = v_pago.anticipo_id), 6, '0')) || v_cliente
    when v_pago.cuenta_tesoreria_id is not null then
      jsonb_build_object('cuenta', public._cuenta_tesoreria(v_pago.cuenta_tesoreria_id), 'debito', v_pago.valor,
        'descripcion', coalesce(v_pago.referencia, v_pago.metodo::text))
    else
      jsonb_build_object('cuenta', public._cuenta(case when v_pago.metodo = 'efectivo' then 'caja' else 'bancos' end),
        'debito', v_pago.valor, 'descripcion', coalesce(v_pago.referencia, v_pago.metodo::text))
  end;

  return public._comprobante_automatico(
    'RC', v_fecha,
    'Abono a la venta NetS-' || lpad(v_mov.numero::text, 6, '0'),
    jsonb_build_array(v_debe)
    || case when v_pago.retencion > 0 then jsonb_build_array(
      jsonb_build_object('cuenta', public._cuenta('retencion_a_favor'), 'debito', v_pago.retencion) || v_cliente
    ) else '[]'::jsonb end
    || jsonb_build_array(
      jsonb_build_object('cuenta', public._cuenta('clientes'), 'credito', v_pago.valor + v_pago.retencion) || v_cliente
    ),
    v_mov.id, p_pago_id
  );
end;
$$;

revoke execute on function public._contabilizar_pago from public, anon, authenticated;

drop function public.registrar_pago(uuid, numeric, public.metodo_pago, timestamptz, text, text, numeric);

create function public.registrar_pago(
  p_movimiento_id       uuid,
  p_valor               numeric,
  p_metodo              public.metodo_pago,
  p_fecha               timestamptz default null,
  p_referencia          text default null,
  p_notas               text default null,
  p_retencion           numeric default 0,
  p_cuenta_tesoreria_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_mov       public.movimientos;
  v_saldo     numeric;
  v_retencion numeric := round(coalesce(p_retencion, 0), 2);
  v_id        uuid;
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
  if v_retencion < 0 then
    raise exception 'La retención no puede ser negativa';
  end if;
  if p_fecha is not null and p_fecha > now() + interval '5 minutes' then
    raise exception 'La fecha del abono no puede ser futura';
  end if;
  if coalesce(p_fecha, now()) < v_mov.fecha - interval '1 day' then
    raise exception 'La fecha del abono no puede ser anterior a la venta';
  end if;
  if p_cuenta_tesoreria_id is not null then
    perform public._cuenta_tesoreria(p_cuenta_tesoreria_id);
  end if;

  select saldo into v_saldo from public.cartera where id = p_movimiento_id;
  if round(p_valor, 2) + v_retencion > coalesce(v_saldo, 0) then
    raise exception 'El abono (con la retención) supera el saldo de la venta (%)', to_char(coalesce(v_saldo, 0), 'FM999G999G999G990D00');
  end if;

  insert into public.pagos (movimiento_id, fecha, valor, metodo, referencia, notas, retencion, cuenta_tesoreria_id)
  values (
    p_movimiento_id, coalesce(p_fecha, now()), round(p_valor, 2), p_metodo,
    nullif(btrim(p_referencia), ''), nullif(btrim(p_notas), ''), v_retencion, p_cuenta_tesoreria_id
  )
  returning id into v_id;

  perform public._contabilizar_pago(v_id);
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------
-- Comprobante de egreso
-- ---------------------------------------------------------------------
create or replace function public.registrar_egreso(
  p_fecha               date,
  p_clase               text,
  p_cuenta_tesoreria_id uuid,
  p_valor               numeric,
  p_metodo              public.metodo_pago,
  p_concepto            text,
  p_proveedor_id        uuid default null,
  p_cuenta              text default null,
  p_cliente_id          uuid default null,
  p_tercero_id          uuid default null,
  p_referencia          text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_valor   numeric := round(coalesce(p_valor, 0), 2);
  v_numero  integer;
  v_id      uuid;
  v_debe    text;
  v_saldo   numeric;
  v_origen  text;
  v_tercero jsonb := '{}';
  v_comp    uuid;
begin
  if not public.lleva_contabilidad() then
    raise exception 'Solo un administrador o la contadora registran egresos' using errcode = '42501';
  end if;
  if p_clase not in ('proveedor', 'otro') then
    raise exception 'Clase de egreso inválida';
  end if;
  if v_valor <= 0 then
    raise exception 'El valor debe ser mayor que cero';
  end if;
  if char_length(btrim(coalesce(p_concepto, ''))) < 3 then
    raise exception 'Escribe el concepto del pago';
  end if;
  if p_fecha is null or p_fecha > public.hoy_colombia() then
    raise exception 'La fecha del egreso no puede ser futura';
  end if;
  perform public._exigir_arranque(p_fecha, 'egresos');
  v_origen := public._cuenta_tesoreria(p_cuenta_tesoreria_id);

  if p_clase = 'proveedor' then
    if p_proveedor_id is null then
      raise exception 'Elige el proveedor al que se le paga';
    end if;
    v_debe := public._cuenta('compras_por_pagar');
    v_tercero := jsonb_build_object('proveedor_id', p_proveedor_id);
    -- No se le paga más de lo que se le debe (para pagar por adelantado, usa «otro pago»)
    perform pg_advisory_xact_lock(hashtext('egresos.proveedor.' || p_proveedor_id));
    v_saldo := public._saldo_cuenta(v_debe, public.hoy_colombia(), v_tercero);
    if v_valor > v_saldo then
      raise exception 'El pago supera lo que se le debe al proveedor (%)', to_char(v_saldo, 'FM999G999G999G990D00');
    end if;
  else
    v_debe := nullif(btrim(p_cuenta), '');
    if v_debe is null then
      raise exception 'Elige la cuenta del gasto o de lo que se paga';
    end if;
    if v_debe like '11%' then
      raise exception 'Para mover dinero entre cajas y bancos usa un traslado';
    end if;
    v_tercero := case
      when p_proveedor_id is not null then jsonb_build_object('proveedor_id', p_proveedor_id)
      when p_cliente_id is not null then jsonb_build_object('cliente_id', p_cliente_id)
      when p_tercero_id is not null then jsonb_build_object('tercero_id', p_tercero_id)
      else '{}'
    end;
  end if;

  v_numero := public._siguiente_documento('egresos');
  insert into public.egresos (
    numero, fecha, clase, cuenta_tesoreria_id, cuenta_contrapartida, proveedor_id, cliente_id, tercero_id,
    valor, metodo, concepto, referencia, usuario_id
  )
  values (
    v_numero, p_fecha, p_clase, p_cuenta_tesoreria_id, case when p_clase = 'otro' then v_debe end,
    (v_tercero ->> 'proveedor_id')::uuid, (v_tercero ->> 'cliente_id')::uuid, (v_tercero ->> 'tercero_id')::uuid,
    v_valor, p_metodo, btrim(p_concepto), nullif(btrim(p_referencia), ''), auth.uid()
  )
  returning id into v_id;

  v_comp := public._comprobante_automatico(
    'CE', p_fecha, 'CE-' || lpad(v_numero::text, 6, '0') || ': ' || btrim(p_concepto),
    public._par(v_debe, v_origen, v_valor, v_tercero)
  );
  update public.comprobantes set egreso_id = v_id where id = v_comp;
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------
-- Traslado entre cajas y bancos
-- ---------------------------------------------------------------------
create or replace function public.registrar_traslado(
  p_fecha      date,
  p_origen_id  uuid,
  p_destino_id uuid,
  p_valor      numeric,
  p_notas      text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_valor  numeric := round(coalesce(p_valor, 0), 2);
  v_numero integer;
  v_id     uuid;
  v_comp   uuid;
begin
  if not public.lleva_contabilidad() then
    raise exception 'Solo un administrador o la contadora registran traslados' using errcode = '42501';
  end if;
  if v_valor <= 0 then
    raise exception 'El valor debe ser mayor que cero';
  end if;
  if p_origen_id = p_destino_id then
    raise exception 'El origen y el destino deben ser distintos';
  end if;
  if p_fecha is null or p_fecha > public.hoy_colombia() then
    raise exception 'La fecha del traslado no puede ser futura';
  end if;
  perform public._exigir_arranque(p_fecha, 'traslados');

  v_numero := public._siguiente_documento('traslados');
  insert into public.traslados (numero, fecha, origen_id, destino_id, valor, notas, usuario_id)
  values (v_numero, p_fecha, p_origen_id, p_destino_id, v_valor, nullif(btrim(p_notas), ''), auth.uid())
  returning id into v_id;

  v_comp := public._comprobante_automatico(
    'TR', p_fecha,
    'TR-' || lpad(v_numero::text, 6, '0') || ': de ' || (select nombre from public.cuentas_tesoreria where id = p_origen_id)
      || ' a ' || (select nombre from public.cuentas_tesoreria where id = p_destino_id),
    public._par(public._cuenta_tesoreria(p_destino_id), public._cuenta_tesoreria(p_origen_id), v_valor)
  );
  update public.comprobantes set traslado_id = v_id where id = v_comp;
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------
-- Anticipos de clientes
-- ---------------------------------------------------------------------
create or replace function public.registrar_anticipo(
  p_fecha               date,
  p_cliente_id          uuid,
  p_cuenta_tesoreria_id uuid,
  p_valor               numeric,
  p_metodo              public.metodo_pago,
  p_referencia          text default null,
  p_notas               text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_valor  numeric := round(coalesce(p_valor, 0), 2);
  v_numero integer;
  v_id     uuid;
  v_comp   uuid;
begin
  if not public.lleva_contabilidad() then
    raise exception 'Solo un administrador o la contadora registran anticipos' using errcode = '42501';
  end if;
  if v_valor <= 0 then
    raise exception 'El valor debe ser mayor que cero';
  end if;
  if not exists (select 1 from public.clientes where id = p_cliente_id and activo) then
    raise exception 'El cliente no existe o está inactivo';
  end if;
  if p_fecha is null or p_fecha > public.hoy_colombia() then
    raise exception 'La fecha del anticipo no puede ser futura';
  end if;
  perform public._exigir_arranque(p_fecha, 'anticipos');

  v_numero := public._siguiente_documento('anticipos');
  insert into public.anticipos (numero, fecha, cliente_id, cuenta_tesoreria_id, valor, metodo, referencia, notas, usuario_id)
  values (v_numero, p_fecha, p_cliente_id, p_cuenta_tesoreria_id, v_valor, p_metodo,
    nullif(btrim(p_referencia), ''), nullif(btrim(p_notas), ''), auth.uid())
  returning id into v_id;

  v_comp := public._comprobante_automatico(
    'RA', p_fecha,
    'RA-' || lpad(v_numero::text, 6, '0') || ': anticipo de ' || (select nombre from public.clientes where id = p_cliente_id),
    public._par(public._cuenta_tesoreria(p_cuenta_tesoreria_id), public._cuenta('anticipos_clientes'), v_valor,
      '{}', jsonb_build_object('cliente_id', p_cliente_id))
  );
  update public.comprobantes set anticipo_id = v_id where id = v_comp;
  return v_id;
end;
$$;

-- Lo que queda de un anticipo por aplicar
create or replace function public._saldo_anticipo(p_anticipo_id uuid)
returns numeric
language sql
stable
set search_path = ''
as $$
  select a.valor - coalesce((
    select sum(p.valor) from public.pagos p where p.anticipo_id = a.id and p.anulado_at is null
  ), 0)
  from public.anticipos a
  where a.id = p_anticipo_id;
$$;

revoke execute on function public._saldo_anticipo from public, anon, authenticated;

-- Aplica (parte de) un anticipo a una venta a crédito del mismo cliente: queda como un abono
create or replace function public.aplicar_anticipo(p_anticipo_id uuid, p_movimiento_id uuid, p_valor numeric)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_anticipo public.anticipos;
  v_mov      public.movimientos;
  v_valor    numeric := round(coalesce(p_valor, 0), 2);
  v_saldo    numeric;
  v_id       uuid;
begin
  if not public.lleva_contabilidad() then
    raise exception 'Solo un administrador o la contadora aplican anticipos' using errcode = '42501';
  end if;
  select * into v_anticipo from public.anticipos where id = p_anticipo_id for update;
  if not found or v_anticipo.anulado_at is not null then
    raise exception 'El anticipo no existe o está anulado';
  end if;
  select * into v_mov from public.movimientos where id = p_movimiento_id for update;
  if not found or v_mov.tipo <> 'salida' or not v_mov.credito or v_mov.anulado_at is not null then
    raise exception 'La venta a crédito no existe';
  end if;
  if v_mov.cliente_id <> v_anticipo.cliente_id then
    raise exception 'La venta es de otro cliente';
  end if;
  if v_valor <= 0 then
    raise exception 'El valor debe ser mayor que cero';
  end if;
  if v_valor > public._saldo_anticipo(p_anticipo_id) then
    raise exception 'Supera lo que queda del anticipo (%)', to_char(public._saldo_anticipo(p_anticipo_id), 'FM999G999G999G990D00');
  end if;
  select saldo into v_saldo from public.cartera where id = p_movimiento_id;
  if v_valor > coalesce(v_saldo, 0) then
    raise exception 'Supera el saldo de la venta (%)', to_char(coalesce(v_saldo, 0), 'FM999G999G999G990D00');
  end if;

  insert into public.pagos (movimiento_id, fecha, valor, metodo, referencia, anticipo_id, usuario_id)
  values (p_movimiento_id, now(), v_valor, 'otro', 'Anticipo RA-' || lpad(v_anticipo.numero::text, 6, '0'), p_anticipo_id, auth.uid())
  returning id into v_id;
  perform public._contabilizar_pago(v_id);
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------
-- Anular egresos, traslados y anticipos
-- ---------------------------------------------------------------------
create or replace function public.anular_tesoreria(p_tabla text, p_id uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existe  uuid;
  v_anulado timestamptz;
  v_comp    uuid;
begin
  if not public.lleva_contabilidad() then
    raise exception 'Solo un administrador o la contadora anulan documentos de tesorería' using errcode = '42501';
  end if;
  if p_tabla not in ('egresos', 'traslados', 'anticipos') then
    raise exception 'Documento inválido';
  end if;
  if char_length(btrim(coalesce(p_motivo, ''))) < 5 then
    raise exception 'Explica el motivo de la anulación';
  end if;
  -- EXECUTE no actualiza FOUND: se lee también el id
  execute format('select id, anulado_at from public.%I where id = $1 for update', p_tabla) into v_existe, v_anulado using p_id;
  if v_existe is null then
    raise exception 'El documento no existe';
  end if;
  if v_anulado is not null then
    raise exception 'El documento ya está anulado';
  end if;
  if p_tabla = 'anticipos' and exists (select 1 from public.pagos where anticipo_id = p_id and anulado_at is null) then
    raise exception 'El anticipo ya se aplicó a ventas: anula primero esos abonos';
  end if;

  execute format('update public.%I set anulado_at = now(), anulado_por = auth.uid(), motivo_anulacion = $2 where id = $1', p_tabla)
  using p_id, btrim(p_motivo);

  execute format('select id from public.comprobantes where %I = $1 and anula_id is null',
    case p_tabla when 'egresos' then 'egreso_id' when 'traslados' then 'traslado_id' else 'anticipo_id' end)
  into v_comp using p_id;
  if v_comp is not null then
    perform public._revertir_comprobante(v_comp, p_motivo);
  end if;
end;
$$;

-- _revertir_comprobante (0024) copia también los enlaces nuevos
create or replace function public._revertir_comprobante(p_id uuid, p_motivo text)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_comp  public.comprobantes;
  v_nuevo uuid;
  v_fecha date := public.hoy_colombia();
begin
  select * into v_comp from public.comprobantes where id = p_id for update;
  if v_comp.id is null or v_comp.anulado_at is not null then
    return null;
  end if;
  perform public._periodo_abierto(v_fecha);

  insert into public.comprobantes (
    tipo, numero, fecha, descripcion, anula_id, movimiento_id, pago_id, nota_id, egreso_id, traslado_id, anticipo_id, usuario_id
  )
  values (
    v_comp.tipo, public._siguiente_comprobante(v_comp.tipo), v_fecha,
    left('Anulación de ' || public.etiqueta_comprobante(v_comp.tipo, v_comp.numero) || ': ' || btrim(p_motivo), 300),
    p_id, v_comp.movimiento_id, v_comp.pago_id, v_comp.nota_id, v_comp.egreso_id, v_comp.traslado_id, v_comp.anticipo_id,
    auth.uid()
  )
  returning id into v_nuevo;

  insert into public.asientos (comprobante_id, linea, cuenta, cliente_id, proveedor_id, tercero_id, descripcion, debito, credito)
  select v_nuevo, linea, cuenta, cliente_id, proveedor_id, tercero_id, descripcion, credito, debito
  from public.asientos
  where comprobante_id = p_id;

  update public.comprobantes
  set anulado_at = now(), anulado_por = auth.uid(), motivo_anulacion = btrim(p_motivo)
  where id = p_id;
  return v_nuevo;
end;
$$;

-- ---------------------------------------------------------------------
-- Edades: lo pendiente de cada tercero por antigüedad. Los documentos son
-- los movimientos que aumentan el saldo (ventas al cliente, entradas del
-- proveedor); los pagos se aplican primero a lo más antiguo. Vence: el de
-- la venta, o la fecha + el plazo del tercero.
-- ---------------------------------------------------------------------
create or replace function public.edades_por_tercero(p_cuenta text, p_hasta date default null)
returns table (
  clase      text,
  tercero_id uuid,
  nombre     text,
  documento  text,
  al_dia     numeric,
  d1_30      numeric,
  d31_60     numeric,
  d61_90     numeric,
  mas_90     numeric,
  total      numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_signo integer;
  v_hasta date := coalesce(p_hasta, public.hoy_colombia());
begin
  if not public.ver_contabilidad() then
    raise exception 'No tienes permisos para ver la contabilidad' using errcode = '42501';
  end if;
  select case naturaleza when 'debito' then 1 else -1 end into v_signo from public.cuentas where codigo = p_cuenta;
  if v_signo is null then
    raise exception 'La cuenta % no existe', p_cuenta;
  end if;

  return query
  with lineas as (
    select
      case when a.cliente_id is not null then 'cliente' when a.proveedor_id is not null then 'proveedor' else 'tercero' end as clase,
      coalesce(a.cliente_id, a.proveedor_id, a.tercero_id) as tercero_id,
      (a.debito - a.credito) * v_signo as valor,
      c.fecha,
      coalesce(
        m.vence,
        c.fecha + coalesce(cl.dias_credito, pr.dias_credito, 0)
      ) as vence,
      c.created_at
    from public.asientos a
    join public.comprobantes c on c.id = a.comprobante_id
    left join public.movimientos m on m.id = c.movimiento_id and c.tipo = 'MI'
    left join public.clientes cl on cl.id = a.cliente_id
    left join public.proveedores pr on pr.id = a.proveedor_id
    where a.cuenta like p_cuenta || '%' and c.fecha <= v_hasta
      and coalesce(a.cliente_id, a.proveedor_id, a.tercero_id) is not null
  ),
  documentos as (
    select l.*,
      sum(l.valor) over (partition by l.clase, l.tercero_id order by l.fecha, l.created_at rows unbounded preceding) as acumulado
    from lineas l
    where l.valor > 0
  ),
  pagado as (
    select l.clase, l.tercero_id, -sum(l.valor) as pagado from lineas l where l.valor < 0 group by 1, 2
  ),
  pendientes as (
    select d.clase, d.tercero_id, d.vence,
      greatest(least(d.valor, d.acumulado - coalesce(p.pagado, 0)), 0) as pendiente
    from documentos d
    left join pagado p on p.clase = d.clase and p.tercero_id = d.tercero_id
  )
  select x.clase, x.tercero_id,
    coalesce(cl.nombre, pr.nombre, te.nombre),
    coalesce(cl.documento, pr.nit, te.documento),
    sum(x.pendiente) filter (where v_hasta <= x.vence),
    sum(x.pendiente) filter (where v_hasta - x.vence between 1 and 30),
    sum(x.pendiente) filter (where v_hasta - x.vence between 31 and 60),
    sum(x.pendiente) filter (where v_hasta - x.vence between 61 and 90),
    sum(x.pendiente) filter (where v_hasta - x.vence > 90),
    sum(x.pendiente)
  from pendientes x
  left join public.clientes cl on x.clase = 'cliente' and cl.id = x.tercero_id
  left join public.proveedores pr on x.clase = 'proveedor' and pr.id = x.tercero_id
  left join public.terceros te on x.clase = 'tercero' and te.id = x.tercero_id
  group by x.clase, x.tercero_id, cl.nombre, pr.nombre, te.nombre, cl.documento, pr.nit, te.documento
  having sum(x.pendiente) > 0
  order by sum(x.pendiente) desc;
end;
$$;

revoke execute on function public.crear_cuenta_tesoreria, public.saldos_tesoreria, public.registrar_pago,
  public.registrar_egreso, public.registrar_traslado, public.registrar_anticipo, public.aplicar_anticipo,
  public.anular_tesoreria, public.edades_por_tercero from public, anon;
grant execute on function public.crear_cuenta_tesoreria, public.saldos_tesoreria, public.registrar_pago,
  public.registrar_egreso, public.registrar_traslado, public.registrar_anticipo, public.aplicar_anticipo,
  public.anular_tesoreria, public.edades_por_tercero to authenticated;
