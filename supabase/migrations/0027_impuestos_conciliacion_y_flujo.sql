-- =====================================================================
-- 0027: contabilidad, fase 6 (impuestos, conciliación bancaria y flujo
-- de caja)
--
-- - Impuestos: base del ICA por bimestre (ingresos operacionales menos
--   devoluciones) con la tarifa por mil de la configuración, y las
--   retenciones que practicaron los clientes, por cliente, para cruzarlas
--   con sus certificados. Net&Sec no es responsable de IVA ni agente de
--   retención: no hay auxiliar de IVA ni certificados que expedir.
-- - Conciliación bancaria: se importa el extracto de cada banco y mes
--   (CSV o Excel); la aplicación cruza sus líneas con los asientos del
--   banco por valor y fecha (±3 días), se concilia el resto a mano y el
--   mes se cierra cuando el saldo del extracto cuadra con los libros más
--   las partidas en tránsito. El cierre mensual exige la conciliación de
--   cada banco con movimientos.
-- - Flujo de efectivo del período (de dónde vino y a dónde fue el dinero)
--   y flujo de caja proyectado por semanas: lo que se espera cobrar y
--   pagar según los vencimientos, más los gastos recurrentes.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Impuestos
-- ---------------------------------------------------------------------
-- Base del ICA de cada bimestre de un año (Santa Marta declara bimestral)
create or replace function public.base_ica(p_anio integer)
returns table (
  bimestre     integer,
  desde        date,
  hasta        date,
  ingresos     numeric,
  devoluciones numeric,
  base         numeric,
  tarifa       numeric,
  impuesto     numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_tarifa numeric;
begin
  if not public.ver_contabilidad() then
    raise exception 'No tienes permisos para ver la contabilidad' using errcode = '42501';
  end if;
  select tarifa_ica into v_tarifa from public.configuracion_contable;

  return query
  with bimestres as (
    select b, make_date(p_anio, b * 2 - 1, 1) as d,
      (make_date(p_anio, b * 2 - 1, 1) + interval '2 months' - interval '1 day')::date as h
    from generate_series(1, 6) b
  )
  select x.b, x.d, x.h,
    coalesce(sum(a.credito - a.debito) filter (where a.cuenta like '41%' and a.cuenta not like '4175%'), 0),
    coalesce(sum(a.debito - a.credito) filter (where a.cuenta like '4175%'), 0),
    coalesce(sum(a.credito - a.debito) filter (where a.cuenta like '41%'), 0),
    v_tarifa,
    -- El impuesto se aproxima al múltiplo de mil más cercano
    case when v_tarifa is null then null
      else round(greatest(coalesce(sum(a.credito - a.debito) filter (where a.cuenta like '41%'), 0), 0) * v_tarifa / 1000, -3)
    end
  from bimestres x
  left join public.comprobantes c on c.fecha between x.d and x.h and c.tipo <> 'CI'
  left join public.asientos a on a.comprobante_id = c.id and a.cuenta like '41%'
  group by x.b, x.d, x.h
  order by x.b;
end;
$$;

-- Retenciones que practicaron los clientes en un período (135515 / 135517), por cliente
create or replace function public.retenciones_a_favor(p_desde date, p_hasta date)
returns table (cliente_id uuid, nombre text, documento text, base numeric, retencion numeric, abonos integer)
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
  select p.cliente_id, cl.nombre, cl.documento,
    sum(p.valor + p.retencion), sum(p.retencion), count(*)::integer
  from (
    select pg.valor, pg.retencion, m.cliente_id
    from public.pagos pg
    join public.movimientos m on m.id = pg.movimiento_id
    where pg.anulado_at is null and pg.retencion > 0
      and (pg.fecha at time zone 'America/Bogota')::date between p_desde and p_hasta
  ) p
  join public.clientes cl on cl.id = p.cliente_id
  group by p.cliente_id, cl.nombre, cl.documento
  order by 5 desc;
end;
$$;

-- ---------------------------------------------------------------------
-- Conciliación bancaria
-- ---------------------------------------------------------------------
create table public.extractos (
  id                  uuid primary key default gen_random_uuid(),
  cuenta_tesoreria_id uuid not null references public.cuentas_tesoreria (id),
  anio                smallint not null,
  mes                 smallint not null check (mes between 1 and 12),
  saldo_inicial       numeric(16, 2) not null,
  saldo_final         numeric(16, 2) not null,
  cerrado             boolean not null default false,
  cerrado_por         uuid references public.perfiles (id),
  cerrado_at          timestamptz,
  usuario_id          uuid references public.perfiles (id),
  created_at          timestamptz not null default now(),
  unique (cuenta_tesoreria_id, anio, mes)
);

create table public.extracto_lineas (
  id          uuid primary key default gen_random_uuid(),
  extracto_id uuid not null references public.extractos (id) on delete cascade,
  orden       integer not null,
  fecha       date not null,
  descripcion text not null check (char_length(descripcion) <= 300),
  referencia  text check (char_length(referencia) <= 100),
  -- Positivo: entra al banco; negativo: sale
  valor       numeric(16, 2) not null check (valor <> 0),
  -- Asiento de los libros con el que se concilió
  asiento_id  uuid unique references public.asientos (id) on delete restrict
);

create index extracto_lineas_extracto_idx on public.extracto_lineas (extracto_id);

create trigger auditoria_extractos
  after insert or update or delete on public.extractos
  for each row execute function public.registrar_auditoria();

alter table public.extractos       enable row level security;
alter table public.extracto_lineas enable row level security;
create policy "contabilidad: lectura" on public.extractos for select to authenticated using ((select public.ver_contabilidad()));
create policy "contabilidad: lectura" on public.extracto_lineas for select to authenticated using ((select public.ver_contabilidad()));
revoke insert, update, delete, truncate on public.extractos, public.extracto_lineas from anon, authenticated;
revoke all on public.extractos, public.extracto_lineas from anon;

-- Extracto abierto, bloqueado para modificarlo
create or replace function public._extracto_abierto(p_id uuid)
returns public.extractos
language plpgsql
set search_path = ''
as $$
declare
  v_ext public.extractos;
begin
  if not public.lleva_contabilidad() then
    raise exception 'Solo un administrador o la contadora concilian bancos' using errcode = '42501';
  end if;
  select * into v_ext from public.extractos where id = p_id for update;
  if not found then
    raise exception 'El extracto no existe';
  end if;
  if v_ext.cerrado then
    raise exception 'La conciliación de ese mes está cerrada: reábrela para modificarla';
  end if;
  return v_ext;
end;
$$;

revoke execute on function public._extracto_abierto from public, anon, authenticated;

-- Cruza las líneas sin conciliar con asientos del banco del mismo valor y fecha cercana (±3 días)
create or replace function public.conciliar_automatico(p_extracto_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ext    public.extractos := public._extracto_abierto(p_extracto_id);
  v_cuenta text;
  v_linea  public.extracto_lineas;
  v_asiento uuid;
  v_n      integer := 0;
begin
  select cuenta into v_cuenta from public.cuentas_tesoreria where id = v_ext.cuenta_tesoreria_id;
  for v_linea in
    select * from public.extracto_lineas where extracto_id = p_extracto_id and asiento_id is null order by orden
  loop
    select a.id into v_asiento
    from public.asientos a
    join public.comprobantes c on c.id = a.comprobante_id
    where a.cuenta = v_cuenta
      and a.debito - a.credito = v_linea.valor
      and c.fecha between v_linea.fecha - 3 and v_linea.fecha + 3
      and not exists (select 1 from public.extracto_lineas l where l.asiento_id = a.id)
    order by abs(c.fecha - v_linea.fecha), c.created_at
    limit 1;
    if v_asiento is not null then
      update public.extracto_lineas set asiento_id = v_asiento where id = v_linea.id;
      v_n := v_n + 1;
    end if;
  end loop;
  return v_n;
end;
$$;

-- Importa el extracto de un banco y mes (reemplaza las líneas si ya existía y está abierto) y concilia lo que pueda.
--   p_lineas: [{ fecha, descripcion, referencia?, valor }]  (valor positivo entra, negativo sale)
create or replace function public.importar_extracto(
  p_cuenta_tesoreria_id uuid,
  p_anio                integer,
  p_mes                 integer,
  p_saldo_inicial       numeric,
  p_saldo_final         numeric,
  p_lineas              jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id    uuid;
  v_linea jsonb;
  v_n     integer := 0;
  v_desde date := make_date(p_anio, p_mes, 1);
  v_hasta date := (make_date(p_anio, p_mes, 1) + interval '1 month' - interval '1 day')::date;
  v_fecha date;
  v_valor numeric;
  v_suma  numeric := 0;
begin
  if not public.lleva_contabilidad() then
    raise exception 'Solo un administrador o la contadora concilian bancos' using errcode = '42501';
  end if;
  if not exists (select 1 from public.cuentas_tesoreria where id = p_cuenta_tesoreria_id and tipo = 'banco') then
    raise exception 'La cuenta bancaria no existe';
  end if;
  if p_lineas is null or jsonb_typeof(p_lineas) <> 'array' then
    raise exception 'El extracto no tiene líneas';
  end if;
  if jsonb_array_length(p_lineas) > 3000 then
    raise exception 'El extracto tiene demasiadas líneas (máximo 3.000)';
  end if;

  select id into v_id from public.extractos
  where cuenta_tesoreria_id = p_cuenta_tesoreria_id and anio = p_anio and mes = p_mes;
  if v_id is not null then
    perform public._extracto_abierto(v_id);
    delete from public.extracto_lineas where extracto_id = v_id;
    update public.extractos set saldo_inicial = round(p_saldo_inicial, 2), saldo_final = round(p_saldo_final, 2) where id = v_id;
  else
    insert into public.extractos (cuenta_tesoreria_id, anio, mes, saldo_inicial, saldo_final, usuario_id)
    values (p_cuenta_tesoreria_id, p_anio, p_mes, round(p_saldo_inicial, 2), round(p_saldo_final, 2), auth.uid())
    returning id into v_id;
  end if;

  for v_linea in select * from jsonb_array_elements(p_lineas) loop
    v_n := v_n + 1;
    v_fecha := (v_linea ->> 'fecha')::date;
    v_valor := round((v_linea ->> 'valor')::numeric, 2);
    if v_fecha is null or v_fecha not between v_desde and v_hasta then
      raise exception 'Línea %: la fecha debe ser del mes del extracto', v_n;
    end if;
    if coalesce(v_valor, 0) = 0 then
      raise exception 'Línea %: el valor no puede ser cero', v_n;
    end if;
    insert into public.extracto_lineas (extracto_id, orden, fecha, descripcion, referencia, valor)
    values (v_id, v_n, v_fecha, left(coalesce(nullif(btrim(v_linea ->> 'descripcion'), ''), 'Sin descripción'), 300),
      left(nullif(btrim(v_linea ->> 'referencia'), ''), 100), v_valor);
    v_suma := v_suma + v_valor;
  end loop;

  if round(p_saldo_inicial + v_suma, 2) <> round(p_saldo_final, 2) then
    raise exception 'Las líneas no cuadran con los saldos del extracto: % + % = %, y el saldo final es %',
      p_saldo_inicial, v_suma, p_saldo_inicial + v_suma, p_saldo_final;
  end if;

  perform public.conciliar_automatico(v_id);
  return v_id;
end;
$$;

-- Concilia a mano una línea del extracto con un asiento del banco (mismo valor), o la libera (p_asiento_id null)
create or replace function public.conciliar_linea(p_linea_id uuid, p_asiento_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_linea  public.extracto_lineas;
  v_ext    public.extractos;
  v_cuenta text;
  v_valor  numeric;
begin
  select * into v_linea from public.extracto_lineas where id = p_linea_id;
  if not found then
    raise exception 'La línea no existe';
  end if;
  v_ext := public._extracto_abierto(v_linea.extracto_id);
  if p_asiento_id is not null then
    select cuenta into v_cuenta from public.cuentas_tesoreria where id = v_ext.cuenta_tesoreria_id;
    select a.debito - a.credito into v_valor from public.asientos a where a.id = p_asiento_id and a.cuenta = v_cuenta;
    if v_valor is null then
      raise exception 'El asiento no es de esta cuenta bancaria';
    end if;
    if v_valor <> v_linea.valor then
      raise exception 'Los valores no coinciden (% en el banco, % en los libros)', v_linea.valor, v_valor;
    end if;
    if exists (select 1 from public.extracto_lineas where asiento_id = p_asiento_id and id <> p_linea_id) then
      raise exception 'Ese asiento ya está conciliado con otra línea';
    end if;
  end if;
  update public.extracto_lineas set asiento_id = p_asiento_id where id = p_linea_id;
end;
$$;

-- Estado de la conciliación: saldo en libros, partidas en tránsito y diferencia
create or replace function public.estado_conciliacion(p_extracto_id uuid)
returns table (
  saldo_libros          numeric,
  saldo_extracto        numeric,
  banco_no_libros       numeric,
  libros_no_banco       numeric,
  diferencia            numeric,
  lineas_pendientes     integer,
  asientos_pendientes   integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_ext    public.extractos;
  v_cuenta text;
  v_hasta  date;
begin
  if not public.ver_contabilidad() then
    raise exception 'No tienes permisos para ver la contabilidad' using errcode = '42501';
  end if;
  select * into v_ext from public.extractos where id = p_extracto_id;
  if not found then
    raise exception 'El extracto no existe';
  end if;
  select cuenta into v_cuenta from public.cuentas_tesoreria where id = v_ext.cuenta_tesoreria_id;
  v_hasta := (make_date(v_ext.anio, v_ext.mes, 1) + interval '1 month' - interval '1 day')::date;

  return query
  with libros as (
    select coalesce(sum(a.debito - a.credito), 0) as saldo
    from public.asientos a join public.comprobantes c on c.id = a.comprobante_id
    where a.cuenta = v_cuenta and c.fecha <= v_hasta
  ),
  sin_banco as (
    -- En los libros hasta fin de mes y en ningún extracto (los saldos iniciales no pasan por el banco)
    select coalesce(sum(a.debito - a.credito), 0) as valor, count(*)::integer as n
    from public.asientos a join public.comprobantes c on c.id = a.comprobante_id
    where a.cuenta = v_cuenta and c.fecha <= v_hasta and c.tipo <> 'SI'
      and not exists (select 1 from public.extracto_lineas l where l.asiento_id = a.id)
  ),
  sin_libros as (
    select coalesce(sum(l.valor), 0) as valor, count(*)::integer as n
    from public.extracto_lineas l
    where l.extracto_id = p_extracto_id and l.asiento_id is null
  )
  select libros.saldo, v_ext.saldo_final, sin_libros.valor, sin_banco.valor,
    v_ext.saldo_final - (libros.saldo - sin_banco.valor + sin_libros.valor),
    sin_libros.n, sin_banco.n
  from libros, sin_banco, sin_libros;
end;
$$;

-- Asientos del banco hasta el fin del mes del extracto que no están en ningún extracto (partidas en tránsito)
create or replace function public.asientos_sin_conciliar(p_extracto_id uuid)
returns table (asiento_id uuid, comprobante_id uuid, tipo text, numero integer, fecha date, descripcion text, valor numeric)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_ext    public.extractos;
  v_cuenta text;
begin
  if not public.ver_contabilidad() then
    raise exception 'No tienes permisos para ver la contabilidad' using errcode = '42501';
  end if;
  select * into v_ext from public.extractos where id = p_extracto_id;
  if not found then
    raise exception 'El extracto no existe';
  end if;
  select cuenta into v_cuenta from public.cuentas_tesoreria where id = v_ext.cuenta_tesoreria_id;
  return query
  select a.id, c.id, c.tipo, c.numero, c.fecha, coalesce(a.descripcion, c.descripcion), a.debito - a.credito
  from public.asientos a
  join public.comprobantes c on c.id = a.comprobante_id
  where a.cuenta = v_cuenta and c.tipo <> 'SI'
    and c.fecha <= (make_date(v_ext.anio, v_ext.mes, 1) + interval '1 month' - interval '1 day')::date
    and not exists (select 1 from public.extracto_lineas l where l.asiento_id = a.id)
  order by c.fecha, c.numero;
end;
$$;

-- Cierra (o reabre) la conciliación de un mes: solo si cuadra
create or replace function public.cerrar_conciliacion(p_extracto_id uuid, p_cerrar boolean default true)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ext public.extractos;
  v_dif numeric;
begin
  if not public.lleva_contabilidad() then
    raise exception 'Solo un administrador o la contadora concilian bancos' using errcode = '42501';
  end if;
  select * into v_ext from public.extractos where id = p_extracto_id for update;
  if not found then
    raise exception 'El extracto no existe';
  end if;
  if p_cerrar then
    select diferencia into v_dif from public.estado_conciliacion(p_extracto_id);
    if round(v_dif, 2) <> 0 then
      raise exception 'La conciliación no cuadra: diferencia de %', to_char(v_dif, 'FM999G999G999G990D00');
    end if;
    update public.extractos set cerrado = true, cerrado_por = auth.uid(), cerrado_at = now() where id = p_extracto_id;
  else
    if exists (select 1 from public.periodos where anio = v_ext.anio and mes = v_ext.mes and cerrado) then
      raise exception 'El mes contable está cerrado: reábrelo primero';
    end if;
    update public.extractos set cerrado = false, cerrado_por = null, cerrado_at = null where id = p_extracto_id;
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- La lista de chequeo del cierre suma la conciliación de cada banco con
-- movimientos en el mes (igual a la 0026 más ese punto)
-- ---------------------------------------------------------------------
create or replace function public.checklist_cierre(p_anio integer, p_mes integer)
returns table (item text, titulo text, ok boolean, detalle text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_desde date := make_date(p_anio, p_mes, 1);
  v_hasta date := (make_date(p_anio, p_mes, 1) + interval '1 month' - interval '1 day')::date;
  v_inicio date;
  v_d numeric;
  v_c numeric;
  v_n integer;
  v_valor numeric;
  v_bancos text;
begin
  if not public.ver_contabilidad() then
    raise exception 'No tienes permisos para ver la contabilidad' using errcode = '42501';
  end if;
  select fecha_inicio into v_inicio from public.configuracion_contable;

  select coalesce(sum(a.debito), 0), coalesce(sum(a.credito), 0) into v_d, v_c
  from public.asientos a join public.comprobantes c on c.id = a.comprobante_id
  where c.fecha between v_desde and v_hasta;
  item := 'cuadre'; titulo := 'Balance de prueba del mes cuadrado'; ok := v_d = v_c;
  detalle := case when ok then null else 'Débitos ' || v_d || ', créditos ' || v_c end;
  return next;

  select count(*) into v_n from (
    select m.id from public.movimientos m
    where (m.fecha at time zone 'America/Bogota')::date between greatest(v_desde, coalesce(v_inicio, v_desde)) and v_hasta
      and not exists (select 1 from public.comprobantes c where c.movimiento_id = m.id and c.tipo = 'MI')
      and (public._valor_movimiento(m.id) <> 0 or (m.tipo = 'salida' and public._valor_venta(m.id) <> 0))
    union all
    select p.id from public.pagos p
    where (p.fecha at time zone 'America/Bogota')::date between greatest(v_desde, coalesce(v_inicio, v_desde)) and v_hasta
      and p.anulado_at is null and not exists (select 1 from public.comprobantes c where c.pago_id = p.id)
  ) x;
  item := 'pendientes'; titulo := 'Movimientos y abonos del mes contabilizados'; ok := v_n = 0;
  detalle := case when ok then null else v_n || ' sin contabilizar (Configuración → Contabilizarlos)' end;
  return next;

  select diferencia into v_valor from public.conciliacion_inventario();
  item := 'inventario'; titulo := 'Saldo del inventario (1435) igual a las existencias';
  ok := round(coalesce(v_valor, 0), 2) = 0;
  detalle := case when ok then null else 'Diferencia de ' || to_char(v_valor, 'FM999G999G999G990D00') || ' (al día de hoy)' end;
  return next;

  select count(*) into v_n from public.activos_fijos a
  where public._cuota_depreciacion(a, p_anio, p_mes) > 0
    and not exists (select 1 from public.depreciaciones d where d.activo_id = a.id and d.anio = p_anio and d.mes = p_mes);
  item := 'depreciacion'; titulo := 'Depreciación del mes registrada'; ok := v_n = 0;
  detalle := case when ok then null else v_n || ' activo(s) sin depreciar' end;
  return next;

  select count(*) into v_n from public.recurrentes_pendientes(p_anio, p_mes);
  item := 'recurrentes'; titulo := 'Gastos recurrentes del mes confirmados'; ok := v_n = 0;
  detalle := case when ok then null else v_n || ' sin confirmar' end;
  return next;

  select string_agg(t.nombre, ', ' order by t.nombre) into v_bancos
  from public.cuentas_tesoreria t
  where t.tipo = 'banco'
    and exists (
      select 1 from public.asientos a join public.comprobantes c on c.id = a.comprobante_id
      where a.cuenta = t.cuenta and c.fecha between v_desde and v_hasta and c.tipo <> 'SI'
    )
    and not exists (
      select 1 from public.extractos e where e.cuenta_tesoreria_id = t.id and e.anio = p_anio and e.mes = p_mes and e.cerrado
    );
  item := 'bancos'; titulo := 'Conciliación bancaria de cada banco cerrada'; ok := v_bancos is null;
  detalle := case when ok then null else 'Falta: ' || v_bancos end;
  return next;
end;
$$;

-- ---------------------------------------------------------------------
-- Documentos pendientes de un tercero en una cuenta (base de las edades y
-- del flujo proyectado): los pagos se aplican primero a lo más antiguo
-- ---------------------------------------------------------------------
create or replace function public._documentos_pendientes(p_cuenta text, p_hasta date)
returns table (clase text, tercero_id uuid, vence date, pendiente numeric)
language sql
stable
set search_path = ''
as $$
  with signo as (
    select case naturaleza when 'debito' then 1 else -1 end as s from public.cuentas where codigo = p_cuenta
  ),
  lineas as (
    select
      case when a.cliente_id is not null then 'cliente' when a.proveedor_id is not null then 'proveedor' else 'tercero' end as clase,
      coalesce(a.cliente_id, a.proveedor_id, a.tercero_id) as tercero_id,
      (a.debito - a.credito) * (select s from signo) as valor,
      c.fecha,
      coalesce(m.vence, c.fecha + coalesce(cl.dias_credito, pr.dias_credito, 0)) as vence,
      c.created_at
    from public.asientos a
    join public.comprobantes c on c.id = a.comprobante_id
    left join public.movimientos m on m.id = c.movimiento_id and c.tipo = 'MI'
    left join public.clientes cl on cl.id = a.cliente_id
    left join public.proveedores pr on pr.id = a.proveedor_id
    where a.cuenta like p_cuenta || '%' and c.fecha <= p_hasta
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
  )
  select d.clase, d.tercero_id, d.vence,
    greatest(least(d.valor, d.acumulado - coalesce(p.pagado, 0)), 0)
  from documentos d
  left join pagado p on p.clase = d.clase and p.tercero_id = d.tercero_id
  where greatest(least(d.valor, d.acumulado - coalesce(p.pagado, 0)), 0) > 0;
$$;

revoke execute on function public._documentos_pendientes from public, anon, authenticated;

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
  v_hasta date := coalesce(p_hasta, public.hoy_colombia());
begin
  if not public.ver_contabilidad() then
    raise exception 'No tienes permisos para ver la contabilidad' using errcode = '42501';
  end if;
  if not exists (select 1 from public.cuentas where codigo = p_cuenta) then
    raise exception 'La cuenta % no existe', p_cuenta;
  end if;

  return query
  select x.clase, x.tercero_id,
    coalesce(cl.nombre, pr.nombre, te.nombre),
    coalesce(cl.documento, pr.nit, te.documento),
    sum(x.pendiente) filter (where v_hasta <= x.vence),
    sum(x.pendiente) filter (where v_hasta - x.vence between 1 and 30),
    sum(x.pendiente) filter (where v_hasta - x.vence between 31 and 60),
    sum(x.pendiente) filter (where v_hasta - x.vence between 61 and 90),
    sum(x.pendiente) filter (where v_hasta - x.vence > 90),
    sum(x.pendiente)
  from public._documentos_pendientes(p_cuenta, v_hasta) x
  left join public.clientes cl on x.clase = 'cliente' and cl.id = x.tercero_id
  left join public.proveedores pr on x.clase = 'proveedor' and pr.id = x.tercero_id
  left join public.terceros te on x.clase = 'tercero' and te.id = x.tercero_id
  group by x.clase, x.tercero_id, cl.nombre, pr.nombre, te.nombre, cl.documento, pr.nit, te.documento
  order by sum(x.pendiente) desc;
end;
$$;

-- ---------------------------------------------------------------------
-- Flujo de efectivo del período: entradas y salidas de cajas y bancos por
-- concepto (los traslados entre ellos no cuentan)
-- ---------------------------------------------------------------------
create or replace function public.flujo_efectivo(p_desde date, p_hasta date)
returns table (concepto text, entradas numeric, salidas numeric)
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
  select
    case
      when c.tipo = 'RC' then 'Cobros a clientes'
      when c.tipo = 'MI' then 'Ventas de contado y devoluciones'
      when c.tipo = 'RA' then 'Anticipos de clientes'
      when c.tipo = 'CE' and e.clase = 'proveedor' then 'Pagos a proveedores'
      when c.tipo in ('CE', 'GA') then 'Gastos y otros pagos'
      when c.tipo = 'CF' then 'Cambios de forma de pago'
      when c.tipo = 'SI' then 'Saldos iniciales'
      else 'Comprobantes contables'
    end,
    coalesce(sum(a.debito), 0), coalesce(sum(a.credito), 0)
  from public.asientos a
  join public.comprobantes c on c.id = a.comprobante_id
  left join public.egresos e on e.id = c.egreso_id
  where a.cuenta like '11%' and c.fecha between p_desde and p_hasta and c.tipo <> 'TR'
  group by 1
  order by 2 desc, 3 desc;
end;
$$;

-- Flujo de caja proyectado por semanas: lo que se espera cobrar (cartera) y pagar (proveedores, gastos por pagar,
-- recurrentes sin confirmar). Lo vencido se espera en la primera semana.
create or replace function public.flujo_proyectado(p_semanas integer default 8)
returns table (semana integer, desde date, hasta date, cobros numeric, pagos numeric)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_hoy date := public.hoy_colombia();
  v_semanas integer := least(greatest(coalesce(p_semanas, 8), 1), 26);
begin
  if not public.ver_contabilidad() then
    raise exception 'No tienes permisos para ver la contabilidad' using errcode = '42501';
  end if;

  return query
  with semanas as (
    select s, v_hoy + (s - 1) * 7 as d, v_hoy + s * 7 - 1 as h from generate_series(1, v_semanas) s
  ),
  esperado as (
    select greatest(vence, v_hoy) as fecha, pendiente as cobro, 0::numeric as pago
    from public._documentos_pendientes(public._cuenta('clientes'), v_hoy)
    union all
    select greatest(vence, v_hoy), 0, pendiente
    from public._documentos_pendientes(public._cuenta('compras_por_pagar'), v_hoy)
    union all
    select greatest(vence, v_hoy), 0, pendiente
    from public._documentos_pendientes(public._cuenta('gastos_por_pagar'), v_hoy)
    union all
    -- Recurrentes: cada mes del horizonte que aún no se confirma
    -- (si el día de este mes ya pasó sin confirmarlo, se espera en la primera semana)
    select greatest(make_date(extract(year from m)::integer, extract(month from m)::integer, r.dia), v_hoy), 0, r.valor
    from public.gastos_recurrentes r
    cross join generate_series(date_trunc('month', v_hoy), v_hoy + v_semanas * 7, interval '1 month') m
    where r.activo
      and not exists (
        select 1 from public.gastos g
        where g.recurrente_id = r.id and g.mes_recurrente = m::date and g.anulado_at is null
      )
  )
  select x.s, x.d, x.h, coalesce(sum(e.cobro), 0), coalesce(sum(e.pago), 0)
  from semanas x
  left join esperado e on e.fecha between x.d and x.h
  group by x.s, x.d, x.h
  order by x.s;
end;
$$;

revoke execute on function public.asientos_sin_conciliar, public.base_ica, public.retenciones_a_favor, public.conciliar_automatico, public.importar_extracto,
  public.conciliar_linea, public.estado_conciliacion, public.cerrar_conciliacion, public.checklist_cierre,
  public.edades_por_tercero, public.flujo_efectivo, public.flujo_proyectado from public, anon;
grant execute on function public.asientos_sin_conciliar, public.base_ica, public.retenciones_a_favor, public.conciliar_automatico, public.importar_extracto,
  public.conciliar_linea, public.estado_conciliacion, public.cerrar_conciliacion, public.checklist_cierre,
  public.edades_por_tercero, public.flujo_efectivo, public.flujo_proyectado to authenticated;
