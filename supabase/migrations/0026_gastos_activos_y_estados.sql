-- =====================================================================
-- 0026: contabilidad, fase 5 (gastos, activos fijos, estados financieros
-- y cierres)
--
-- - Categorías de gasto (arriendo, servicios, transporte...) con su
--   cuenta del PUC: quien registra un gasto no necesita saber
--   contabilidad.
-- - Gastos (GA-): pagados (D gasto / C caja o banco) o por pagar (D gasto
--   / C 2335 a nombre del beneficiario); los por pagar se pagan después
--   con un egreso.
-- - Gastos recurrentes: arriendo, internet... Cada mes aparecen como
--   pendientes y se confirman con un clic.
-- - Activos fijos con depreciación en línea recta: cada mes, D 5260 / C
--   1592 (comprobante DP). La depreciación acumulada antes del arranque se
--   indica al registrar el activo.
-- - Estado de resultados y estado de situación financiera.
-- - Cierre anual (CI): lleva los saldos de ingresos, gastos y costos
--   (clases 4, 5 y 6) a la utilidad del ejercicio (3605).
-- - Lista de chequeo del cierre mensual: cerrar_periodo() revisa el
--   cuadre, lo pendiente de contabilizar, el inventario, la depreciación
--   y los gastos recurrentes; si algo falla, solo cierra si se fuerza.
-- =====================================================================

insert into public.tipos_comprobante (codigo, nombre, manual) values
  ('GA', 'Gasto', false),
  ('DP', 'Depreciación', false),
  ('CI', 'Cierre del ejercicio', false);

insert into public.parametros_contables (clave, nombre, cuenta) values
  ('gastos_por_pagar', 'Gastos por pagar', '2335'),
  ('gasto_depreciacion', 'Gasto de depreciación', '5260'),
  ('depreciacion_acumulada', 'Depreciación acumulada', '1592');

