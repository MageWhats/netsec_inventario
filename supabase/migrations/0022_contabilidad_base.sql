-- =====================================================================
-- 0022: contabilidad, fase 1 (base contable)
--
-- Contabilidad de partida doble con el PUC colombiano, según el diseño del
-- módulo aprobado por la contadora (1 de octubre de 2026):
--   - Plan de cuentas con las 30 cuentas base y las subcuentas aprobadas
--     (519535 faltantes, 519540 garantías, 519545 obsequios, 425095
--     sobrantes). La 3105 se llama «Aportes de los comerciantes».
--   - Configuración contable: fecha de arranque, marco (NIIF para
--     microempresas), régimen (ordinario, no responsable de IVA, no agente
--     de retención), IVA 19 %, ICA de Santa Marta bimestral.
--   - Periodos mensuales que se cierran y se reabren (solo la contadora).
--   - Comprobantes (cabecera) y asientos (líneas). Solo se crean con
--     registrar_comprobante(): deben cuadrar, usan cuentas de último nivel
--     y llevan tercero donde la cuenta lo exige. No se editan ni se borran:
--     se anulan con un comprobante inverso.
--   - Comprobante de saldos iniciales (SI) en la fecha de arranque.
--   - Balance de prueba y auxiliar por cuenta.
--
-- Permisos: admin y contador llevan la contabilidad; lectura la consulta;
-- bodega no la ve. El contador también ve costos y reportes, como lectura.
-- Requiere la 0021 (rol contador) ejecutada antes.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Permisos
-- ---------------------------------------------------------------------
-- Costos y reportes: admin, lectura y ahora contador
create or replace function public.ver_costos()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.rol_actual() in ('admin', 'lectura', 'contador'), false);
$$;

-- Consultar la contabilidad
create or replace function public.ver_contabilidad()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.rol_actual() in ('admin', 'lectura', 'contador'), false);
$$;

-- Registrar comprobantes, configurar cuentas y cerrar periodos
create or replace function public.lleva_contabilidad()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.rol_actual() in ('admin', 'contador'), false);
$$;

revoke execute on function public.ver_contabilidad, public.lleva_contabilidad from public, anon;
grant execute on function public.ver_contabilidad, public.lleva_contabilidad to authenticated;

-- Historial de cambios: también el contador
drop policy "admin y lectura: lectura" on public.auditoria;
create policy "costos: lectura" on public.auditoria
  for select to authenticated using ((select public.ver_costos()));

-- Fecha de hoy en Colombia (la base de datos trabaja en UTC)
create or replace function public.hoy_colombia()
returns date
language sql
stable
set search_path = ''
as $$
  select (now() at time zone 'America/Bogota')::date;
$$;

-- ---------------------------------------------------------------------
-- Configuración contable (una sola fila)
-- ---------------------------------------------------------------------
create table public.configuracion_contable (
  id                boolean primary key default true check (id),
  -- Primer día de un mes. Antes de esta fecha no se registra nada.
  fecha_inicio      date check (extract(day from fecha_inicio) = 1),
  marco             text not null default 'NIIF para microempresas (Grupo 3)' check (char_length(btrim(marco)) between 2 and 100),
  regimen           text not null default 'Ordinario' check (char_length(btrim(regimen)) between 2 and 100),
  responsable_iva   boolean not null default false,
  agente_retencion  boolean not null default false,
  tarifa_iva        numeric(5, 2) not null default 19 check (tarifa_iva between 0 and 100),
  municipio_ica     text default 'Santa Marta' check (char_length(municipio_ica) <= 100),
  periodicidad_ica  text default 'Bimestral' check (periodicidad_ica in ('Mensual', 'Bimestral', 'Anual')),
  -- Tarifa por mil del ICA y código CIIU: pendientes de definir con la contadora
  actividad_ciiu    text check (actividad_ciiu ~ '^[0-9]{4}$'),
  tarifa_ica        numeric(6, 3) check (tarifa_ica between 0 and 100),
  updated_at        timestamptz not null default now()
);

insert into public.configuracion_contable (id) values (true);

create trigger configuracion_contable_updated_at
  before update on public.configuracion_contable
  for each row execute function public.set_updated_at();

create trigger auditoria_configuracion_contable
  after insert or update or delete on public.configuracion_contable
  for each row execute function public.registrar_auditoria();

alter table public.configuracion_contable enable row level security;

create policy "contabilidad: lectura" on public.configuracion_contable
  for select to authenticated using ((select public.ver_contabilidad()));
create policy "contabilidad: edita" on public.configuracion_contable
  for update to authenticated
  using ((select public.lleva_contabilidad())) with check ((select public.lleva_contabilidad()));

revoke insert, delete, truncate on public.configuracion_contable from anon, authenticated;

-- ---------------------------------------------------------------------
-- Plan de cuentas (PUC)
--   Código: clase (1 dígito), grupo (2), cuenta (4), subcuenta (6),
--   auxiliar (8 o 10). La cuenta padre se deduce del código.
--   Solo las cuentas sin subcuentas (último nivel) reciben movimientos.
-- ---------------------------------------------------------------------
create type public.naturaleza_cuenta as enum ('debito', 'credito');

