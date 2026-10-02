-- =====================================================================
-- 0023: contabilidad, fase 2 (inventario contable)
--
-- 1. Costo PEPS (decisión de la contadora, reemplaza el costo promedio de
--    la 0009). Cada entrada y cada ajuste + crea una capa de costo con su
--    cantidad y su costo unitario (IVA incluido: Net&Sec no lo descuenta).
--    Cada salida y cada ajuste − consume primero las capas más antiguas de
--    su bodega; el costo de la línea es lo que consumió.
--      - Sobrante o inventario inicial sin costo: el de la última entrada.
--      - Devolución de cliente: el costo con el que salió en esa venta.
--      - Regreso de garantía: el costo con el que salió la unidad.
--      - Anular una venta: lo consumido vuelve a las mismas capas.
--      - Anular una entrada: solo si nada de su capa ha salido.
--    productos.precio_costo sigue sin editarse a mano: ahora es el costo
--    medio de lo que queda en las capas (stock × costo = valor).
--    Las capas se reconstruyen recorriendo el historial; los movimientos
--    ya registrados conservan su costo.
--
-- 2. Asientos automáticos. Desde la fecha de arranque, cada movimiento de
--    inventario genera su comprobante MI, en la misma transacción:
--      entrada                 D 1435 inventario / C 2205 proveedor
--      venta                   D 6135 costo de ventas / C 1435
--      sobrante, otro +        D 1435 / C 425095 sobrantes
--      inventario inicial      D 1435 / C 3105 (saldos iniciales)
--      devolución de cliente   D 1435 / C 6135
--      regreso de garantía     D 1435 / C 519540 garantías
--      faltante, daño, pérdida D 519535 faltantes / C 1435
--      obsequio                D 519545 obsequios / C 1435
--      envío a garantía        D 519540 garantías / C 1435
--      uso interno             D 519595 otros / C 1435
--      anulación de venta      D 1435 / C 6135
--      anulación de entrada    D 2205 proveedor / C 1435
--    Las cuentas salen de parametros_contables (Contabilidad →
--    Configuración). La entrada se lleva directo al proveedor: Net&Sec no
--    descuenta IVA ni practica retenciones, así que el costo de la entrada
--    es el total de la factura (cambio sobre el diseño, que proponía una
--    cuenta puente; a confirmar con la contadora).
--    Un movimiento con fecha de un mes cerrado no se puede registrar.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Capas de costo y consumos
-- ---------------------------------------------------------------------
create table public.capas_costo (
  id                 uuid primary key default gen_random_uuid(),
  producto_id        uuid not null references public.productos (id) on delete restrict,
  bodega_id          uuid not null references public.bodegas (id) on delete restrict,
  -- Línea (entrada o ajuste +) que creó la capa
  movimiento_item_id uuid not null unique references public.movimiento_items (id) on delete restrict,
  fecha              timestamptz not null,
  cantidad_inicial   integer not null check (cantidad_inicial > 0),
  cantidad_restante  integer not null check (cantidad_restante >= 0),
  costo_unitario     numeric(14, 2) not null check (costo_unitario >= 0),
  created_at         timestamptz not null default now(),
  check (cantidad_restante <= cantidad_inicial)
);

create index capas_costo_disponibles_idx on public.capas_costo (producto_id, bodega_id, fecha, created_at)
  where cantidad_restante > 0;

-- De qué capas salió cada línea. cantidad negativa = devuelta a la capa (anulación de una venta)
create table public.consumos_capa (
  id                 uuid primary key default gen_random_uuid(),
  movimiento_item_id uuid not null references public.movimiento_items (id) on delete restrict,
  capa_id            uuid not null references public.capas_costo (id) on delete restrict,
  cantidad           integer not null check (cantidad <> 0),
  costo_unitario     numeric(14, 2) not null
);

create index consumos_capa_item_idx on public.consumos_capa (movimiento_item_id);
create index consumos_capa_capa_idx on public.consumos_capa (capa_id);

