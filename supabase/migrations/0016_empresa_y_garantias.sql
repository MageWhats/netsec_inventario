-- =====================================================================
-- 0016: datos de la empresa y garantías
--
-- - empresa: una sola fila con los datos que encabezan los documentos PDF
--   (remisiones y comprobantes): razón social, NIT, dirección, teléfono...
--   Todos los usuarios la leen; solo admin la edita (Configuración → Empresa).
-- - categorias.garantia_meses: meses de garantía de los productos de la
--   categoría, contados desde la venta. Con ellos la consulta de seriales
--   dice si una unidad vendida sigue en garantía. 0 = sin garantía.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Empresa
-- ---------------------------------------------------------------------
create table public.empresa (
  id              boolean primary key default true check (id), -- una sola fila
  nombre          text not null default 'Net&Sec Suministros' check (char_length(btrim(nombre)) between 2 and 150),
  nit             text check (char_length(nit) <= 30),
  direccion       text check (char_length(direccion) <= 200),
  ciudad          text check (char_length(ciudad) <= 100),
  telefono        text check (telefono ~ '^[0-9+\s()-]{1,30}$'),
  email           text check (public.email_valido(email)),
  sitio_web       text check (char_length(sitio_web) <= 200),
  -- Texto al pie de las remisiones: condiciones de garantía, cuentas bancarias...
  pie_documentos  text check (char_length(pie_documentos) <= 1000),
  updated_at      timestamptz not null default now()
);

insert into public.empresa (id) values (true);

create trigger empresa_updated_at
  before update on public.empresa
  for each row execute function public.set_updated_at();

create trigger auditoria_empresa
  after insert or update or delete on public.empresa
  for each row execute function public.registrar_auditoria();

alter table public.empresa enable row level security;

create policy "usuarios: lectura" on public.empresa
  for select to authenticated using ((select public.puede_ver()));
create policy "admin: edita" on public.empresa
  for update to authenticated using ((select public.es_admin())) with check ((select public.es_admin()));

-- La fila única no se crea ni se borra desde la app
revoke insert, delete, truncate on public.empresa from anon, authenticated;

-- ---------------------------------------------------------------------
-- Garantía por categoría
-- ---------------------------------------------------------------------
alter table public.categorias
  add column garantia_meses integer not null default 0 check (garantia_meses between 0 and 120);
