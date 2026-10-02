-- =====================================================================
-- 0024: contabilidad, fase 3 (ventas, cartera y cuentas por pagar)
--
-- Net&Sec no es responsable de IVA: la venta ya registrada en la app (con
-- su factura electrónica, emitida por fuera) es la factura. No se crea un
-- documento aparte; la venta contabiliza también el ingreso:
--   venta a crédito      D 130505 cliente / C 4135 ventas
--   venta de contado     D 110505 caja    / C 4135 ventas
--   (además del costo, que ya registraba la 0023, en el mismo comprobante)
--   devolución           D 4175 devoluciones / C 130505 cliente (o caja)
--   anulación de venta   D 4135 (4175 si la venta es anterior al arranque)
--                        / C 130505 cliente (o caja)
--   abono (recibo, RC)   D 110505 caja (efectivo) o 111005 bancos
--                        D 135515 retención que practicó el cliente
--                        / C 130505 cliente
--   nota crédito (NC)    D 4175 / C 130505 cliente
--   nota débito (ND)     D 130505 cliente / C 4135
--   cambio de forma de pago (CF): reclasifica caja ↔ cliente
--
-- Además:
--   - CUFE de la factura electrónica (o CUDE del proveedor) en ventas y
--     entradas.
--   - Notas crédito y débito por valor (descuentos, ajustes de precio) en
--     ventas a crédito: NC-000001, ND-000001. Afectan la cartera.
--   - Retención en el abono: la cartera la descuenta del saldo.
--   - Datos de clientes y proveedores: plazo de pago, agente de retención,
--     responsable de IVA.
--   - Saldos por tercero de cualquier cuenta (cuentas por cobrar y por
--     pagar).
--   - Al crear la primera subcuenta de una cuenta que usan los asientos
--     automáticos, los parámetros pasan a la subcuenta nueva (así se crean
--     los auxiliares de cada banco).
-- =====================================================================

-- ---------------------------------------------------------------------
-- Columnas nuevas
-- ---------------------------------------------------------------------
alter table public.movimientos
  add column cufe text check (cufe ~ '^[0-9a-f]{96}$');

alter table public.pagos
  add column retencion numeric(14, 2) not null default 0 check (retencion >= 0);

alter table public.clientes
  add column dias_credito     smallint check (dias_credito between 0 and 365),
  add column agente_retencion boolean not null default false;

alter table public.proveedores
  add column dias_credito    smallint check (dias_credito between 0 and 365),
  add column responsable_iva boolean not null default false;

-- ---------------------------------------------------------------------
-- Notas crédito y débito de ventas
-- ---------------------------------------------------------------------
create table public.notas_venta (
  id               uuid primary key default gen_random_uuid(),
  tipo             text not null check (tipo in ('credito', 'debito')),
  numero           integer not null check (numero > 0),
  movimiento_id    uuid not null references public.movimientos (id) on delete restrict,
  fecha            date not null,
  valor            numeric(14, 2) not null check (valor > 0),
  motivo           text not null check (char_length(btrim(motivo)) between 5 and 300),
  cufe             text check (cufe ~ '^[0-9a-f]{96}$'),
  usuario_id       uuid references public.perfiles (id),
  created_at       timestamptz not null default now(),
  anulado_at       timestamptz,
  anulado_por      uuid references public.perfiles (id),
  motivo_anulacion text check (char_length(motivo_anulacion) <= 300),
  unique (tipo, numero)
);

create index notas_venta_movimiento_idx on public.notas_venta (movimiento_id);

alter table public.notas_venta enable row level security;
create policy "costos: lectura" on public.notas_venta
  for select to authenticated using ((select public.ver_costos()));
revoke insert, update, delete, truncate on public.notas_venta from anon, authenticated;
revoke all on public.notas_venta from anon;

-- Una venta con notas vigentes no se anula (su comprobante dejaría saldo en el cliente)
create or replace function public._no_anular_con_notas()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.anulado_at is not null and old.anulado_at is null
     and exists (select 1 from public.notas_venta where movimiento_id = new.id and anulado_at is null) then
    raise exception 'La venta tiene notas crédito o débito: anúlalas primero';
  end if;
  return new;
end;
$$;

revoke execute on function public._no_anular_con_notas from public, anon, authenticated;

create trigger movimientos_no_anular_con_notas
  before update of anulado_at on public.movimientos
  for each row execute function public._no_anular_con_notas();