alter table public.capas_costo   enable row level security;
alter table public.consumos_capa enable row level security;

create policy "costos: lectura" on public.capas_costo
  for select to authenticated using ((select public.ver_costos()));
create policy "costos: lectura" on public.consumos_capa
  for select to authenticated using ((select public.ver_costos()));

revoke insert, update, delete, truncate on public.capas_costo, public.consumos_capa from authenticated;
revoke all on public.capas_costo, public.consumos_capa from anon;

-- ---------------------------------------------------------------------
-- Funciones de las capas (uso interno)
-- ---------------------------------------------------------------------

-- Crea la capa de una línea que entra al inventario
create or replace function public._crear_capa(p_item_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
begin
  insert into public.capas_costo (producto_id, bodega_id, movimiento_item_id, fecha, cantidad_inicial, cantidad_restante, costo_unitario)
  select mi.producto_id, m.bodega_id, mi.id, m.fecha, mi.cantidad, mi.cantidad, coalesce(mi.costo_unitario, 0)
  from public.movimiento_items mi
  join public.movimientos m on m.id = mi.movimiento_id
  where mi.id = p_item_id;
end;
$$;

-- Toma p_cantidad de una capa y lo registra como consumo de la línea
create or replace function public._tomar_de_capa(p_item_id uuid, p_capa public.capas_costo, p_cantidad integer)
returns void
language plpgsql
set search_path = ''
as $$
begin
  update public.capas_costo set cantidad_restante = cantidad_restante - p_cantidad where id = p_capa.id;
  insert into public.consumos_capa (movimiento_item_id, capa_id, cantidad, costo_unitario)
  values (p_item_id, p_capa.id, p_cantidad, p_capa.costo_unitario);
end;
$$;

-- Fija el costo unitario de la línea con lo que consumió (o devolvió) de las capas
create or replace function public._costo_desde_consumos(p_item_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
begin
  update public.movimiento_items mi
  set costo_unitario = round(abs(c.valor) / mi.cantidad, 2)
  from (
    select sum(cantidad * costo_unitario) as valor from public.consumos_capa where movimiento_item_id = p_item_id
  ) c
  where mi.id = p_item_id and c.valor is not null;
end;
$$;

-- PEPS: la línea (salida o ajuste −) consume las capas más antiguas de su producto y bodega
create or replace function public._consumir_peps(p_item_id uuid, p_fijar_costo boolean default true)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_item   record;
  v_capa   public.capas_costo;
  v_falta  integer;
  v_toma   integer;
begin
  select mi.id, mi.producto_id, mi.cantidad, m.bodega_id, p.nombre into v_item
  from public.movimiento_items mi
  join public.movimientos m on m.id = mi.movimiento_id
  join public.productos p on p.id = mi.producto_id
  where mi.id = p_item_id;

  v_falta := v_item.cantidad;
  for v_capa in
    select * from public.capas_costo
    where producto_id = v_item.producto_id and bodega_id = v_item.bodega_id and cantidad_restante > 0
    order by fecha, created_at, id
    for update
  loop
    exit when v_falta = 0;
    v_toma := least(v_falta, v_capa.cantidad_restante);
    perform public._tomar_de_capa(p_item_id, v_capa, v_toma);
    v_falta := v_falta - v_toma;
  end loop;

  if v_falta > 0 then
    raise exception 'Las capas de costo de "%" no alcanzan para sacar % unidades', v_item.nombre, v_item.cantidad;
  end if;
  if p_fijar_costo then
    perform public._costo_desde_consumos(p_item_id);
  end if;
end;
$$;

-- Anulación de una entrada: la línea saca exactamente lo que creó la línea original.
-- p_estricto = false (solo al reconstruir el historial): lo que ya no esté en esa capa sale por PEPS.
create or replace function public._consumir_capa_de(p_item_id uuid, p_item_original uuid, p_estricto boolean default true)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_capa     public.capas_costo;
  v_cantidad integer;
  v_nombre   text;
  v_toma     integer;
begin
  select mi.cantidad, p.nombre into v_cantidad, v_nombre
  from public.movimiento_items mi join public.productos p on p.id = mi.producto_id
  where mi.id = p_item_id;
  select * into v_capa from public.capas_costo where movimiento_item_id = p_item_original for update;

  if p_estricto and (v_capa.id is null or v_capa.cantidad_restante < v_capa.cantidad_inicial) then
    raise exception 'Ya salió parte de "%" de esa entrada (PEPS): no se puede anular', v_nombre;
  end if;

  v_toma := least(v_cantidad, coalesce(v_capa.cantidad_restante, 0));
  if v_toma > 0 then
    perform public._tomar_de_capa(p_item_id, v_capa, v_toma);
  end if;
  if v_toma < v_cantidad then
    -- Solo sin p_estricto: el resto sale de las capas más antiguas
    perform public._consumir_resto(p_item_id, v_cantidad - v_toma);
  end if;
end;
$$;

-- Saca p_cantidad por PEPS a nombre de la línea (complemento de _consumir_capa_de)
create or replace function public._consumir_resto(p_item_id uuid, p_cantidad integer)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_item  record;
  v_capa  public.capas_costo;
  v_falta integer := p_cantidad;
  v_toma  integer;
begin
  select mi.producto_id, m.bodega_id, p.nombre into v_item
  from public.movimiento_items mi
  join public.movimientos m on m.id = mi.movimiento_id
  join public.productos p on p.id = mi.producto_id
  where mi.id = p_item_id;

  for v_capa in
    select * from public.capas_costo
    where producto_id = v_item.producto_id and bodega_id = v_item.bodega_id and cantidad_restante > 0
    order by fecha, created_at, id
    for update
  loop
    exit when v_falta = 0;
    v_toma := least(v_falta, v_capa.cantidad_restante);
    perform public._tomar_de_capa(p_item_id, v_capa, v_toma);
    v_falta := v_falta - v_toma;
  end loop;
  if v_falta > 0 then
    raise exception 'Las capas de costo de "%" no alcanzan', v_item.nombre;
  end if;
end;
$$;

-- Anulación de una venta: lo que consumió la línea original vuelve a las mismas capas
create or replace function public._revertir_consumos(p_item_original uuid, p_item_id uuid, p_fijar_costo boolean default true)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_consumo record;
begin
  for v_consumo in
    select capa_id, sum(cantidad)::integer as cantidad, max(costo_unitario) as costo_unitario
    from public.consumos_capa
    where movimiento_item_id = p_item_original
    group by capa_id
    having sum(cantidad) > 0
  loop
    update public.capas_costo set cantidad_restante = cantidad_restante + v_consumo.cantidad where id = v_consumo.capa_id;
    insert into public.consumos_capa (movimiento_item_id, capa_id, cantidad, costo_unitario)
    values (p_item_id, v_consumo.capa_id, -v_consumo.cantidad, v_consumo.costo_unitario);
  end loop;

  -- La línea original no tenía consumos (no debería pasar): lo que vuelve entra como capa nueva
  if not found then
    perform public._crear_capa(p_item_id);
  elsif p_fijar_costo then
    perform public._costo_desde_consumos(p_item_id);
  end if;
end;
$$;

-- Costo del producto: costo medio de lo que queda en sus capas (si no queda nada, se conserva)
create or replace function public._actualizar_costo_producto(p_producto_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_costo numeric;
begin
  select round(sum(cantidad_restante * costo_unitario) / nullif(sum(cantidad_restante), 0), 2) into v_costo
  from public.capas_costo
  where producto_id = p_producto_id and cantidad_restante > 0;

  if v_costo is not null then
    perform set_config('netsec.costo_automatico', 'on', true);
    update public.productos set precio_costo = v_costo where id = p_producto_id and precio_costo is distinct from v_costo;
    perform set_config('netsec.costo_automatico', 'off', true);
  end if;
end;
$$;

-- Costo para lo que entra sin costo (sobrantes, inventario inicial): el de la última entrada
create or replace function public._costo_ultima_entrada(p_producto_id uuid)
returns numeric
language sql
stable
set search_path = ''
as $$
  select coalesce(
    (select c.costo_unitario
     from public.capas_costo c
     join public.movimiento_items mi on mi.id = c.movimiento_item_id
     join public.movimientos m on m.id = mi.movimiento_id
     where c.producto_id = p_producto_id and m.tipo = 'entrada' and m.anulado_at is null
     order by c.fecha desc, c.created_at desc
     limit 1),
    (select precio_costo from public.productos where id = p_producto_id)
  );
$$;

revoke execute on function public._crear_capa, public._tomar_de_capa, public._costo_desde_consumos,
  public._consumir_peps, public._consumir_capa_de, public._consumir_resto, public._revertir_consumos,
  public._actualizar_costo_producto, public._costo_ultima_entrada from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Comprobantes de los movimientos de inventario
-- ---------------------------------------------------------------------
insert into public.tipos_comprobante (codigo, nombre, manual) values ('MI', 'Movimiento de inventario', false);

alter table public.comprobantes
  add column movimiento_id uuid unique references public.movimientos (id) on delete restrict;

insert into public.parametros_contables (clave, nombre, cuenta) values
  ('compras_por_pagar', 'Compras de mercancía por pagar (entradas)', '2205'),
  ('inventario_inicial', 'Contrapartida del inventario inicial', '3105');

create or replace function public._cuenta(p_clave text)
returns text
language plpgsql
stable
set search_path = ''
as $$
declare
  v_cuenta text;
begin
  select cuenta into v_cuenta from public.parametros_contables where clave = p_clave;
  if v_cuenta is null then
    raise exception 'Falta el parámetro contable "%"', p_clave;
  end if;
  return v_cuenta;
end;
$$;

-- Valor a costo de un movimiento: lo consumido de las capas o, si no hubo consumos, cantidad × costo
create or replace function public._valor_movimiento(p_movimiento_id uuid)
returns numeric
language sql
stable
set search_path = ''
as $$
  select coalesce(round(sum(coalesce(
    (select abs(sum(c.cantidad * c.costo_unitario)) from public.consumos_capa c where c.movimiento_item_id = mi.id),
    mi.cantidad * coalesce(mi.costo_unitario, 0)
  )), 2), 0)
  from public.movimiento_items mi
  where mi.movimiento_id = p_movimiento_id;
$$;

-- Genera el comprobante MI de un movimiento (si la contabilidad ya arrancó y aún no lo tiene)
create or replace function public._contabilizar_movimiento(p_movimiento_id uuid)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_mov       public.movimientos;
  v_original  public.movimientos;
  v_inicio    date;
  v_fecha     date;
  v_valor     numeric;
  v_debe      text;
  v_haber     text;
  v_proveedor uuid;
  v_etiqueta  text;
  v_concepto  text;
  v_id        uuid;
begin
  select fecha_inicio into v_inicio from public.configuracion_contable;
  select * into v_mov from public.movimientos where id = p_movimiento_id;
  v_fecha := (v_mov.fecha at time zone 'America/Bogota')::date;
  if v_inicio is null or exists (select 1 from public.comprobantes where movimiento_id = p_movimiento_id) then
    return null;
  end if;
  -- Un movimiento con fecha anterior al arranque cambiaría el inventario sin asiento
  if v_fecha < v_inicio then
    raise exception 'La contabilidad arranca el %: no se registran movimientos con fecha anterior',
      to_char(v_inicio, 'DD/MM/YYYY');
  end if;

  v_valor := public._valor_movimiento(p_movimiento_id);
  if v_valor = 0 then
    return null; -- sin costo no hay nada que contabilizar
  end if;

  if v_mov.anula_id is not null then
    select * into v_original from public.movimientos where id = v_mov.anula_id;
  end if;

  if v_mov.tipo = 'entrada' then
    v_debe := public._cuenta('inventario');
    v_haber := public._cuenta('compras_por_pagar');
    v_proveedor := v_mov.proveedor_id;
    v_concepto := 'Entrada';
  elsif v_mov.tipo = 'salida' then
    v_debe := public._cuenta('costo_ventas');
    v_haber := public._cuenta('inventario');
    v_concepto := 'Venta';
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

  if v_proveedor is null and exists (
    select 1 from public.cuentas where codigo in (v_debe, v_haber) and exige_tercero
      and codigo = public._cuenta('compras_por_pagar')
  ) then
    raise exception 'La entrada % no tiene proveedor: indícalo para poder contabilizarla', v_etiqueta;
  end if;

  perform public._periodo_abierto(v_fecha);

  insert into public.comprobantes (tipo, numero, fecha, descripcion, movimiento_id, usuario_id)
  values ('MI', public._siguiente_comprobante('MI'), v_fecha, left(v_concepto || ' ' || v_etiqueta, 300), p_movimiento_id, auth.uid())
  returning id into v_id;

  perform public._insertar_asientos(v_id, jsonb_build_array(
    jsonb_build_object('cuenta', v_debe, 'debito', v_valor,
      'proveedor_id', case when v_debe = public._cuenta('compras_por_pagar') then v_proveedor end),
    jsonb_build_object('cuenta', v_haber, 'credito', v_valor,
      'proveedor_id', case when v_haber = public._cuenta('compras_por_pagar') then v_proveedor end)
  ));
  return v_id;
end;
$$;

revoke execute on function public._cuenta, public._valor_movimiento, public._contabilizar_movimiento
  from public, anon, authenticated;

-- Contabiliza los movimientos desde el arranque que aún no tienen comprobante
-- (p. ej. si la fecha de arranque se definió después de registrarlos)
create or replace function public.contabilizar_movimientos_pendientes()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inicio date;
  v_mov    record;
  v_n      integer := 0;
begin
  if not public.lleva_contabilidad() then
    raise exception 'Solo la contadora o un administrador contabilizan movimientos' using errcode = '42501';
  end if;
  select fecha_inicio into v_inicio from public.configuracion_contable;
  if v_inicio is null then
    raise exception 'Define primero la fecha de arranque de la contabilidad';
  end if;

  for v_mov in
    select m.id from public.movimientos m
    where (m.fecha at time zone 'America/Bogota')::date >= v_inicio
      and not exists (select 1 from public.comprobantes c where c.movimiento_id = m.id)
    order by m.created_at, m.numero
  loop
    if public._contabilizar_movimiento(v_mov.id) is not null then
      v_n := v_n + 1;
    end if;
  end loop;
  return v_n;
end;
$$;

-- Control del cierre: saldo contable del inventario contra el valor de las capas
create or replace function public.conciliacion_inventario()
returns table (saldo_contable numeric, valor_inventario numeric, diferencia numeric, movimientos_pendientes integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_inicio date;
begin
  if not public.ver_contabilidad() then
    raise exception 'No tienes permisos para ver la contabilidad' using errcode = '42501';
  end if;
  select fecha_inicio into v_inicio from public.configuracion_contable;

  return query
  with saldo as (
    select coalesce(sum(a.debito - a.credito), 0) as s
    from public.asientos a
    where a.cuenta = public._cuenta('inventario')
  ),
  valor as (
    select coalesce(sum(cantidad_restante * costo_unitario), 0) as v from public.capas_costo
  )
  select saldo.s, valor.v, saldo.s - valor.v,
    case when v_inicio is null then 0 else (
      select count(*)::integer from public.movimientos m
      where (m.fecha at time zone 'America/Bogota')::date >= v_inicio
        and not exists (select 1 from public.comprobantes c where c.movimiento_id = m.id)
        and public._valor_movimiento(m.id) <> 0
    ) end
  from saldo, valor;
end;
$$;

revoke execute on function public.contabilizar_movimientos_pendientes, public.conciliacion_inventario from public, anon;
grant execute on function public.contabilizar_movimientos_pendientes, public.conciliacion_inventario to authenticated;

-- ---------------------------------------------------------------------
-- registrar_movimiento: igual a la 0013, con PEPS en vez del promedio y
-- el comprobante contable al final
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
  v_linea_id       uuid;
  v_numero_serie   text;
  v_cantidad       integer;
  v_stock          integer;
  v_costo          numeric;
  v_costo_unidad   numeric;
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

    -- Lo que entra usa el costo indicado (o el de la última entrada, si no viene). Lo que sale
    -- toma su costo de las capas PEPS al insertar la línea (el valor de aquí es provisional).
    v_costo := case
      when v_es_entrada then coalesce((v_item ->> 'costo_unitario')::numeric, public._costo_ultima_entrada(v_producto.id))
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
      v_costo := round(coalesce(v_costo, v_producto.precio_costo), 2);
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

          insert into public.movimiento_items (movimiento_id, producto_id, unidad_id, cantidad, costo_unitario, precio_unitario)
          values (v_mov_id, v_producto.id, v_unidad_id, 1, v_costo, v_precio)
          returning id into v_linea_id;
          perform public._crear_capa(v_linea_id);
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

          -- La unidad vuelve al costo con el que salió (en la venta devuelta o en su última salida)
          v_costo_unidad := v_costo;
          if v_devolucion then
            select costo_unitario into v_costo_unidad from public.movimiento_items
            where movimiento_id = p_movimiento_origen_id and unidad_id = v_unidad_id;
          elsif (v_item ->> 'costo_unitario') is null then
            select mi.costo_unitario into v_costo_unidad
            from public.movimiento_items mi
            join public.movimientos m on m.id = mi.movimiento_id
            where mi.unidad_id = v_unidad_id and m.tipo in ('salida', 'ajuste_salida')
            order by m.created_at desc
            limit 1;
          end if;
          v_costo_unidad := coalesce(v_costo_unidad, v_costo);

          update public.unidades set estado = 'disponible', bodega_id = v_bodega_id where id = v_unidad_id;

          insert into public.movimiento_items (movimiento_id, producto_id, unidad_id, cantidad, costo_unitario, precio_unitario)
          values (v_mov_id, v_producto.id, v_unidad_id, 1, v_costo_unidad, v_precio)
          returning id into v_linea_id;
          perform public._crear_capa(v_linea_id);
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
          values (v_mov_id, v_producto.id, v_unidad_id, 1, v_costo, v_precio)
          returning id into v_linea_id;
          perform public._consumir_peps(v_linea_id);
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

      insert into public.movimiento_items (movimiento_id, producto_id, cantidad, costo_unitario, precio_unitario)
      values (v_mov_id, v_producto.id, v_cantidad, v_costo, v_precio)
      returning id into v_linea_id;
      if v_es_entrada then
        perform public._crear_capa(v_linea_id);
      else
        perform public._consumir_peps(v_linea_id);
      end if;
      v_lineas := v_lineas + 1;
    end if;
  end loop;

  if v_lineas = 0 then
    raise exception 'El movimiento no tiene unidades ni cantidades';
  end if;

  perform public._actualizar_costo_producto(producto_id)
  from (select distinct producto_id from public.movimiento_items where movimiento_id = v_mov_id) p;

  perform public._contabilizar_movimiento(v_mov_id);
  return v_mov_id;
end;
$$;

-- ---------------------------------------------------------------------
-- anular_movimiento: igual a la 0020, con PEPS y su comprobante
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
  v_linea_id  uuid;
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
    -- Entrada: con PEPS, nada de lo que entró puede haber salido (sus capas deben estar intactas)
    select p.nombre into v_nombre
    from public.movimiento_items mi
    join public.productos p on p.id = mi.producto_id
    left join public.capas_costo c on c.movimiento_item_id = mi.id
    where mi.movimiento_id = p_id
      and (c.id is null or c.cantidad_restante < c.cantidad_inicial)
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
    select mi.id, mi.producto_id, mi.unidad_id, mi.cantidad, coalesce(mi.costo_unitario, p.precio_costo) as costo
    from public.movimiento_items mi
    join public.productos p on p.id = mi.producto_id
    where mi.movimiento_id = p_id
    order by mi.id
  loop
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
    values (v_nuevo_id, v_linea.producto_id, v_linea.unidad_id, v_linea.cantidad, v_linea.costo)
    returning id into v_linea_id;

    if v_tipo = 'ajuste_entrada' then
      perform public._revertir_consumos(v_linea.id, v_linea_id);
    else
      perform public._consumir_capa_de(v_linea_id, v_linea.id);
    end if;
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

  perform public._actualizar_costo_producto(producto_id)
  from (select distinct producto_id from public.movimiento_items where movimiento_id = p_id) p;
  perform public._contabilizar_movimiento(v_nuevo_id);

  return jsonb_build_object('ok', true, 'anulacion_id', v_nuevo_id);
end;
$$;

-- ---------------------------------------------------------------------
-- Reconstrucción de las capas con el historial, en el orden en que se
-- registraron los movimientos. No cambia el costo de ninguna línea.
-- ---------------------------------------------------------------------
do $$
declare
  v_linea record;
  v_par   uuid;
begin
  for v_linea in
    select mi.id, mi.producto_id, mi.unidad_id, m.tipo, m.anula_id, m.id as movimiento_id,
      row_number() over (partition by m.id, mi.producto_id, mi.unidad_id order by mi.id) as orden
    from public.movimiento_items mi
    join public.movimientos m on m.id = mi.movimiento_id
    order by m.created_at, m.numero, m.id, mi.id
  loop
    v_par := null;
    if v_linea.anula_id is not null then
      -- La línea del movimiento original que esta anula (mismo producto y serial, en orden)
      select x.id into v_par
      from (
        select mi.id, row_number() over (order by mi.id) as orden
        from public.movimiento_items mi
        where mi.movimiento_id = v_linea.anula_id
          and mi.producto_id = v_linea.producto_id
          and mi.unidad_id is not distinct from v_linea.unidad_id
      ) x
      where x.orden = v_linea.orden;
    end if;

    if v_linea.tipo in ('entrada', 'ajuste_entrada') then
      if v_par is not null then
        perform public._revertir_consumos(v_par, v_linea.id, false);
      else
        perform public._crear_capa(v_linea.id);
      end if;
    elsif v_par is not null then
      perform public._consumir_capa_de(v_linea.id, v_par, false);
    else
      perform public._consumir_peps(v_linea.id, false);
    end if;
  end loop;

  -- Las capas deben cuadrar con el stock
  if exists (
    select 1
    from public.stock_actual s
    full join (
      select producto_id, bodega_id, sum(cantidad_restante) as restante
      from public.capas_costo group by producto_id, bodega_id
    ) c on c.producto_id = s.producto_id and c.bodega_id = s.bodega_id
    where coalesce(s.cantidad, 0) <> coalesce(c.restante, 0)
  ) then
    raise exception 'Las capas de costo reconstruidas no cuadran con el stock';
  end if;

  perform public._actualizar_costo_producto(id) from public.productos;
end;
$$;

-- El costo promedio ya no se usa
drop function public._promediar_costo(uuid, integer, numeric);
drop function public._despromediar_costo(uuid, integer, numeric);
