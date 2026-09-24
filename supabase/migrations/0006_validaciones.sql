-- =====================================================================
-- Net&Sec Inventario - Validación de datos en el servidor
-- Ejecutar en Supabase → SQL Editor (una sola vez, después de 0005).
--
-- Repite en la base de datos las reglas de los formularios (largo, formato
-- de SKU, documento, email, teléfono, MAC...). Así se cumplen aunque alguien
-- llame a la API directamente sin pasar por la app.
--
-- NOT VALID: se exigen en todo dato nuevo o modificado, sin revisar los que
-- ya existen (que entraron por los formularios). Al final hay una consulta
-- opcional para comprobar que los existentes también cumplen.
-- =====================================================================

-- Email simple: algo@algo.algo, sin espacios
create or replace function public.email_valido(p text)
returns boolean
language sql
immutable
set search_path = ''
as $$ select p ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' and char_length(p) <= 254 $$;

-- ---------------------------------------------------------------------
-- Productos
-- ---------------------------------------------------------------------
alter table public.productos
  add constraint productos_sku_formato check (sku ~ '^[A-Za-z0-9._-]{1,50}$') not valid,
  add constraint productos_nombre_largo check (char_length(btrim(nombre)) between 2 and 150) not valid,
  add constraint productos_descripcion_largo check (char_length(descripcion) <= 500) not valid,
  add constraint productos_marca_largo check (char_length(marca) <= 500) not valid,
  add constraint productos_modelo_largo check (char_length(modelo) <= 500) not valid,
  add constraint productos_codigo_barras_largo check (char_length(codigo_barras) <= 50) not valid,
  add constraint productos_imagen_url_https check (imagen_url ~ '^https://' and char_length(imagen_url) <= 500) not valid;

-- ---------------------------------------------------------------------
-- Clientes y proveedores
-- ---------------------------------------------------------------------
alter table public.clientes
  add constraint clientes_documento_formato check (documento ~ '^[A-Za-z0-9-]{1,20}$') not valid,
  add constraint clientes_nombre_largo check (char_length(btrim(nombre)) between 2 and 150) not valid,
  add constraint clientes_telefono_formato check (telefono ~ '^[0-9+\s()-]{1,30}$') not valid,
  add constraint clientes_email_formato check (public.email_valido(email)) not valid,
  add constraint clientes_direccion_largo check (char_length(direccion) <= 200) not valid,
  add constraint clientes_ciudad_largo check (char_length(ciudad) <= 200) not valid,
  add constraint clientes_notas_largo check (char_length(notas) <= 1000) not valid;

alter table public.proveedores
  add constraint proveedores_nombre_largo check (char_length(btrim(nombre)) between 2 and 150) not valid,
  add constraint proveedores_nit_formato check (nit ~ '^[A-Za-z0-9-]{1,20}$') not valid,
  add constraint proveedores_contacto_largo check (char_length(contacto) <= 200) not valid,
  add constraint proveedores_telefono_formato check (telefono ~ '^[0-9+\s()-]{1,30}$') not valid,
  add constraint proveedores_email_formato check (public.email_valido(email)) not valid,
  add constraint proveedores_direccion_largo check (char_length(direccion) <= 200) not valid,
  add constraint proveedores_notas_largo check (char_length(notas) <= 1000) not valid;

-- ---------------------------------------------------------------------
-- Unidades, movimientos, catálogos y tomas
-- ---------------------------------------------------------------------
alter table public.unidades
  add constraint unidades_serie_formato check (numero_serie ~ '^\S{1,100}$') not valid,
  add constraint unidades_mac_formato check (mac ~ '^([0-9A-F]{2}:){5}[0-9A-F]{2}$') not valid,
  add constraint unidades_notas_largo check (char_length(notas) <= 1000) not valid;

alter table public.movimientos
  add constraint movimientos_referencia_largo check (char_length(referencia) <= 100) not valid,
  add constraint movimientos_notas_largo check (char_length(notas) <= 1000) not valid;

alter table public.categorias
  add constraint categorias_nombre_largo check (char_length(btrim(nombre)) between 1 and 100) not valid;

alter table public.bodegas
  add constraint bodegas_nombre_largo check (char_length(btrim(nombre)) between 1 and 100) not valid,
  add constraint bodegas_direccion_largo check (char_length(direccion) <= 200) not valid;

alter table public.perfiles
  add constraint perfiles_nombre_largo check (char_length(nombre) <= 150) not valid;

alter table public.tomas_inventario
  add constraint tomas_notas_largo check (char_length(notas) <= 500) not valid;

-- ---------------------------------------------------------------------
-- Opcional: comprobar que los datos que ya existían también cumplen.
-- Si no devuelve error, todos cumplen y las reglas quedan validadas.
-- ---------------------------------------------------------------------
-- do $$
-- declare r record;
-- begin
--   for r in
--     select conrelid::regclass as tabla, conname from pg_constraint
--     where not convalidated and contype = 'c' and connamespace = 'public'::regnamespace
--   loop
--     execute format('alter table %s validate constraint %I', r.tabla, r.conname);
--   end loop;
-- end $$;