-- ---------------------------------------------------------------------
-- Comprobantes: varios por movimiento (el MI y los cambios de forma de
-- pago), uno por abono y uno por nota
-- ---------------------------------------------------------------------
alter table public.comprobantes drop constraint comprobantes_movimiento_id_key;
create unique index comprobantes_movimiento_mi on public.comprobantes (movimiento_id) where tipo = 'MI';
create index comprobantes_movimiento_idx on public.comprobantes (movimiento_id) where movimiento_id is not null;

alter table public.comprobantes
  add column pago_id uuid references public.pagos (id) on delete restrict,
  add column nota_id uuid references public.notas_venta (id) on delete restrict;

-- El comprobante original del abono o de la nota (su anulación también los referencia)
create unique index comprobantes_pago on public.comprobantes (pago_id) where anula_id is null;
create unique index comprobantes_nota on public.comprobantes (nota_id) where anula_id is null;

insert into public.tipos_comprobante (codigo, nombre, manual) values
  ('RC', 'Recibo de caja', false),
  ('NC', 'Nota crédito', false),
  ('ND', 'Nota débito', false),
  ('CF', 'Cambio de forma de pago', false);

insert into public.parametros_contables (clave, nombre, cuenta) values
  ('bancos', 'Bancos (abonos por transferencia, tarjeta o cheque)', '111005'),
  ('retencion_a_favor', 'Retención en la fuente que practican los clientes', '135515');

-- ---------------------------------------------------------------------
-- Primera subcuenta de una cuenta de los parámetros: los parámetros pasan a ella
-- ---------------------------------------------------------------------
create or replace function public._validar_cuenta_nueva()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  -- En un trigger BEFORE la columna generada padre todavía no está calculada
  v_padre text := public.padre_cuenta(new.codigo);
begin
  if v_padre is not null and not exists (select 1 from public.cuentas where codigo = v_padre) then
    raise exception 'La cuenta % no existe: crea primero la cuenta padre', v_padre;
  end if;
  if exists (select 1 from public.asientos where cuenta = v_padre) then
    raise exception 'La cuenta % ya tiene movimientos: no se le pueden crear subcuentas', v_padre;
  end if;
  return new;
end;
$$;

create or replace function public._parametros_a_subcuenta()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  update public.parametros_contables set cuenta = new.codigo where cuenta = new.padre;
  return null;
end;
$$;

create trigger cuentas_parametros_a_subcuenta
  after insert on public.cuentas
  for each row execute function public._parametros_a_subcuenta();

revoke execute on function public._parametros_a_subcuenta from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Cartera: también descuenta retenciones y notas
-- ---------------------------------------------------------------------
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
  (t.total - d.devuelto - p.pagado - p.retenido - n.credito + n.debito)::numeric(14, 2) as saldo,
  greatest(current_date - m.vence, 0)                as dias_vencida,
  p.retenido,
  n.credito as notas_credito,
  n.debito as notas_debito
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
  select coalesce(sum(pg.valor), 0)::numeric(14, 2) as pagado,
         coalesce(sum(pg.retencion), 0)::numeric(14, 2) as retenido
  from public.pagos pg
  where pg.movimiento_id = m.id and pg.anulado_at is null
) p
cross join lateral (
  select coalesce(sum(nv.valor) filter (where nv.tipo = 'credito'), 0)::numeric(14, 2) as credito,
         coalesce(sum(nv.valor) filter (where nv.tipo = 'debito'), 0)::numeric(14, 2) as debito
  from public.notas_venta nv
  where nv.movimiento_id = m.id and nv.anulado_at is null
) n
where m.credito and m.anulado_at is null and (select public.ver_costos());

-- ---------------------------------------------------------------------
-- Valores de una venta
-- ---------------------------------------------------------------------
create or replace function public._valor_venta(p_movimiento_id uuid)
returns numeric
language sql
stable
set search_path = ''
as $$
  select coalesce(round(sum(cantidad * coalesce(precio_unitario, 0)), 2), 0)
  from public.movimiento_items
  where movimiento_id = p_movimiento_id;
$$;