-- Código de la cuenta padre: 1105 → 11, 110505 → 1105, 11 → 1
create or replace function public.padre_cuenta(p_codigo text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case char_length(p_codigo)
    when 1 then null
    when 2 then left(p_codigo, 1)
    else left(p_codigo, char_length(p_codigo) - 2)
  end;
$$;

create table public.cuentas (
  id            uuid primary key default gen_random_uuid(),
  codigo        text not null unique check (codigo ~ '^[1-9]([0-9]|[0-9]{3}|[0-9]{5}|[0-9]{7}|[0-9]{9})?$'),
  nombre        text not null check (char_length(btrim(nombre)) between 2 and 120),
  naturaleza    public.naturaleza_cuenta not null,
  nivel         smallint generated always as (
    case char_length(codigo) when 1 then 1 when 2 then 2 when 4 then 3 when 6 then 4 else 5 end
  ) stored,
  padre         text generated always as (public.padre_cuenta(codigo)) stored references public.cuentas (codigo),
  -- Cuentas de clientes, proveedores, retenciones...: cada línea dice de quién
  exige_tercero boolean not null default false,
  activa        boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index cuentas_padre_idx on public.cuentas (padre);

create trigger cuentas_updated_at
  before update on public.cuentas
  for each row execute function public.set_updated_at();

create trigger auditoria_cuentas
  after insert or update or delete on public.cuentas
  for each row execute function public.registrar_auditoria();

-- ¿Recibe movimientos? Solo si no tiene subcuentas
create or replace function public.cuenta_es_hoja(p_codigo text)
returns boolean
language sql
stable
set search_path = ''
as $$
  select not exists (select 1 from public.cuentas where padre = p_codigo);
$$;

-- ---------------------------------------------------------------------
-- Terceros que no son clientes ni proveedores: comerciantes (socios),
-- DIAN, municipio, bancos, empleados...
-- ---------------------------------------------------------------------
create table public.terceros (
  id             uuid primary key default gen_random_uuid(),
  tipo_documento public.tipo_documento not null default 'NIT',
  documento      text not null check (documento ~ '^[A-Za-z0-9-]{1,20}$'),
  nombre         text not null check (char_length(btrim(nombre)) between 2 and 150),
  notas          text check (char_length(notas) <= 500),
  activo         boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (tipo_documento, documento)
);

create trigger terceros_updated_at
  before update on public.terceros
  for each row execute function public.set_updated_at();

create trigger auditoria_terceros
  after insert or update or delete on public.terceros
  for each row execute function public.registrar_auditoria();

-- ---------------------------------------------------------------------
-- Parámetros: qué cuenta usa cada asiento automático (fase 2 en adelante).
-- La contadora los cambia sin tocar el código.
-- ---------------------------------------------------------------------
create table public.parametros_contables (
  id         uuid not null unique default gen_random_uuid(),
  clave      text primary key check (clave ~ '^[a-z_]{2,50}$'),
  nombre     text not null check (char_length(btrim(nombre)) between 2 and 150),
  cuenta     text not null references public.cuentas (codigo),
  updated_at timestamptz not null default now()
);

create trigger parametros_contables_updated_at
  before update on public.parametros_contables
  for each row execute function public.set_updated_at();

create trigger auditoria_parametros_contables
  after insert or update or delete on public.parametros_contables
  for each row execute function public.registrar_auditoria();

-- ---------------------------------------------------------------------
-- Periodos mensuales. Se crean solos con el primer comprobante del mes.
-- ---------------------------------------------------------------------
create table public.periodos (
  id                uuid not null unique default gen_random_uuid(),
  anio              smallint not null check (anio between 2000 and 2100),
  mes               smallint not null check (mes between 1 and 12),
  cerrado           boolean not null default false,
  cerrado_por       uuid references public.perfiles (id),
  cerrado_at        timestamptz,
  motivo_reapertura text check (char_length(motivo_reapertura) <= 300),
  primary key (anio, mes)
);

create trigger auditoria_periodos
  after insert or update or delete on public.periodos
  for each row execute function public.registrar_auditoria();

-- ---------------------------------------------------------------------
-- Comprobantes y asientos
-- ---------------------------------------------------------------------
create table public.tipos_comprobante (
  codigo text primary key check (codigo ~ '^[A-Z]{2}$'),
  nombre text not null,
  -- true = lo registra la contadora; false = lo genera un documento (factura, movimiento...)
  manual boolean not null
);

insert into public.tipos_comprobante (codigo, nombre, manual) values
  ('SI', 'Saldos iniciales', true),
  ('CC', 'Comprobante contable', true);

create table public.comprobantes (
  id               uuid primary key default gen_random_uuid(),
  tipo             text not null references public.tipos_comprobante (codigo),
  numero           integer not null check (numero > 0),
  fecha            date not null,
  descripcion      text not null check (char_length(btrim(descripcion)) between 3 and 300),
  -- Anulación: el comprobante inverso apunta al original
  anula_id         uuid unique references public.comprobantes (id) on delete restrict,
  anulado_at       timestamptz,
  anulado_por      uuid references public.perfiles (id),
  motivo_anulacion text check (char_length(motivo_anulacion) <= 300),
  usuario_id       uuid references public.perfiles (id),
  created_at       timestamptz not null default now(),
  unique (tipo, numero)
);

create index comprobantes_fecha_idx on public.comprobantes (fecha, tipo, numero);

create table public.asientos (
  id             uuid primary key default gen_random_uuid(),
  comprobante_id uuid not null references public.comprobantes (id) on delete restrict,
  linea          smallint not null check (linea > 0),
  cuenta         text not null references public.cuentas (codigo) on update restrict,
  cliente_id     uuid references public.clientes (id) on delete restrict,
  proveedor_id   uuid references public.proveedores (id) on delete restrict,
  tercero_id     uuid references public.terceros (id) on delete restrict,
  descripcion    text check (char_length(descripcion) <= 200),
  debito         numeric(16, 2) not null default 0 check (debito >= 0),
  credito        numeric(16, 2) not null default 0 check (credito >= 0),
  check ((debito > 0) <> (credito > 0)),
  check (num_nonnulls(cliente_id, proveedor_id, tercero_id) <= 1),
  unique (comprobante_id, linea)
);

create index asientos_cuenta_idx on public.asientos (cuenta);
create index asientos_cliente_idx on public.asientos (cliente_id) where cliente_id is not null;
create index asientos_proveedor_idx on public.asientos (proveedor_id) where proveedor_id is not null;
create index asientos_tercero_idx on public.asientos (tercero_id) where tercero_id is not null;

-- Defensa adicional: al terminar la transacción, cada comprobante debe cuadrar
create or replace function public._validar_cuadre()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_debito  numeric;
  v_credito numeric;
  v_lineas  integer;
begin
  select coalesce(sum(debito), 0), coalesce(sum(credito), 0), count(*)
  into v_debito, v_credito, v_lineas
  from public.asientos
  where comprobante_id = new.comprobante_id;

  if v_lineas < 2 or v_debito <> v_credito then
    raise exception 'El comprobante no cuadra: débitos %, créditos %', v_debito, v_credito;
  end if;
  return null;
end;
$$;

create constraint trigger asientos_cuadre
  after insert on public.asientos
  deferrable initially deferred
  for each row execute function public._validar_cuadre();

-- Una cuenta con movimientos no puede recibir subcuentas (dejaría de ser de último nivel)
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
  if exists (select 1 from public.parametros_contables where cuenta = v_padre) then
    raise exception 'La cuenta % la usan los asientos automáticos: cámbiala en los parámetros antes de crearle subcuentas', v_padre;
  end if;
  return new;
end;
$$;

create trigger cuentas_validar_nueva
  before insert on public.cuentas
  for each row execute function public._validar_cuenta_nueva();

-- Los parámetros solo apuntan a cuentas de último nivel
create or replace function public._validar_parametro()
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

create trigger parametros_validar
  before insert or update of cuenta on public.parametros_contables
  for each row execute function public._validar_parametro();

-- La fecha de arranque no cambia una vez hay comprobantes
create or replace function public._proteger_fecha_inicio()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.fecha_inicio is distinct from old.fecha_inicio and exists (select 1 from public.comprobantes) then
    raise exception 'Ya hay comprobantes registrados: la fecha de arranque no se puede cambiar';
  end if;
  return new;
end;
$$;

create trigger configuracion_proteger_fecha_inicio
  before update of fecha_inicio on public.configuracion_contable
  for each row execute function public._proteger_fecha_inicio();

revoke execute on function public._validar_cuadre, public._validar_cuenta_nueva, public._validar_parametro,
  public._proteger_fecha_inicio from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- RLS: lectura para quien ve la contabilidad. Cuentas, terceros y
-- parámetros los edita quien la lleva. Periodos, comprobantes y asientos
-- solo cambian con las funciones de abajo.
-- ---------------------------------------------------------------------
alter table public.cuentas              enable row level security;
alter table public.terceros             enable row level security;
alter table public.parametros_contables enable row level security;
alter table public.periodos             enable row level security;
alter table public.tipos_comprobante    enable row level security;
alter table public.comprobantes         enable row level security;
alter table public.asientos             enable row level security;

create policy "contabilidad: lectura" on public.cuentas
  for select to authenticated using ((select public.ver_contabilidad()));
create policy "contabilidad: crea" on public.cuentas
  for insert to authenticated with check ((select public.lleva_contabilidad()));
create policy "contabilidad: edita" on public.cuentas
  for update to authenticated using ((select public.lleva_contabilidad())) with check ((select public.lleva_contabilidad()));
create policy "contabilidad: borra" on public.cuentas
  for delete to authenticated using ((select public.lleva_contabilidad()));

create policy "contabilidad: lectura" on public.terceros
  for select to authenticated using ((select public.ver_contabilidad()));
create policy "contabilidad: crea" on public.terceros
  for insert to authenticated with check ((select public.lleva_contabilidad()));
create policy "contabilidad: edita" on public.terceros
  for update to authenticated using ((select public.lleva_contabilidad())) with check ((select public.lleva_contabilidad()));

create policy "contabilidad: lectura" on public.parametros_contables
  for select to authenticated using ((select public.ver_contabilidad()));
create policy "contabilidad: edita" on public.parametros_contables
  for update to authenticated using ((select public.lleva_contabilidad())) with check ((select public.lleva_contabilidad()));

create policy "contabilidad: lectura" on public.periodos
  for select to authenticated using ((select public.ver_contabilidad()));
create policy "contabilidad: lectura" on public.tipos_comprobante
  for select to authenticated using ((select public.ver_contabilidad()));
create policy "contabilidad: lectura" on public.comprobantes
  for select to authenticated using ((select public.ver_contabilidad()));
create policy "contabilidad: lectura" on public.asientos
  for select to authenticated using ((select public.ver_contabilidad()));

-- El código de una cuenta no cambia (los asientos lo referencian); los terceros no se borran
revoke update on public.cuentas from authenticated;
grant update (nombre, naturaleza, exige_tercero, activa) on public.cuentas to authenticated;
revoke delete, truncate on public.terceros from anon, authenticated;
revoke insert, update, delete, truncate on public.parametros_contables from anon, authenticated;
grant update (cuenta) on public.parametros_contables to authenticated;
revoke insert, update, delete, truncate on public.periodos, public.tipos_comprobante, public.comprobantes,
  public.asientos from anon, authenticated;
revoke all on public.configuracion_contable, public.cuentas, public.terceros, public.parametros_contables,
  public.periodos, public.tipos_comprobante, public.comprobantes, public.asientos from anon;

-- ---------------------------------------------------------------------
-- Plan de cuentas inicial (sección 3 del diseño, aprobado por la contadora)
-- ---------------------------------------------------------------------
insert into public.cuentas (codigo, nombre, naturaleza, exige_tercero) values
  ('1',      'Activo', 'debito', false),
  ('11',     'Disponible', 'debito', false),
  ('1105',   'Caja', 'debito', false),
  ('110505', 'Caja general', 'debito', false),
  ('1110',   'Bancos', 'debito', false),
  ('111005', 'Moneda nacional', 'debito', false),
  ('13',     'Deudores', 'debito', false),
  ('1305',   'Clientes', 'debito', false),
  ('130505', 'Clientes nacionales', 'debito', true),
  ('1355',   'Anticipo de impuestos y contribuciones o saldos a favor', 'debito', false),
  ('135515', 'Retención en la fuente a favor', 'debito', true),
  ('135517', 'Retención de IVA a favor', 'debito', true),
  ('14',     'Inventarios', 'debito', false),
  ('1435',   'Mercancías no fabricadas por la empresa', 'debito', false),
  ('15',     'Propiedades, planta y equipo', 'debito', false),
  ('1524',   'Equipo de oficina', 'debito', false),
  ('1528',   'Equipo de computación y comunicación', 'debito', false),
  ('1592',   'Depreciación acumulada', 'credito', false),
  ('2',      'Pasivo', 'credito', false),
  ('22',     'Proveedores', 'credito', false),
  ('2205',   'Proveedores nacionales', 'credito', true),
  ('23',     'Cuentas por pagar', 'credito', false),
  ('2335',   'Costos y gastos por pagar', 'credito', true),
  ('2365',   'Retención en la fuente por pagar', 'credito', true),
  ('2367',   'Retención de IVA por pagar', 'credito', true),
  ('2368',   'Retención de ICA por pagar', 'credito', true),
  ('24',     'Impuestos, gravámenes y tasas', 'credito', false),
  ('2408',   'Impuesto sobre las ventas por pagar', 'credito', false),
  ('240801', 'IVA generado', 'credito', false),
  ('240802', 'IVA descontable', 'debito', false),
  ('28',     'Otros pasivos', 'credito', false),
  ('2805',   'Anticipos de clientes', 'credito', true),
  ('3',      'Patrimonio', 'credito', false),
  ('31',     'Capital social', 'credito', false),
  ('3105',   'Aportes de los comerciantes', 'credito', false),
  ('36',     'Resultados del ejercicio', 'credito', false),
  ('3605',   'Utilidad del ejercicio', 'credito', false),
  ('37',     'Resultados de ejercicios anteriores', 'credito', false),
  ('3705',   'Utilidades acumuladas', 'credito', false),
  ('4',      'Ingresos', 'credito', false),
  ('41',     'Operacionales', 'credito', false),
  ('4135',   'Comercio al por mayor y al por menor', 'credito', false),
  ('4175',   'Devoluciones en ventas', 'debito', false),
  ('42',     'No operacionales', 'credito', false),
  ('4210',   'Ingresos financieros', 'credito', false),
  ('4250',   'Recuperaciones', 'credito', false),
  ('425095', 'Sobrantes de inventario', 'credito', false),
  ('5',      'Gastos', 'debito', false),
  ('51',     'Operacionales de administración', 'debito', false),
  ('5105',   'Gastos de personal', 'debito', false),
  ('5120',   'Arrendamientos', 'debito', false),
  ('5135',   'Servicios', 'debito', false),
  ('5195',   'Gastos diversos', 'debito', false),
  ('519535', 'Faltantes de inventario', 'debito', false),
  ('519540', 'Garantías a clientes', 'debito', false),
  ('519545', 'Obsequios y muestras gratis', 'debito', false),
  -- Al tener subcuentas, la 5195 deja de recibir movimientos: papelería, aseo,
  -- transporte y uso interno van aquí mientras la contadora no defina otras
  ('519595', 'Otros gastos diversos', 'debito', false),
  ('52',     'Operacionales de ventas', 'debito', false),
  ('5260',   'Depreciaciones', 'debito', false),
  ('53',     'No operacionales', 'debito', false),
  ('5305',   'Gastos financieros', 'debito', false),
  ('6',      'Costos de ventas', 'debito', false),
  ('61',     'Costo de ventas y de prestación de servicios', 'debito', false),
  ('6135',   'Costo de ventas – comercio', 'debito', false);

insert into public.parametros_contables (clave, nombre, cuenta) values
  ('caja', 'Caja general', '110505'),
  ('clientes', 'Clientes (cuentas por cobrar)', '130505'),
  ('inventario', 'Inventario de mercancías', '1435'),
  ('proveedores', 'Proveedores (cuentas por pagar)', '2205'),
  ('capital', 'Aportes de los comerciantes (saldos iniciales)', '3105'),
  ('utilidad_ejercicio', 'Utilidad del ejercicio', '3605'),
  ('utilidades_acumuladas', 'Utilidades acumuladas', '3705'),
  ('ventas', 'Ventas de mercancía', '4135'),
  ('devoluciones_ventas', 'Devoluciones en ventas', '4175'),
  ('sobrantes_inventario', 'Sobrantes de inventario', '425095'),
  ('faltantes_inventario', 'Faltantes, daños y pérdidas de inventario', '519535'),
  ('garantias_clientes', 'Garantías a clientes', '519540'),
  ('obsequios', 'Obsequios y muestras gratis', '519545'),
  ('uso_interno', 'Uso interno de mercancía', '519595'),
  ('costo_ventas', 'Costo de ventas', '6135');

-- ---------------------------------------------------------------------
-- Periodo abierto para una fecha (lo crea si no existe). Valida la fecha de
-- arranque y que la fecha no esté demasiado en el futuro.
-- ---------------------------------------------------------------------
create or replace function public._periodo_abierto(p_fecha date)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_inicio date;
  v_cerrado boolean;
begin
  select fecha_inicio into v_inicio from public.configuracion_contable;
  if v_inicio is null then
    raise exception 'Define primero la fecha de arranque de la contabilidad (Contabilidad → Configuración)';
  end if;
  if p_fecha is null then
    raise exception 'Indica la fecha del comprobante';
  end if;
  if p_fecha < v_inicio then
    raise exception 'La contabilidad arranca el %: no se registra nada antes', to_char(v_inicio, 'DD/MM/YYYY');
  end if;
  -- Hasta el final del mes siguiente (causaciones de fin de mes hechas con anticipación)
  if p_fecha > (date_trunc('month', public.hoy_colombia()) + interval '2 months' - interval '1 day')::date then
    raise exception 'La fecha % está demasiado lejos en el futuro', to_char(p_fecha, 'DD/MM/YYYY');
  end if;

  insert into public.periodos (anio, mes)
  values (extract(year from p_fecha), extract(month from p_fecha))
  on conflict do nothing;

  select cerrado into v_cerrado
  from public.periodos
  where anio = extract(year from p_fecha) and mes = extract(month from p_fecha)
  for share;
  if v_cerrado then
    raise exception 'El periodo %/% está cerrado', lpad(extract(month from p_fecha)::text, 2, '0'), extract(year from p_fecha);
  end if;
end;
$$;

revoke execute on function public._periodo_abierto from public, anon, authenticated;

-- Consecutivo sin huecos por tipo (el bloqueo dura hasta el fin de la transacción)
create or replace function public._siguiente_comprobante(p_tipo text)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_numero integer;
begin
  perform pg_advisory_xact_lock(hashtext('comprobantes.numero.' || p_tipo));
  select coalesce(max(numero), 0) + 1 into v_numero from public.comprobantes where tipo = p_tipo;
  return v_numero;
end;
$$;

revoke execute on function public._siguiente_comprobante from public, anon, authenticated;

-- Etiqueta legible: CC-000012
create or replace function public.etiqueta_comprobante(p_tipo text, p_numero integer)
returns text
language sql
immutable
set search_path = ''
as $$
  select p_tipo || '-' || lpad(p_numero::text, 6, '0');
$$;

-- ---------------------------------------------------------------------
-- Inserta las líneas de un comprobante validándolas una a una. Uso interno:
-- la llaman registrar_comprobante() y, en las fases siguientes, los
-- documentos que contabilizan solos.
--   p_lineas: [{ cuenta, debito, credito, descripcion?, cliente_id?,
--                proveedor_id?, tercero_id? }, ...]
-- ---------------------------------------------------------------------
create or replace function public._insertar_asientos(p_comprobante_id uuid, p_lineas jsonb)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_linea    jsonb;
  v_n        integer := 0;
  v_cuenta   public.cuentas;
  v_debito   numeric;
  v_credito  numeric;
  v_cliente  uuid;
  v_proveedor uuid;
  v_tercero  uuid;
  v_total_d  numeric := 0;
  v_total_c  numeric := 0;
begin
  if p_lineas is null or jsonb_typeof(p_lineas) <> 'array' or jsonb_array_length(p_lineas) < 2 then
    raise exception 'El comprobante debe tener al menos dos líneas';
  end if;
  if jsonb_array_length(p_lineas) > 500 then
    raise exception 'El comprobante tiene demasiadas líneas (máximo 500)';
  end if;

  for v_linea in select * from jsonb_array_elements(p_lineas) loop
    v_n := v_n + 1;

    select * into v_cuenta from public.cuentas where codigo = btrim(v_linea ->> 'cuenta');
    if not found then
      raise exception 'Línea %: la cuenta "%" no existe', v_n, coalesce(v_linea ->> 'cuenta', '');
    end if;
    if not v_cuenta.activa then
      raise exception 'Línea %: la cuenta % % está inactiva', v_n, v_cuenta.codigo, v_cuenta.nombre;
    end if;
    if not public.cuenta_es_hoja(v_cuenta.codigo) then
      raise exception 'Línea %: la cuenta % % tiene subcuentas; usa una de último nivel', v_n, v_cuenta.codigo, v_cuenta.nombre;
    end if;

    v_debito  := round(coalesce((v_linea ->> 'debito')::numeric, 0), 2);
    v_credito := round(coalesce((v_linea ->> 'credito')::numeric, 0), 2);
    if v_debito < 0 or v_credito < 0 then
      raise exception 'Línea %: los valores no pueden ser negativos', v_n;
    end if;
    if (v_debito > 0) = (v_credito > 0) then
      raise exception 'Línea %: lleva un valor en débito o en crédito (uno solo)', v_n;
    end if;

    v_cliente   := nullif(v_linea ->> 'cliente_id', '')::uuid;
    v_proveedor := nullif(v_linea ->> 'proveedor_id', '')::uuid;
    v_tercero   := nullif(v_linea ->> 'tercero_id', '')::uuid;
    if num_nonnulls(v_cliente, v_proveedor, v_tercero) > 1 then
      raise exception 'Línea %: indica un solo tercero', v_n;
    end if;
    if v_cuenta.exige_tercero and num_nonnulls(v_cliente, v_proveedor, v_tercero) = 0 then
      raise exception 'Línea %: la cuenta % % exige indicar el tercero', v_n, v_cuenta.codigo, v_cuenta.nombre;
    end if;
    if v_cliente is not null and not exists (select 1 from public.clientes where id = v_cliente) then
      raise exception 'Línea %: el cliente no existe', v_n;
    end if;
    if v_proveedor is not null and not exists (select 1 from public.proveedores where id = v_proveedor) then
      raise exception 'Línea %: el proveedor no existe', v_n;
    end if;
    if v_tercero is not null and not exists (select 1 from public.terceros where id = v_tercero) then
      raise exception 'Línea %: el tercero no existe', v_n;
    end if;

    insert into public.asientos (comprobante_id, linea, cuenta, cliente_id, proveedor_id, tercero_id, descripcion, debito, credito)
    values (
      p_comprobante_id, v_n, v_cuenta.codigo, v_cliente, v_proveedor, v_tercero,
      nullif(btrim(v_linea ->> 'descripcion'), ''), v_debito, v_credito
    );

    v_total_d := v_total_d + v_debito;
    v_total_c := v_total_c + v_credito;
  end loop;

  if v_total_d <> v_total_c then
    raise exception 'El comprobante no cuadra: débitos % y créditos % (diferencia %)',
      to_char(v_total_d, 'FM999G999G999G990D00'), to_char(v_total_c, 'FM999G999G999G990D00'),
      to_char(abs(v_total_d - v_total_c), 'FM999G999G999G990D00');
  end if;
end;
$$;

revoke execute on function public._insertar_asientos from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Registrar un comprobante manual: CC (comprobante contable) o SI (saldos
-- iniciales, uno solo y en la fecha de arranque).
-- ---------------------------------------------------------------------
create or replace function public.registrar_comprobante(
  p_tipo        text,
  p_fecha       date,
  p_descripcion text,
  p_lineas      jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id     uuid;
  v_inicio date;
begin
  if not public.lleva_contabilidad() then
    raise exception 'Solo la contadora o un administrador registran comprobantes' using errcode = '42501';
  end if;
  if not exists (select 1 from public.tipos_comprobante where codigo = p_tipo and manual) then
    raise exception 'Tipo de comprobante inválido';
  end if;
  if char_length(btrim(coalesce(p_descripcion, ''))) < 3 then
    raise exception 'Describe el comprobante';
  end if;

  perform public._periodo_abierto(p_fecha);

  if p_tipo = 'SI' then
    select fecha_inicio into v_inicio from public.configuracion_contable;
    if p_fecha <> v_inicio then
      raise exception 'Los saldos iniciales van con la fecha de arranque (%)', to_char(v_inicio, 'DD/MM/YYYY');
    end if;
    perform pg_advisory_xact_lock(hashtext('comprobantes.numero.SI'));
    if exists (select 1 from public.comprobantes where tipo = 'SI' and anulado_at is null and anula_id is null) then
      raise exception 'Ya hay un comprobante de saldos iniciales: anúlalo para registrar otro';
    end if;
  end if;

  insert into public.comprobantes (tipo, numero, fecha, descripcion, usuario_id)
  values (p_tipo, public._siguiente_comprobante(p_tipo), p_fecha, btrim(p_descripcion), auth.uid())
  returning id into v_id;

  perform public._insertar_asientos(v_id, p_lineas);
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------
-- Anular un comprobante manual: crea el inverso (débitos ↔ créditos) con
-- la misma fecha, así el mes queda como si no hubiera existido. El periodo
-- debe estar abierto.
-- ---------------------------------------------------------------------
create or replace function public.anular_comprobante(p_id uuid, p_motivo text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_comp   public.comprobantes;
  v_nuevo  uuid;
  v_lineas jsonb;
begin
  if not public.lleva_contabilidad() then
    raise exception 'Solo la contadora o un administrador anulan comprobantes' using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(p_motivo, ''))) < 5 then
    raise exception 'Explica el motivo de la anulación';
  end if;

  select * into v_comp from public.comprobantes where id = p_id for update;
  if not found then
    raise exception 'El comprobante no existe';
  end if;
  if v_comp.anulado_at is not null then
    raise exception 'El comprobante % ya está anulado', public.etiqueta_comprobante(v_comp.tipo, v_comp.numero);
  end if;
  if v_comp.anula_id is not null then
    raise exception 'El comprobante % es una anulación: no se puede anular', public.etiqueta_comprobante(v_comp.tipo, v_comp.numero);
  end if;
  if not exists (select 1 from public.tipos_comprobante where codigo = v_comp.tipo and manual) then
    raise exception 'Este comprobante lo generó un documento: se anula anulando el documento';
  end if;

  perform public._periodo_abierto(v_comp.fecha);

  select jsonb_agg(jsonb_build_object(
    'cuenta', cuenta, 'debito', credito, 'credito', debito, 'descripcion', descripcion,
    'cliente_id', cliente_id, 'proveedor_id', proveedor_id, 'tercero_id', tercero_id
  ) order by linea)
  into v_lineas
  from public.asientos
  where comprobante_id = p_id;

  insert into public.comprobantes (tipo, numero, fecha, descripcion, anula_id, usuario_id)
  values (
    v_comp.tipo, public._siguiente_comprobante(v_comp.tipo), v_comp.fecha,
    left('Anulación de ' || public.etiqueta_comprobante(v_comp.tipo, v_comp.numero) || ': ' || btrim(p_motivo), 300),
    p_id, auth.uid()
  )
  returning id into v_nuevo;

  -- Las cuentas inactivas o con subcuentas nuevas no impiden revertir: se copian tal cual
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
-- Cierre y reapertura de periodos. Se cierran en orden; se reabren del
-- último al primero. Reabrir es solo de la contadora y exige un motivo.
-- ---------------------------------------------------------------------
create or replace function public.cerrar_periodo(p_anio integer, p_mes integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inicio  date;
  v_fecha   date;
  v_debito  numeric;
  v_credito numeric;
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

  -- Todos los meses anteriores (desde el arranque) deben estar cerrados
  if v_fecha > v_inicio and not exists (
    select 1 from public.periodos
    where make_date(anio, mes, 1) = (v_fecha - interval '1 month')::date and cerrado
  ) then
    raise exception 'Cierra primero el mes anterior';
  end if;

  select coalesce(sum(a.debito), 0), coalesce(sum(a.credito), 0) into v_debito, v_credito
  from public.asientos a
  join public.comprobantes c on c.id = a.comprobante_id
  where c.fecha >= v_fecha and c.fecha < (v_fecha + interval '1 month')::date;
  if v_debito <> v_credito then
    raise exception 'El balance de prueba del mes no cuadra (débitos %, créditos %)', v_debito, v_credito;
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

create or replace function public.reabrir_periodo(p_anio integer, p_mes integer, p_motivo text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_fecha date := make_date(p_anio, p_mes, 1);
begin
  if coalesce(public.rol_actual()::text, '') <> 'contador' then
    raise exception 'Solo la contadora puede reabrir un periodo' using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(p_motivo, ''))) < 5 then
    raise exception 'Explica el motivo de la reapertura';
  end if;
  if exists (
    select 1 from public.periodos
    where make_date(anio, mes, 1) = (v_fecha + interval '1 month')::date and cerrado
  ) then
    raise exception 'Reabre primero el mes siguiente';
  end if;

  update public.periodos
  set cerrado = false, cerrado_por = null, cerrado_at = null, motivo_reapertura = btrim(p_motivo)
  where anio = p_anio and mes = p_mes and cerrado;
  if not found then
    raise exception 'El periodo no está cerrado';
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- Balance de prueba: saldo anterior, débitos, créditos y saldo final de
-- cada cuenta (y de sus cuentas padre) entre dos fechas. Los saldos van en
-- la naturaleza de la cuenta: positivo = saldo normal.
-- ---------------------------------------------------------------------
create or replace function public.balance_prueba(p_desde date, p_hasta date)
returns table (
  codigo        text,
  nombre        text,
  nivel         smallint,
  naturaleza    public.naturaleza_cuenta,
  saldo_inicial numeric,
  debitos       numeric,
  creditos      numeric,
  saldo_final   numeric
)
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

  return query
  with por_hoja as (
    select a.cuenta,
      coalesce(sum(a.debito - a.credito) filter (where c.fecha < p_desde), 0) as previo,
      coalesce(sum(a.debito) filter (where c.fecha >= p_desde), 0) as d,
      coalesce(sum(a.credito) filter (where c.fecha >= p_desde), 0) as cr
    from public.asientos a
    join public.comprobantes c on c.id = a.comprobante_id
    where c.fecha <= p_hasta
    group by a.cuenta
  ),
  -- Cada hoja suma también en sus cuentas padre (prefijos de 1, 2, 4, 6 y 8 dígitos)
  acumulado as (
    select left(h.cuenta, l.largo) as codigo, sum(h.previo) as previo, sum(h.d) as d, sum(h.cr) as cr
    from por_hoja h
    cross join (values (1), (2), (4), (6), (8), (10)) as l (largo)
    where l.largo <= char_length(h.cuenta)
    group by 1
  )
  select cu.codigo, cu.nombre, cu.nivel, cu.naturaleza,
    case cu.naturaleza when 'debito' then x.previo else -x.previo end,
    x.d, x.cr,
    case cu.naturaleza when 'debito' then x.previo + x.d - x.cr else -(x.previo + x.d - x.cr) end
  from acumulado x
  join public.cuentas cu on cu.codigo = x.codigo
  where x.previo <> 0 or x.d <> 0 or x.cr <> 0
  order by cu.codigo;
end;
$$;

-- ---------------------------------------------------------------------
-- Auxiliar de una cuenta (incluye sus subcuentas) entre dos fechas, con el
-- saldo línea a línea. La primera fila es el saldo anterior.
-- ---------------------------------------------------------------------
create or replace function public.auxiliar_cuenta(p_cuenta text, p_desde date, p_hasta date)
returns table (
  comprobante_id uuid,
  fecha          date,
  tipo           text,
  numero         integer,
  linea          smallint,
  cuenta         text,
  descripcion    text,
  tercero        text,
  debito         numeric,
  credito        numeric,
  saldo          numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_naturaleza public.naturaleza_cuenta;
  v_signo      integer;
  v_previo     numeric;
begin
  if not public.ver_contabilidad() then
    raise exception 'No tienes permisos para ver la contabilidad' using errcode = '42501';
  end if;
  if p_desde is null or p_hasta is null or p_desde > p_hasta then
    raise exception 'Rango de fechas inválido';
  end if;
  select cu.naturaleza into v_naturaleza from public.cuentas cu where cu.codigo = p_cuenta;
  if not found then
    raise exception 'La cuenta % no existe', p_cuenta;
  end if;
  v_signo := case v_naturaleza when 'debito' then 1 else -1 end;

  select coalesce(sum(a.debito - a.credito), 0) * v_signo into v_previo
  from public.asientos a
  join public.comprobantes c on c.id = a.comprobante_id
  where a.cuenta like p_cuenta || '%' and c.fecha < p_desde;

  return query
  select f.id, f.fecha, f.tipo, f.numero, f.linea, f.cuenta, f.descripcion, f.tercero, f.debito, f.credito, f.saldo
  from (
    select 0 as orden, null::uuid as id, p_desde as fecha, null::text as tipo, null::integer as numero,
      null::smallint as linea, null::text as cuenta, 'Saldo anterior'::text as descripcion, null::text as tercero,
      null::numeric as debito, null::numeric as credito, v_previo as saldo
    union all
    select 1, c.id, c.fecha, c.tipo, c.numero, a.linea, a.cuenta,
      coalesce(a.descripcion, c.descripcion),
      coalesce(cl.nombre, pr.nombre, te.nombre),
      a.debito, a.credito,
      v_previo + sum((a.debito - a.credito) * v_signo)
        over (order by c.fecha, c.tipo, c.numero, a.linea rows unbounded preceding)
    from public.asientos a
    join public.comprobantes c on c.id = a.comprobante_id
    left join public.clientes cl on cl.id = a.cliente_id
    left join public.proveedores pr on pr.id = a.proveedor_id
    left join public.terceros te on te.id = a.tercero_id
    where a.cuenta like p_cuenta || '%' and c.fecha between p_desde and p_hasta
  ) f
  order by f.orden, f.fecha, f.tipo, f.numero, f.linea;
end;
$$;

revoke execute on function public.registrar_comprobante, public.anular_comprobante, public.cerrar_periodo,
  public.reabrir_periodo, public.balance_prueba, public.auxiliar_cuenta, public.cuenta_es_hoja,
  public.etiqueta_comprobante, public.hoy_colombia, public.padre_cuenta from public, anon;
grant execute on function public.registrar_comprobante, public.anular_comprobante, public.cerrar_periodo,
  public.reabrir_periodo, public.balance_prueba, public.auxiliar_cuenta, public.cuenta_es_hoja,
  public.etiqueta_comprobante, public.hoy_colombia, public.padre_cuenta to authenticated;