-- ---------------------------------------------------------------------
-- Categorías de gasto
-- ---------------------------------------------------------------------
create table public.categorias_gasto (
  id         uuid primary key default gen_random_uuid(),
  nombre     text not null unique check (char_length(btrim(nombre)) between 2 and 80),
  cuenta     text not null references public.cuentas (codigo),
  activa     boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger categorias_gasto_updated_at
  before update on public.categorias_gasto
  for each row execute function public.set_updated_at();
create trigger auditoria_categorias_gasto
  after insert or update or delete on public.categorias_gasto
  for each row execute function public.registrar_auditoria();

-- La cuenta de una categoría debe recibir movimientos
create or replace function public._validar_cuenta_hoja()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not public.cuenta_es_hoja(new.cuenta) then
    raise exception 'La cuenta % tiene subcuentas: elige una de último nivel', new.cuenta;
  end if;
  return new;
end;
$$;

revoke execute on function public._validar_cuenta_hoja from public, anon, authenticated;

create trigger categorias_gasto_cuenta_hoja
  before insert or update of cuenta on public.categorias_gasto
  for each row execute function public._validar_cuenta_hoja();

insert into public.categorias_gasto (nombre, cuenta) values
  ('Arriendo', '5120'),
  ('Servicios públicos', '5135'),
  ('Internet y telefonía', '5135'),
  ('Nómina', '5105'),
  ('Transporte y fletes', '519595'),
  ('Papelería y útiles', '519595'),
  ('Aseo y cafetería', '519595'),
  ('Gastos bancarios', '5305'),
  ('Otros gastos', '519595');

-- ---------------------------------------------------------------------
-- Gastos recurrentes y gastos
-- ---------------------------------------------------------------------
create table public.gastos_recurrentes (
  id                  uuid primary key default gen_random_uuid(),
  nombre              text not null unique check (char_length(btrim(nombre)) between 2 and 100),
  categoria_id        uuid not null references public.categorias_gasto (id),
  proveedor_id        uuid references public.proveedores (id),
  tercero_id          uuid references public.terceros (id),
  valor               numeric(14, 2) not null check (valor > 0),
  dia                 smallint not null default 1 check (dia between 1 and 28),
  -- Si se paga siempre desde la misma caja o banco; vacío = queda por pagar
  cuenta_tesoreria_id uuid references public.cuentas_tesoreria (id),
  activo              boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  check (num_nonnulls(proveedor_id, tercero_id) <= 1)
);

create trigger gastos_recurrentes_updated_at
  before update on public.gastos_recurrentes
  for each row execute function public.set_updated_at();
create trigger auditoria_gastos_recurrentes
  after insert or update or delete on public.gastos_recurrentes
  for each row execute function public.registrar_auditoria();

create table public.gastos (
  id                  uuid primary key default gen_random_uuid(),
  numero              integer not null unique check (numero > 0),
  fecha               date not null,
  categoria_id        uuid not null references public.categorias_gasto (id),
  cuenta              text not null references public.cuentas (codigo),
  proveedor_id        uuid references public.proveedores (id),
  tercero_id          uuid references public.terceros (id),
  descripcion         text not null check (char_length(btrim(descripcion)) between 3 and 300),
  valor               numeric(14, 2) not null check (valor > 0),
  -- Pagado al registrarlo: de esta caja o banco. Si es null, queda por pagar (2335)
  cuenta_tesoreria_id uuid references public.cuentas_tesoreria (id),
  -- Pago posterior de un gasto por pagar
  egreso_id           uuid unique references public.egresos (id),
  recurrente_id       uuid references public.gastos_recurrentes (id),
  mes_recurrente      date,
  referencia          text check (char_length(referencia) <= 100),
  usuario_id          uuid references public.perfiles (id),
  created_at          timestamptz not null default now(),
  anulado_at          timestamptz,
  anulado_por         uuid references public.perfiles (id),
  motivo_anulacion    text check (char_length(motivo_anulacion) <= 300),
  check (num_nonnulls(proveedor_id, tercero_id) <= 1),
  check ((recurrente_id is null) = (mes_recurrente is null))
);

create index gastos_fecha_idx on public.gastos (fecha desc);
-- Un recurrente se confirma una vez por mes (si se anula, se puede confirmar de nuevo)
create unique index gastos_recurrente_mes on public.gastos (recurrente_id, mes_recurrente) where anulado_at is null;

alter table public.comprobantes
  add column gasto_id uuid references public.gastos (id) on delete restrict;
create unique index comprobantes_gasto on public.comprobantes (gasto_id) where anula_id is null;

-- ---------------------------------------------------------------------
-- Activos fijos y depreciación
-- ---------------------------------------------------------------------
create table public.activos_fijos (
  id                    uuid primary key default gen_random_uuid(),
  nombre                text not null check (char_length(btrim(nombre)) between 2 and 150),
  cuenta                text not null references public.cuentas (codigo),
  fecha_compra          date not null,
  costo                 numeric(14, 2) not null check (costo > 0),
  valor_residual        numeric(14, 2) not null default 0 check (valor_residual >= 0),
  vida_util_meses       smallint not null check (vida_util_meses between 1 and 600),
  -- Lo que ya se había depreciado antes del arranque de la contabilidad
  depreciacion_inicial  numeric(14, 2) not null default 0 check (depreciacion_inicial >= 0),
  serial                text check (char_length(serial) <= 100),
  notas                 text check (char_length(notas) <= 500),
  fecha_baja            date,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  check (valor_residual + depreciacion_inicial <= costo),
  check (fecha_baja is null or fecha_baja >= fecha_compra)
);

create trigger activos_fijos_updated_at
  before update on public.activos_fijos
  for each row execute function public.set_updated_at();
create trigger auditoria_activos_fijos
  after insert or update or delete on public.activos_fijos
  for each row execute function public.registrar_auditoria();
create trigger activos_fijos_cuenta_hoja
  before insert or update of cuenta on public.activos_fijos
  for each row execute function public._validar_cuenta_hoja();

create table public.depreciaciones (
  id             uuid primary key default gen_random_uuid(),
  activo_id      uuid not null references public.activos_fijos (id) on delete restrict,
  anio           smallint not null,
  mes            smallint not null check (mes between 1 and 12),
  valor          numeric(14, 2) not null check (valor > 0),
  comprobante_id uuid not null references public.comprobantes (id) on delete restrict,
  unique (activo_id, anio, mes)
);

-- Lo que ya se depreció no se cambia: solo nombre, serial, notas y la baja
create or replace function public._proteger_activo()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (select 1 from public.depreciaciones where activo_id = old.id)
     and (new.costo, new.valor_residual, new.vida_util_meses, new.depreciacion_inicial, new.fecha_compra, new.cuenta)
         is distinct from (old.costo, old.valor_residual, old.vida_util_meses, old.depreciacion_inicial, old.fecha_compra, old.cuenta) then
    raise exception 'El activo ya tiene depreciaciones: su costo, vida útil y fechas no se cambian';
  end if;
  return new;
end;
$$;

revoke execute on function public._proteger_activo from public, anon, authenticated;

create trigger activos_fijos_proteger
  before update on public.activos_fijos
  for each row execute function public._proteger_activo();

-- ---------------------------------------------------------------------
-- Seguridad
-- ---------------------------------------------------------------------
alter table public.categorias_gasto   enable row level security;
alter table public.gastos_recurrentes enable row level security;
alter table public.gastos             enable row level security;
alter table public.activos_fijos      enable row level security;
alter table public.depreciaciones     enable row level security;

create policy "contabilidad: lectura" on public.categorias_gasto for select to authenticated using ((select public.ver_contabilidad()));
create policy "contabilidad: crea" on public.categorias_gasto for insert to authenticated with check ((select public.lleva_contabilidad()));
create policy "contabilidad: edita" on public.categorias_gasto for update to authenticated
  using ((select public.lleva_contabilidad())) with check ((select public.lleva_contabilidad()));

create policy "contabilidad: lectura" on public.gastos_recurrentes for select to authenticated using ((select public.ver_contabilidad()));
create policy "contabilidad: crea" on public.gastos_recurrentes for insert to authenticated with check ((select public.lleva_contabilidad()));
create policy "contabilidad: edita" on public.gastos_recurrentes for update to authenticated
  using ((select public.lleva_contabilidad())) with check ((select public.lleva_contabilidad()));

create policy "contabilidad: lectura" on public.gastos for select to authenticated using ((select public.ver_contabilidad()));

create policy "contabilidad: lectura" on public.activos_fijos for select to authenticated using ((select public.ver_contabilidad()));
create policy "contabilidad: crea" on public.activos_fijos for insert to authenticated with check ((select public.lleva_contabilidad()));
create policy "contabilidad: edita" on public.activos_fijos for update to authenticated
  using ((select public.lleva_contabilidad())) with check ((select public.lleva_contabilidad()));

create policy "contabilidad: lectura" on public.depreciaciones for select to authenticated using ((select public.ver_contabilidad()));

revoke delete, truncate on public.categorias_gasto, public.gastos_recurrentes, public.activos_fijos from anon, authenticated;
revoke insert, update, delete, truncate on public.gastos, public.depreciaciones from anon, authenticated;
revoke all on public.categorias_gasto, public.gastos_recurrentes, public.gastos, public.activos_fijos,
  public.depreciaciones from anon;

-- _revertir_comprobante (0025) copia también el enlace al gasto
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
    tipo, numero, fecha, descripcion, anula_id, movimiento_id, pago_id, nota_id, egreso_id, traslado_id,
    anticipo_id, gasto_id, usuario_id
  )
  values (
    v_comp.tipo, public._siguiente_comprobante(v_comp.tipo), v_fecha,
    left('Anulación de ' || public.etiqueta_comprobante(v_comp.tipo, v_comp.numero) || ': ' || btrim(p_motivo), 300),
    p_id, v_comp.movimiento_id, v_comp.pago_id, v_comp.nota_id, v_comp.egreso_id, v_comp.traslado_id,
    v_comp.anticipo_id, v_comp.gasto_id, auth.uid()
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
-- Registrar, pagar y anular un gasto
-- ---------------------------------------------------------------------
create or replace function public.registrar_gasto(
  p_fecha               date,
  p_categoria_id        uuid,
  p_valor               numeric,
  p_descripcion         text,
  p_cuenta_tesoreria_id uuid default null,
  p_proveedor_id        uuid default null,
  p_tercero_id          uuid default null,
  p_referencia          text default null,
  p_recurrente_id       uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_categoria public.categorias_gasto;
  v_valor     numeric := round(coalesce(p_valor, 0), 2);
  v_numero    integer;
  v_id        uuid;
  v_comp      uuid;
  v_tercero   jsonb;
  v_haber     text;
begin
  if not public.lleva_contabilidad() then
    raise exception 'Solo un administrador o la contadora registran gastos' using errcode = '42501';
  end if;
  select * into v_categoria from public.categorias_gasto where id = p_categoria_id and activa;
  if not found then
    raise exception 'La categoría no existe o está inactiva';
  end if;
  if v_valor <= 0 then
    raise exception 'El valor debe ser mayor que cero';
  end if;
  if char_length(btrim(coalesce(p_descripcion, ''))) < 3 then
    raise exception 'Describe el gasto';
  end if;
  if p_fecha is null or p_fecha > public.hoy_colombia() then
    raise exception 'La fecha del gasto no puede ser futura';
  end if;
  if num_nonnulls(p_proveedor_id, p_tercero_id) > 1 then
    raise exception 'Indica un solo beneficiario';
  end if;
  if p_cuenta_tesoreria_id is null and num_nonnulls(p_proveedor_id, p_tercero_id) = 0 then
    raise exception 'Un gasto por pagar necesita el beneficiario (a quién se le debe)';
  end if;
  perform public._exigir_arranque(p_fecha, 'gastos');

  v_tercero := case
    when p_proveedor_id is not null then jsonb_build_object('proveedor_id', p_proveedor_id)
    when p_tercero_id is not null then jsonb_build_object('tercero_id', p_tercero_id)
    else '{}'
  end;
  v_haber := case when p_cuenta_tesoreria_id is null
    then public._cuenta('gastos_por_pagar')
    else public._cuenta_tesoreria(p_cuenta_tesoreria_id)
  end;

  v_numero := public._siguiente_documento('gastos');
  insert into public.gastos (
    numero, fecha, categoria_id, cuenta, proveedor_id, tercero_id, descripcion, valor, cuenta_tesoreria_id,
    recurrente_id, mes_recurrente, referencia, usuario_id
  )
  values (
    v_numero, p_fecha, p_categoria_id, v_categoria.cuenta, p_proveedor_id, p_tercero_id, btrim(p_descripcion), v_valor,
    p_cuenta_tesoreria_id, p_recurrente_id, case when p_recurrente_id is not null then date_trunc('month', p_fecha)::date end,
    nullif(btrim(p_referencia), ''), auth.uid()
  )
  returning id into v_id;

  v_comp := public._comprobante_automatico(
    'GA', p_fecha, 'GA-' || lpad(v_numero::text, 6, '0') || ': ' || btrim(p_descripcion),
    jsonb_build_array(
      jsonb_build_object('cuenta', v_categoria.cuenta, 'debito', v_valor) || v_tercero,
      jsonb_build_object('cuenta', v_haber, 'credito', v_valor)
        || case when p_cuenta_tesoreria_id is null then v_tercero else '{}' end
    )
  );
  update public.comprobantes set gasto_id = v_id where id = v_comp;
  return v_id;
end;
$$;

-- Paga un gasto por pagar con un comprobante de egreso (D 2335 / C caja o banco)
create or replace function public.pagar_gasto(
  p_gasto_id            uuid,
  p_cuenta_tesoreria_id uuid,
  p_fecha               date,
  p_metodo              public.metodo_pago,
  p_referencia          text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_gasto  public.gastos;
  v_egreso uuid;
begin
  if not public.lleva_contabilidad() then
    raise exception 'Solo un administrador o la contadora pagan gastos' using errcode = '42501';
  end if;
  select * into v_gasto from public.gastos where id = p_gasto_id for update;
  if not found or v_gasto.anulado_at is not null then
    raise exception 'El gasto no existe o está anulado';
  end if;
  -- Si el egreso que lo pagó se anuló, el gasto vuelve a estar por pagar
  if v_gasto.cuenta_tesoreria_id is not null
     or exists (select 1 from public.egresos where id = v_gasto.egreso_id and anulado_at is null) then
    raise exception 'El gasto ya está pagado';
  end if;
  if p_fecha < v_gasto.fecha then
    raise exception 'El pago no puede ser anterior al gasto';
  end if;

  v_egreso := public.registrar_egreso(
    p_fecha => p_fecha,
    p_clase => 'otro',
    p_cuenta_tesoreria_id => p_cuenta_tesoreria_id,
    p_valor => v_gasto.valor,
    p_metodo => p_metodo,
    p_concepto => 'Pago de GA-' || lpad(v_gasto.numero::text, 6, '0') || ': ' || v_gasto.descripcion,
    p_proveedor_id => v_gasto.proveedor_id,
    p_tercero_id => v_gasto.tercero_id,
    p_cuenta => public._cuenta('gastos_por_pagar'),
    p_referencia => p_referencia
  );
  update public.gastos set egreso_id = v_egreso where id = p_gasto_id;
  return v_egreso;
end;
$$;

create or replace function public.anular_gasto(p_id uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_gasto public.gastos;
  v_comp  uuid;
begin
  if not public.lleva_contabilidad() then
    raise exception 'Solo un administrador o la contadora anulan gastos' using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(p_motivo, ''))) < 5 then
    raise exception 'Explica el motivo de la anulación';
  end if;
  select * into v_gasto from public.gastos where id = p_id for update;
  if not found then
    raise exception 'El gasto no existe';
  end if;
  if v_gasto.anulado_at is not null then
    raise exception 'El gasto ya está anulado';
  end if;
  if v_gasto.egreso_id is not null
     and exists (select 1 from public.egresos where id = v_gasto.egreso_id and anulado_at is null) then
    raise exception 'El gasto ya se pagó: anula primero el egreso CE-%',
      lpad((select numero::text from public.egresos where id = v_gasto.egreso_id), 6, '0');
  end if;

  update public.gastos
  set anulado_at = now(), anulado_por = auth.uid(), motivo_anulacion = btrim(p_motivo),
      egreso_id = null
  where id = p_id;

  select id into v_comp from public.comprobantes where gasto_id = p_id and anula_id is null;
  if v_comp is not null then
    perform public._revertir_comprobante(v_comp, p_motivo);
  end if;
end;
$$;

-- Recurrentes activos sin confirmar en un mes
create or replace function public.recurrentes_pendientes(p_anio integer, p_mes integer)
returns table (id uuid, nombre text, categoria text, valor numeric, dia smallint, fecha date)
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
  select r.id, r.nombre, c.nombre, r.valor, r.dia, make_date(p_anio, p_mes, r.dia)
  from public.gastos_recurrentes r
  join public.categorias_gasto c on c.id = r.categoria_id
  where r.activo
    and r.created_at::date <= (make_date(p_anio, p_mes, 1) + interval '1 month' - interval '1 day')::date
    and not exists (
      select 1 from public.gastos g
      where g.recurrente_id = r.id and g.mes_recurrente = make_date(p_anio, p_mes, 1) and g.anulado_at is null
    )
  order by r.dia, r.nombre;
end;
$$;

-- Confirma el recurrente de un mes: registra el gasto (con el valor indicado, o el habitual)
create or replace function public.confirmar_recurrente(p_id uuid, p_anio integer, p_mes integer, p_valor numeric default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rec   public.gastos_recurrentes;
  v_fecha date;
begin
  select * into v_rec from public.gastos_recurrentes where id = p_id and activo;
  if not found then
    raise exception 'El gasto recurrente no existe o está inactivo';
  end if;
  v_fecha := least(make_date(p_anio, p_mes, v_rec.dia), public.hoy_colombia());
  if v_fecha < make_date(p_anio, p_mes, 1) then
    raise exception 'Ese mes aún no empieza';
  end if;
  return public.registrar_gasto(
    p_fecha => v_fecha,
    p_categoria_id => v_rec.categoria_id,
    p_valor => coalesce(p_valor, v_rec.valor),
    p_descripcion => v_rec.nombre || ' · ' || to_char(make_date(p_anio, p_mes, 1), 'MM/YYYY'),
    p_cuenta_tesoreria_id => v_rec.cuenta_tesoreria_id,
    p_proveedor_id => v_rec.proveedor_id,
    p_tercero_id => v_rec.tercero_id,
    p_recurrente_id => p_id
  );
end;
$$;

-- ---------------------------------------------------------------------
-- Depreciación del mes (línea recta, desde el mes siguiente a la compra)
-- ---------------------------------------------------------------------
create or replace function public._cuota_depreciacion(p_activo public.activos_fijos, p_anio integer, p_mes integer)
returns numeric
language sql
stable
set search_path = ''
as $$
  select case
    when make_date(p_anio, p_mes, 1) <= date_trunc('month', p_activo.fecha_compra)::date then 0
    when p_activo.fecha_baja is not null and p_activo.fecha_baja < make_date(p_anio, p_mes, 1) then 0
    else greatest(least(
      round((p_activo.costo - p_activo.valor_residual) / p_activo.vida_util_meses, 2),
      p_activo.costo - p_activo.valor_residual - p_activo.depreciacion_inicial
        - coalesce((select sum(d.valor) from public.depreciaciones d where d.activo_id = p_activo.id), 0)
    ), 0)
  end;
$$;

revoke execute on function public._cuota_depreciacion from public, anon, authenticated;

create or replace function public.depreciar_mes(p_anio integer, p_mes integer)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_fin    date := (make_date(p_anio, p_mes, 1) + interval '1 month' - interval '1 day')::date;
  v_activo public.activos_fijos;
  v_cuota  numeric;
  v_lineas jsonb := '[]';
  v_cuotas jsonb := '[]';
  v_comp   uuid;
  v_c      jsonb;
begin
  if not public.lleva_contabilidad() then
    raise exception 'Solo un administrador o la contadora registran la depreciación' using errcode = '42501';
  end if;
  if make_date(p_anio, p_mes, 1) > public.hoy_colombia() then
    raise exception 'Ese mes aún no empieza';
  end if;
  perform public._exigir_arranque(make_date(p_anio, p_mes, 1), 'depreciaciones');

  for v_activo in
    select a.* from public.activos_fijos a
    where not exists (select 1 from public.depreciaciones d where d.activo_id = a.id and d.anio = p_anio and d.mes = p_mes)
    order by a.nombre
    for update
  loop
    v_cuota := public._cuota_depreciacion(v_activo, p_anio, p_mes);
    if v_cuota > 0 then
      v_lineas := v_lineas || public._par(
        public._cuenta('gasto_depreciacion'), public._cuenta('depreciacion_acumulada'), v_cuota
      );
      v_lineas := jsonb_set(v_lineas, array[(jsonb_array_length(v_lineas) - 2)::text, 'descripcion'], to_jsonb(v_activo.nombre));
      v_lineas := jsonb_set(v_lineas, array[(jsonb_array_length(v_lineas) - 1)::text, 'descripcion'], to_jsonb(v_activo.nombre));
      v_cuotas := v_cuotas || jsonb_build_object('activo_id', v_activo.id, 'valor', v_cuota);
    end if;
  end loop;

  if jsonb_array_length(v_cuotas) = 0 then
    return 0;
  end if;

  v_comp := public._comprobante_automatico(
    'DP', v_fin, 'Depreciación de ' || to_char(make_date(p_anio, p_mes, 1), 'MM/YYYY'), v_lineas
  );
  for v_c in select * from jsonb_array_elements(v_cuotas) loop
    insert into public.depreciaciones (activo_id, anio, mes, valor, comprobante_id)
    values ((v_c ->> 'activo_id')::uuid, p_anio, p_mes, (v_c ->> 'valor')::numeric, v_comp);
  end loop;
  return jsonb_array_length(v_cuotas);
end;
$$;

-- ---------------------------------------------------------------------
-- Estados financieros
-- ---------------------------------------------------------------------
-- Saldos por cuenta (con sus padres) en un rango, sin el comprobante de cierre si se pide
create or replace function public._saldos_cuentas(p_desde date, p_hasta date, p_clases text[], p_sin_cierre boolean)
returns table (codigo text, nombre text, nivel smallint, naturaleza public.naturaleza_cuenta, valor numeric)
language sql
stable
set search_path = ''
as $$
  with por_hoja as (
    select a.cuenta, sum(a.debito - a.credito) as neto
    from public.asientos a
    join public.comprobantes c on c.id = a.comprobante_id
    where c.fecha between coalesce(p_desde, '2000-01-01') and p_hasta
      and left(a.cuenta, 1) = any (p_clases)
      and not (p_sin_cierre and c.tipo = 'CI')
    group by a.cuenta
  ),
  acumulado as (
    select left(h.cuenta, l.largo) as codigo, sum(h.neto) as neto
    from por_hoja h
    cross join (values (1), (2), (4), (6), (8), (10)) as l (largo)
    where l.largo <= char_length(h.cuenta)
    group by 1
  )
  select cu.codigo, cu.nombre, cu.nivel, cu.naturaleza,
    case cu.naturaleza when 'debito' then x.neto else -x.neto end
  from acumulado x
  join public.cuentas cu on cu.codigo = x.codigo
  where x.neto <> 0
  order by cu.codigo;
$$;

revoke execute on function public._saldos_cuentas from public, anon, authenticated;

-- Ingresos, gastos y costos de un período (sin el cierre anual)
create or replace function public.estado_resultados(p_desde date, p_hasta date)
returns table (codigo text, nombre text, nivel smallint, naturaleza public.naturaleza_cuenta, valor numeric)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.ver_contabilidad() then
    raise exception 'No tienes permisos para ver la contabilidad' using errcode = '42501';
  end if;
  if p_desde is null or p_hasta is null or p_desde > p_hasta then
    raise exception 'Rango de fechas inválido';
  end if;
  return query select * from public._saldos_cuentas(p_desde, p_hasta, array['4', '5', '6'], true);
end;
$$;

-- Activos, pasivos y patrimonio a una fecha. El resultado aún sin cerrar va
-- como una fila aparte (código «resultado») dentro del patrimonio.
create or replace function public.situacion_financiera(p_hasta date)
returns table (codigo text, nombre text, nivel smallint, naturaleza public.naturaleza_cuenta, valor numeric)
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
  select * from public._saldos_cuentas(null, p_hasta, array['1', '2', '3'], false)
  union all
  select 'resultado', 'Resultado del ejercicio sin cerrar', 2::smallint, 'credito'::public.naturaleza_cuenta,
    coalesce(sum(a.credito - a.debito), 0)
  from public.asientos a
  join public.comprobantes c on c.id = a.comprobante_id
  where c.fecha <= p_hasta and left(a.cuenta, 1) in ('4', '5', '6')
  having coalesce(sum(a.credito - a.debito), 0) <> 0;
end;
$$;

-- ---------------------------------------------------------------------
-- Cierre anual: clases 4, 5 y 6 a la utilidad del ejercicio (3605)
-- ---------------------------------------------------------------------
create or replace function public.cierre_anual(p_anio integer)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inicio date;
  v_fin    date := make_date(p_anio, 12, 31);
  v_desde  date;
  v_lineas jsonb;
  v_neto   numeric;
  v_id     uuid;
begin
  if not public.lleva_contabilidad() then
    raise exception 'Solo un administrador o la contadora hacen el cierre anual' using errcode = '42501';
  end if;
  select fecha_inicio into v_inicio from public.configuracion_contable;
  if v_inicio is null or v_inicio > v_fin then
    raise exception 'La contabilidad no tiene movimientos en %', p_anio;
  end if;
  if exists (select 1 from public.comprobantes where tipo = 'CI' and fecha = v_fin and anulado_at is null and anula_id is null) then
    raise exception 'El año % ya está cerrado', p_anio;
  end if;
  -- De enero (o del arranque) a noviembre, todos los meses cerrados; diciembre abierto
  v_desde := greatest(make_date(p_anio, 1, 1), v_inicio);
  if exists (
    select 1 from generate_series(v_desde, make_date(p_anio, 11, 1), interval '1 month') g (mes)
    where not exists (
      select 1 from public.periodos p
      where p.anio = extract(year from g.mes) and p.mes = extract(month from g.mes) and p.cerrado
    )
  ) then
    raise exception 'Cierra primero los meses de % hasta noviembre', p_anio;
  end if;

  -- Saldo de cada cuenta de resultados al 31 de diciembre, en sentido contrario
  select jsonb_agg(case when s.neto > 0
      then jsonb_build_object('cuenta', s.cuenta, 'credito', s.neto)
      else jsonb_build_object('cuenta', s.cuenta, 'debito', -s.neto) end
    || coalesce(s.tercero, '{}') order by s.cuenta),
    sum(s.neto)
  into v_lineas, v_neto
  from (
    select a.cuenta,
      case when a.cliente_id is not null then jsonb_build_object('cliente_id', a.cliente_id)
           when a.proveedor_id is not null then jsonb_build_object('proveedor_id', a.proveedor_id)
           when a.tercero_id is not null then jsonb_build_object('tercero_id', a.tercero_id) end as tercero,
      sum(a.debito - a.credito) as neto
    from public.asientos a
    join public.comprobantes c on c.id = a.comprobante_id
    where c.fecha <= v_fin and left(a.cuenta, 1) in ('4', '5', '6')
    group by 1, 2
    having sum(a.debito - a.credito) <> 0
  ) s;

  if v_lineas is null then
    raise exception 'No hay ingresos, gastos ni costos que cerrar en %', p_anio;
  end if;
  -- La diferencia es la utilidad (crédito) o la pérdida (débito) del ejercicio
  if v_neto <> 0 then
    v_lineas := v_lineas || jsonb_build_array(case when v_neto > 0
      then jsonb_build_object('cuenta', public._cuenta('utilidad_ejercicio'), 'debito', v_neto, 'descripcion', 'Pérdida del ejercicio')
      else jsonb_build_object('cuenta', public._cuenta('utilidad_ejercicio'), 'credito', -v_neto, 'descripcion', 'Utilidad del ejercicio')
    end);
  end if;

  v_id := public._comprobante_automatico('CI', v_fin, 'Cierre del ejercicio ' || p_anio, v_lineas);
  return v_id;
end;
$$;

-- Deshace el cierre anual (diciembre debe estar abierto): comprobante inverso con la misma fecha
create or replace function public.anular_cierre_anual(p_anio integer, p_motivo text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_comp public.comprobantes;
  v_nuevo uuid;
begin
  if not public.lleva_contabilidad() then
    raise exception 'Solo un administrador o la contadora anulan el cierre anual' using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(p_motivo, ''))) < 5 then
    raise exception 'Explica el motivo';
  end if;
  select * into v_comp from public.comprobantes
  where tipo = 'CI' and fecha = make_date(p_anio, 12, 31) and anulado_at is null and anula_id is null
  for update;
  if not found then
    raise exception 'El año % no tiene cierre', p_anio;
  end if;
  perform public._periodo_abierto(v_comp.fecha);

  insert into public.comprobantes (tipo, numero, fecha, descripcion, anula_id, usuario_id)
  values ('CI', public._siguiente_comprobante('CI'), v_comp.fecha,
    left('Anulación del cierre ' || p_anio || ': ' || btrim(p_motivo), 300), v_comp.id, auth.uid())
  returning id into v_nuevo;
  insert into public.asientos (comprobante_id, linea, cuenta, cliente_id, proveedor_id, tercero_id, descripcion, debito, credito)
  select v_nuevo, linea, cuenta, cliente_id, proveedor_id, tercero_id, descripcion, credito, debito
  from public.asientos where comprobante_id = v_comp.id;
  update public.comprobantes set anulado_at = now(), anulado_por = auth.uid(), motivo_anulacion = btrim(p_motivo)
  where id = v_comp.id;
end;
$$;

-- ---------------------------------------------------------------------
-- Lista de chequeo del cierre mensual
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
end;
$$;

drop function public.cerrar_periodo(integer, integer);

create function public.cerrar_periodo(p_anio integer, p_mes integer, p_forzar boolean default false)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inicio  date;
  v_fecha   date;
  v_fallas  text;
begin
  if not public.lleva_contabilidad() then
    raise exception 'Solo la contadora o un administrador cierran periodos' using errcode = '42501';
  end if;
  select fecha_inicio into v_inicio from public.configuracion_contable;
  if v_inicio is null then
    raise exception 'Define primero la fecha de arranque de la contabilidad';
  end if;
  v_fecha := make_date(p_anio, p_mes, 1);
  if v_fecha < v_inicio then
    raise exception 'Ese mes es anterior al arranque de la contabilidad';
  end if;
  if v_fecha > date_trunc('month', public.hoy_colombia())::date then
    raise exception 'No se puede cerrar un mes que no ha empezado';
  end if;
  if v_fecha > v_inicio and not exists (
    select 1 from public.periodos
    where make_date(anio, mes, 1) = (v_fecha - interval '1 month')::date and cerrado
  ) then
    raise exception 'Cierra primero el mes anterior';
  end if;

  select string_agg(titulo || coalesce(' (' || detalle || ')', ''), '; ') into v_fallas
  from public.checklist_cierre(p_anio, p_mes)
  where not ok and (item = 'cuadre' or not coalesce(p_forzar, false));
  if v_fallas is not null then
    raise exception 'Antes de cerrar: %', v_fallas;
  end if;

  insert into public.periodos (anio, mes) values (p_anio, p_mes) on conflict do nothing;
  update public.periodos
  set cerrado = true, cerrado_por = auth.uid(), cerrado_at = now()
  where anio = p_anio and mes = p_mes and not cerrado;
  if not found then
    raise exception 'El periodo ya está cerrado';
  end if;
end;
$$;

revoke execute on function public.registrar_gasto, public.pagar_gasto, public.anular_gasto, public.recurrentes_pendientes,
  public.confirmar_recurrente, public.depreciar_mes, public.estado_resultados, public.situacion_financiera,
  public.cierre_anual, public.anular_cierre_anual, public.checklist_cierre, public.cerrar_periodo from public, anon;
grant execute on function public.registrar_gasto, public.pagar_gasto, public.anular_gasto, public.recurrentes_pendientes,
  public.confirmar_recurrente, public.depreciar_mes, public.estado_resultados, public.situacion_financiera,
  public.cierre_anual, public.anular_cierre_anual, public.checklist_cierre, public.cerrar_periodo to authenticated;