-- Lo devuelto, al precio promedio al que cada producto salió en la venta (igual que la cartera)
create or replace function public._valor_devolucion(p_devolucion_id uuid)
returns numeric
language sql
stable
set search_path = ''
as $$
  select coalesce(round(sum(di.cantidad * coalesce((
    select sum(vi.cantidad * coalesce(vi.precio_unitario, 0)) / nullif(sum(vi.cantidad), 0)
    from public.movimiento_items vi
    where vi.movimiento_id = dm.movimiento_origen_id and vi.producto_id = di.producto_id
  ), 0)), 2), 0)
  from public.movimientos dm
  join public.movimiento_items di on di.movimiento_id = dm.id
  where dm.id = p_devolucion_id;
$$;

-- Fecha contable de algo que pasa hoy o en una fecha dada: debe ser desde el arranque
create or replace function public._validar_fecha_arranque(p_fecha date, p_que text)
returns boolean
language plpgsql
stable
set search_path = ''
as $$
declare
  v_inicio date;
begin
  select fecha_inicio into v_inicio from public.configuracion_contable;
  if v_inicio is null then
    return false; -- la contabilidad no ha arrancado: no se contabiliza
  end if;
  if p_fecha < v_inicio then
    raise exception 'La contabilidad arranca el %: no se registran % con fecha anterior', to_char(v_inicio, 'DD/MM/YYYY'), p_que;
  end if;
  return true;
end;
$$;

-- Crea un comprobante automático con sus líneas (nada si no hay líneas)
create or replace function public._comprobante_automatico(
  p_tipo        text,
  p_fecha       date,
  p_descripcion text,
  p_lineas      jsonb,
  p_movimiento  uuid default null,
  p_pago        uuid default null,
  p_nota        uuid default null
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if p_lineas is null or jsonb_array_length(p_lineas) = 0 then
    return null;
  end if;
  perform public._periodo_abierto(p_fecha);
  insert into public.comprobantes (tipo, numero, fecha, descripcion, movimiento_id, pago_id, nota_id, usuario_id)
  values (p_tipo, public._siguiente_comprobante(p_tipo), p_fecha, left(p_descripcion, 300), p_movimiento, p_pago, p_nota, auth.uid())
  returning id into v_id;
  perform public._insertar_asientos(v_id, p_lineas);
  return v_id;
end;
$$;

-- Par débito/crédito por un valor (vacío si el valor es 0)
create or replace function public._par(p_debe text, p_haber text, p_valor numeric, p_tercero_debe jsonb default '{}', p_tercero_haber jsonb default '{}')
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select case when coalesce(p_valor, 0) = 0 then '[]'::jsonb else jsonb_build_array(
    jsonb_build_object('cuenta', p_debe, 'debito', p_valor) || p_tercero_debe,
    jsonb_build_object('cuenta', p_haber, 'credito', p_valor) || p_tercero_haber
  ) end;
$$;

-- Revierte un comprobante automático (débitos ↔ créditos) con fecha de hoy
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

  insert into public.comprobantes (tipo, numero, fecha, descripcion, anula_id, movimiento_id, pago_id, nota_id, usuario_id)
  values (
    v_comp.tipo, public._siguiente_comprobante(v_comp.tipo), v_fecha,
    left('Anulación de ' || public.etiqueta_comprobante(v_comp.tipo, v_comp.numero) || ': ' || btrim(p_motivo), 300),
    p_id, v_comp.movimiento_id, v_comp.pago_id, v_comp.nota_id, auth.uid()
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

revoke execute on function public._valor_venta, public._valor_devolucion, public._validar_fecha_arranque,
  public._comprobante_automatico, public._par, public._revertir_comprobante from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Comprobante MI de un movimiento: costo (0023) + ingreso de las ventas
-- ---------------------------------------------------------------------
create or replace function public._contabilizar_movimiento(p_movimiento_id uuid)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_mov       public.movimientos;
  v_original  public.movimientos;
  v_origen    public.movimientos;
  v_fecha     date;
  v_costo     numeric;
  v_ingreso   numeric;
  v_debe      text;
  v_haber     text;
  v_proveedor uuid;
  v_etiqueta  text;
  v_concepto  text;
  v_lineas    jsonb := '[]';
  v_cliente   jsonb;
begin
  -- registrar_venta difiere el comprobante hasta guardar la forma de pago
  if coalesce(current_setting('netsec.diferir_contabilidad', true), '') = 'on' then
    return null;
  end if;
  select * into v_mov from public.movimientos where id = p_movimiento_id;
  v_fecha := (v_mov.fecha at time zone 'America/Bogota')::date;
  if exists (select 1 from public.comprobantes where movimiento_id = p_movimiento_id and tipo = 'MI') then
    return null;
  end if;
  if not public._validar_fecha_arranque(v_fecha, 'movimientos') then
    return null;
  end if;

  if v_mov.anula_id is not null then
    select * into v_original from public.movimientos where id = v_mov.anula_id;
  end if;
  if v_mov.movimiento_origen_id is not null then
    select * into v_origen from public.movimientos where id = v_mov.movimiento_origen_id;
  end if;

  v_costo := public._valor_movimiento(p_movimiento_id);

  if v_mov.tipo = 'entrada' then
    v_debe := public._cuenta('inventario');
    v_haber := public._cuenta('compras_por_pagar');
    v_proveedor := v_mov.proveedor_id;
    v_concepto := 'Entrada';
  elsif v_mov.tipo = 'salida' then
    v_debe := public._cuenta('costo_ventas');
    v_haber := public._cuenta('inventario');
    v_concepto := 'Venta';
    -- Ingreso: contra el cliente si es a crédito, contra la caja si es de contado
    v_ingreso := public._valor_venta(p_movimiento_id);
    v_lineas := v_lineas || case when v_mov.credito
      then public._par(public._cuenta('clientes'), public._cuenta('ventas'), v_ingreso, jsonb_build_object('cliente_id', v_mov.cliente_id))
      else public._par(public._cuenta('caja'), public._cuenta('ventas'), v_ingreso)
    end;
  elsif v_mov.tipo = 'ajuste_entrada' then
    v_debe := public._cuenta('inventario');
    v_haber := public._cuenta(case
      when v_original.tipo = 'salida' then 'costo_ventas'
      when v_mov.motivo = 'inventario_inicial' then 'inventario_inicial'
      when v_mov.motivo = 'devolucion_cliente' then 'costo_ventas'
      when v_mov.motivo = 'regreso_garantia' then 'garantias_clientes'
      else 'sobrantes_inventario'
    end);
    v_concepto := case when v_original.id is not null then 'Anulación de venta' else 'Ajuste +' end;

    if v_original.tipo = 'salida' then
      -- Anular la venta reversa su ingreso (contra 4175 si la venta no se contabilizó: es de antes del arranque)
      v_ingreso := public._valor_venta(v_original.id);
      v_cliente := case when v_original.credito then jsonb_build_object('cliente_id', v_original.cliente_id) else '{}' end;
      v_lineas := v_lineas || public._par(
        public._cuenta(case when exists (
          select 1 from public.comprobantes where movimiento_id = v_original.id and tipo = 'MI'
        ) then 'ventas' else 'devoluciones_ventas' end),
        public._cuenta(case when v_original.credito then 'clientes' else 'caja' end),
        v_ingreso, '{}', v_cliente);
    elsif v_mov.motivo = 'devolucion_cliente' and v_origen.id is not null then
      v_ingreso := public._valor_devolucion(p_movimiento_id);
      v_cliente := case when v_origen.credito then jsonb_build_object('cliente_id', v_origen.cliente_id) else '{}' end;
      v_lineas := v_lineas || public._par(
        public._cuenta('devoluciones_ventas'),
        public._cuenta(case when v_origen.credito then 'clientes' else 'caja' end),
        v_ingreso, '{}', v_cliente);
    end if;
  else
    v_debe := public._cuenta(case
      when v_original.tipo = 'entrada' then 'compras_por_pagar'
      when v_mov.motivo = 'obsequio' then 'obsequios'
      when v_mov.motivo = 'envio_garantia' then 'garantias_clientes'
      when v_mov.motivo = 'uso_interno' then 'uso_interno'
      else 'faltantes_inventario'
    end);
    v_haber := public._cuenta('inventario');
    v_proveedor := v_original.proveedor_id;
    v_concepto := case when v_original.id is not null then 'Anulación de entrada' else 'Ajuste −' end;
  end if;

  v_etiqueta := 'Net' || public.serie_movimiento(v_mov.tipo) || '-' || lpad(v_mov.numero::text, 6, '0');
  if v_mov.motivo is not null and v_original.id is null then
    v_concepto := v_concepto || ' (' || replace(v_mov.motivo::text, '_', ' ') || ')';
  end if;

  if v_proveedor is null and public._cuenta('compras_por_pagar') in (v_debe, v_haber)
     and exists (select 1 from public.cuentas where codigo = public._cuenta('compras_por_pagar') and exige_tercero) then
    raise exception 'La entrada % no tiene proveedor: indícalo para poder contabilizarla', v_etiqueta;
  end if;

  -- El costo va primero
  v_lineas := public._par(
    v_debe, v_haber, v_costo,
    case when v_debe = public._cuenta('compras_por_pagar') then jsonb_build_object('proveedor_id', v_proveedor) else '{}' end,
    case when v_haber = public._cuenta('compras_por_pagar') then jsonb_build_object('proveedor_id', v_proveedor) else '{}' end
  ) || v_lineas;

  return public._comprobante_automatico('MI', v_fecha, v_concepto || ' ' || v_etiqueta, v_lineas, p_movimiento_id);
end;
$$;

revoke execute on function public._contabilizar_movimiento from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Ventas: el comprobante se genera después de guardar la forma de pago
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

  perform set_config('netsec.diferir_contabilidad', 'on', true);
  v_mov_id := public.registrar_movimiento(
    p_tipo       => 'salida',
    p_items      => p_items,
    p_bodega_id  => p_bodega_id,
    p_cliente_id => p_cliente_id,
    p_referencia => p_referencia,
    p_notas      => p_notas,
    p_fecha      => p_fecha
  );
  perform set_config('netsec.diferir_contabilidad', 'off', true);

  update public.movimientos
  set credito = coalesce(p_credito, false),
      vence = case when coalesce(p_credito, false) then p_vence end,
      cotizacion_id = p_cotizacion_id
  where id = v_mov_id;

  if p_cotizacion_id is not null then
    update public.cotizaciones set estado = 'aceptada', cerrada_at = now() where id = p_cotizacion_id;
  end if;

  perform public._contabilizar_movimiento(v_mov_id);
  return v_mov_id;
end;
$$;

-- ---------------------------------------------------------------------
-- Cambiar la forma de pago: si la venta ya se contabilizó, reclasifica lo
-- que falta por cobrar entre la caja y el cliente
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
  v_mov   public.movimientos;
  v_valor numeric;
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
  else
    if exists (select 1 from public.pagos where movimiento_id = p_movimiento_id and anulado_at is null) then
      raise exception 'La venta tiene abonos: anúlalos antes de pasarla a contado';
    end if;
    if exists (select 1 from public.notas_venta where movimiento_id = p_movimiento_id and anulado_at is null) then
      raise exception 'La venta tiene notas crédito o débito: anúlalas antes de pasarla a contado';
    end if;
  end if;

  update public.movimientos
  set credito = p_credito, vence = case when p_credito then p_vence end
  where id = p_movimiento_id;

  -- Reclasificación contable (solo si la venta se contabilizó y la forma de pago cambió)
  if p_credito <> v_mov.credito
     and exists (select 1 from public.comprobantes where movimiento_id = p_movimiento_id and tipo = 'MI') then
    select public._valor_venta(p_movimiento_id) - coalesce(sum(public._valor_devolucion(d.id)), 0) into v_valor
    from public.movimientos d
    where d.movimiento_origen_id = p_movimiento_id;

    perform public._comprobante_automatico(
      'CF', public.hoy_colombia(),
      'Venta NetS-' || lpad(v_mov.numero::text, 6, '0') || case when p_credito then ' pasa a crédito' else ' pasa a contado' end,
      case when p_credito
        then public._par(public._cuenta('clientes'), public._cuenta('caja'), v_valor, jsonb_build_object('cliente_id', v_mov.cliente_id))
        else public._par(public._cuenta('caja'), public._cuenta('clientes'), v_valor, '{}', jsonb_build_object('cliente_id', v_mov.cliente_id))
      end,
      p_movimiento_id
    );
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- Abonos: con la retención que practique el cliente, y su recibo de caja
-- ---------------------------------------------------------------------
create or replace function public._contabilizar_pago(p_pago_id uuid)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_pago  public.pagos;
  v_mov   public.movimientos;
  v_fecha date;
  v_cliente jsonb;
begin
  select * into v_pago from public.pagos where id = p_pago_id;
  select * into v_mov from public.movimientos where id = v_pago.movimiento_id;
  v_fecha := (v_pago.fecha at time zone 'America/Bogota')::date;
  if exists (select 1 from public.comprobantes where pago_id = p_pago_id)
     or not public._validar_fecha_arranque(v_fecha, 'abonos') then
    return null;
  end if;
  v_cliente := jsonb_build_object('cliente_id', v_mov.cliente_id);

  return public._comprobante_automatico(
    'RC', v_fecha,
    'Abono a la venta NetS-' || lpad(v_mov.numero::text, 6, '0'),
    jsonb_build_array(
      jsonb_build_object('cuenta', public._cuenta(case when v_pago.metodo = 'efectivo' then 'caja' else 'bancos' end),
        'debito', v_pago.valor, 'descripcion', coalesce(v_pago.referencia, v_pago.metodo::text))
    )
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

drop function public.registrar_pago(uuid, numeric, public.metodo_pago, timestamptz, text, text);

create function public.registrar_pago(
  p_movimiento_id uuid,
  p_valor         numeric,
  p_metodo        public.metodo_pago,
  p_fecha         timestamptz default null,
  p_referencia    text default null,
  p_notas         text default null,
  p_retencion     numeric default 0
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

  select saldo into v_saldo from public.cartera where id = p_movimiento_id;
  if round(p_valor, 2) + v_retencion > coalesce(v_saldo, 0) then
    raise exception 'El abono (con la retención) supera el saldo de la venta (%)', to_char(coalesce(v_saldo, 0), 'FM999G999G999G990D00');
  end if;

  insert into public.pagos (movimiento_id, fecha, valor, metodo, referencia, notas, retencion)
  values (
    p_movimiento_id, coalesce(p_fecha, now()), round(p_valor, 2), p_metodo,
    nullif(btrim(p_referencia), ''), nullif(btrim(p_notas), ''), v_retencion
  )
  returning id into v_id;

  perform public._contabilizar_pago(v_id);
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
  v_comp uuid;
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

  select id into v_comp from public.comprobantes where pago_id = p_id and anula_id is null;
  if v_comp is not null then
    perform public._revertir_comprobante(v_comp, p_motivo);
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- Notas crédito y débito por valor (ventas a crédito)
-- ---------------------------------------------------------------------
create or replace function public.registrar_nota_venta(
  p_movimiento_id uuid,
  p_tipo          text,
  p_valor         numeric,
  p_motivo        text,
  p_fecha         date default null,
  p_cufe          text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_mov    public.movimientos;
  v_saldo  numeric;
  v_valor  numeric := round(coalesce(p_valor, 0), 2);
  v_fecha  date := coalesce(p_fecha, public.hoy_colombia());
  v_numero integer;
  v_id     uuid;
  v_prefijo text := case p_tipo when 'credito' then 'NC' when 'debito' then 'ND' end;
  v_cliente jsonb;
begin
  if not public.lleva_contabilidad() then
    raise exception 'Solo un administrador o la contadora registran notas' using errcode = '42501';
  end if;
  if v_prefijo is null then
    raise exception 'Tipo de nota inválido';
  end if;
  if char_length(btrim(coalesce(p_motivo, ''))) < 5 then
    raise exception 'Explica el motivo de la nota';
  end if;
  if v_valor <= 0 then
    raise exception 'El valor de la nota debe ser mayor que cero';
  end if;
  if v_fecha > public.hoy_colombia() then
    raise exception 'La fecha de la nota no puede ser futura';
  end if;

  select * into v_mov from public.movimientos where id = p_movimiento_id for update;
  if not found or v_mov.tipo <> 'salida' then
    raise exception 'La venta no existe';
  end if;
  if v_mov.anulado_at is not null then
    raise exception 'La venta está anulada';
  end if;
  if not v_mov.credito then
    raise exception 'Las notas se registran sobre ventas a crédito';
  end if;
  if v_fecha < (v_mov.fecha at time zone 'America/Bogota')::date then
    raise exception 'La nota no puede ser anterior a la venta';
  end if;
  if p_tipo = 'credito' then
    select saldo into v_saldo from public.cartera where id = p_movimiento_id;
    if v_valor > coalesce(v_saldo, 0) then
      raise exception 'La nota crédito supera el saldo de la venta (%)', to_char(coalesce(v_saldo, 0), 'FM999G999G999G990D00');
    end if;
  end if;

  perform pg_advisory_xact_lock(hashtext('notas_venta.numero.' || p_tipo));
  select coalesce(max(numero), 0) + 1 into v_numero from public.notas_venta where tipo = p_tipo;

  insert into public.notas_venta (tipo, numero, movimiento_id, fecha, valor, motivo, cufe, usuario_id)
  values (p_tipo, v_numero, p_movimiento_id, v_fecha, v_valor, btrim(p_motivo), nullif(lower(btrim(p_cufe)), ''), auth.uid())
  returning id into v_id;

  if public._validar_fecha_arranque(v_fecha, 'notas') then
    v_cliente := jsonb_build_object('cliente_id', v_mov.cliente_id);
    perform public._comprobante_automatico(
      v_prefijo, v_fecha,
      v_prefijo || '-' || lpad(v_numero::text, 6, '0') || ' a la venta NetS-' || lpad(v_mov.numero::text, 6, '0') || ': ' || btrim(p_motivo),
      case when p_tipo = 'credito'
        then public._par(public._cuenta('devoluciones_ventas'), public._cuenta('clientes'), v_valor, '{}', v_cliente)
        else public._par(public._cuenta('clientes'), public._cuenta('ventas'), v_valor, v_cliente)
      end,
      p_movimiento_id, null, v_id
    );
  end if;
  return v_id;
end;
$$;

create or replace function public.anular_nota_venta(p_id uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_nota  public.notas_venta;
  v_saldo numeric;
  v_comp  uuid;
begin
  if not public.lleva_contabilidad() then
    raise exception 'Solo un administrador o la contadora anulan notas' using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(p_motivo, ''))) < 5 then
    raise exception 'Explica el motivo de la anulación';
  end if;
  select * into v_nota from public.notas_venta where id = p_id for update;
  if not found then
    raise exception 'La nota no existe';
  end if;
  if v_nota.anulado_at is not null then
    raise exception 'La nota ya está anulada';
  end if;
  perform 1 from public.movimientos where id = v_nota.movimiento_id for update;
  -- Anular una nota débito baja el saldo: no puede quedar por debajo de lo ya abonado
  if v_nota.tipo = 'debito' then
    select saldo into v_saldo from public.cartera where id = v_nota.movimiento_id;
    if coalesce(v_saldo, 0) < v_nota.valor then
      raise exception 'Los abonos ya cubren esa nota débito: anula primero los abonos';
    end if;
  end if;

  update public.notas_venta
  set anulado_at = now(), anulado_por = auth.uid(), motivo_anulacion = btrim(p_motivo)
  where id = p_id;

  select id into v_comp from public.comprobantes where nota_id = p_id and anula_id is null;
  if v_comp is not null then
    perform public._revertir_comprobante(v_comp, p_motivo);
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- CUFE de la factura electrónica (venta) o CUDE del proveedor (entrada)
-- ---------------------------------------------------------------------
create or replace function public.definir_cufe(p_movimiento_id uuid, p_cufe text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_mov  public.movimientos;
  v_cufe text := nullif(lower(btrim(p_cufe)), '');
begin
  if not public.puede_operar() then
    raise exception 'No tienes permisos para editar movimientos' using errcode = '42501';
  end if;
  select * into v_mov from public.movimientos where id = p_movimiento_id for update;
  if not found or v_mov.tipo not in ('salida', 'entrada') then
    raise exception 'El CUFE solo aplica a ventas y entradas';
  end if;
  -- Bodega lo registra una vez; corregirlo es de admin
  if v_mov.cufe is not null and not public.es_admin() then
    raise exception 'El CUFE ya está registrado: solo un administrador lo corrige' using errcode = '42501';
  end if;
  if v_cufe is not null and v_cufe !~ '^[0-9a-f]{96}$' then
    raise exception 'El CUFE tiene 96 caracteres (números y letras de la a a la f)';
  end if;
  update public.movimientos set cufe = v_cufe where id = p_movimiento_id;
end;
$$;

-- ---------------------------------------------------------------------
-- Saldos por tercero de una cuenta (y sus subcuentas) a una fecha:
-- cuentas por cobrar (130505), por pagar (2205), retenciones...
-- ---------------------------------------------------------------------
create or replace function public.saldos_por_tercero(p_cuenta text, p_hasta date)
returns table (
  clase     text,
  tercero_id uuid,
  nombre    text,
  documento text,
  debitos   numeric,
  creditos  numeric,
  saldo     numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_signo integer;
begin
  if not public.ver_contabilidad() then
    raise exception 'No tienes permisos para ver la contabilidad' using errcode = '42501';
  end if;
  select case naturaleza when 'debito' then 1 else -1 end into v_signo from public.cuentas where codigo = p_cuenta;
  if v_signo is null then
    raise exception 'La cuenta % no existe', p_cuenta;
  end if;

  return query
  select
    case when a.cliente_id is not null then 'cliente' when a.proveedor_id is not null then 'proveedor'
         when a.tercero_id is not null then 'tercero' else 'sin_tercero' end,
    coalesce(a.cliente_id, a.proveedor_id, a.tercero_id),
    coalesce(max(cl.nombre), max(pr.nombre), max(te.nombre), 'Sin tercero'),
    coalesce(max(cl.documento), max(pr.nit), max(te.documento)),
    sum(a.debito), sum(a.credito),
    sum(a.debito - a.credito) * v_signo
  from public.asientos a
  join public.comprobantes c on c.id = a.comprobante_id
  left join public.clientes cl on cl.id = a.cliente_id
  left join public.proveedores pr on pr.id = a.proveedor_id
  left join public.terceros te on te.id = a.tercero_id
  where a.cuenta like p_cuenta || '%' and c.fecha <= p_hasta
  group by 1, 2
  having sum(a.debito - a.credito) <> 0
  order by 7 desc;
end;
$$;

-- ---------------------------------------------------------------------
-- Pendientes: también abonos y notas registrados antes de definir el arranque
-- ---------------------------------------------------------------------
create or replace function public.contabilizar_movimientos_pendientes()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inicio date;
  v_fila   record;
  v_n      integer := 0;
  v_mov    public.movimientos;
  v_cliente jsonb;
begin
  if not public.lleva_contabilidad() then
    raise exception 'Solo la contadora o un administrador contabilizan movimientos' using errcode = '42501';
  end if;
  select fecha_inicio into v_inicio from public.configuracion_contable;
  if v_inicio is null then
    raise exception 'Define primero la fecha de arranque de la contabilidad';
  end if;

  -- En orden de registro: movimientos, abonos y notas mezclados
  for v_fila in
    select 'movimiento' as que, m.id, m.created_at from public.movimientos m
    where (m.fecha at time zone 'America/Bogota')::date >= v_inicio
      and not exists (select 1 from public.comprobantes c where c.movimiento_id = m.id and c.tipo = 'MI')
    union all
    select 'pago', p.id, p.created_at from public.pagos p
    where (p.fecha at time zone 'America/Bogota')::date >= v_inicio and p.anulado_at is null
      and not exists (select 1 from public.comprobantes c where c.pago_id = p.id)
    union all
    select 'nota', n.id, n.created_at from public.notas_venta n
    where n.fecha >= v_inicio and n.anulado_at is null
      and not exists (select 1 from public.comprobantes c where c.nota_id = n.id)
    order by 3
  loop
    if v_fila.que = 'movimiento' then
      if public._contabilizar_movimiento(v_fila.id) is not null then v_n := v_n + 1; end if;
    elsif v_fila.que = 'pago' then
      if public._contabilizar_pago(v_fila.id) is not null then v_n := v_n + 1; end if;
    else
      select m.* into v_mov from public.movimientos m join public.notas_venta n on n.movimiento_id = m.id where n.id = v_fila.id;
      v_cliente := jsonb_build_object('cliente_id', v_mov.cliente_id);
      perform public._comprobante_automatico(
        case n.tipo when 'credito' then 'NC' else 'ND' end, n.fecha,
        case n.tipo when 'credito' then 'NC' else 'ND' end || '-' || lpad(n.numero::text, 6, '0')
          || ' a la venta NetS-' || lpad(v_mov.numero::text, 6, '0') || ': ' || n.motivo,
        case when n.tipo = 'credito'
          then public._par(public._cuenta('devoluciones_ventas'), public._cuenta('clientes'), n.valor, '{}', v_cliente)
          else public._par(public._cuenta('clientes'), public._cuenta('ventas'), n.valor, v_cliente)
        end,
        n.movimiento_id, null, n.id
      )
      from public.notas_venta n where n.id = v_fila.id;
      v_n := v_n + 1;
    end if;
  end loop;
  return v_n;
end;
$$;

revoke execute on function public.registrar_pago, public.registrar_nota_venta, public.anular_nota_venta,
  public.definir_cufe, public.saldos_por_tercero from public, anon;
grant execute on function public.registrar_pago, public.registrar_nota_venta, public.anular_nota_venta,
  public.definir_cufe, public.saldos_por_tercero to authenticated;
