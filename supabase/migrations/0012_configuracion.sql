-- =====================================================================
-- 0012: configuración de categorías y bodegas desde la app
--
-- - Una categoría con productos ya no se puede eliminar (antes los
--   productos quedaban "sin categoría" sin avisar).
-- - No se permiten nombres repetidos que solo cambien en mayúsculas o
--   espacios ("Routers" y "routers ").
-- - Siempre debe quedar al menos una bodega activa: registrar_movimiento()
--   la necesita.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Categorías en uso: bloquear el borrado
-- ---------------------------------------------------------------------
alter table public.productos
  drop constraint productos_categoria_id_fkey,
  add constraint productos_categoria_id_fkey
    foreign key (categoria_id) references public.categorias (id) on delete restrict;

alter table public.familias
  drop constraint familias_categoria_id_fkey,
  add constraint familias_categoria_id_fkey
    foreign key (categoria_id) references public.categorias (id) on delete restrict;

-- ---------------------------------------------------------------------
-- Nombres únicos sin importar mayúsculas ni espacios
-- ---------------------------------------------------------------------
create unique index categorias_nombre_normalizado_key on public.categorias (lower(btrim(nombre)));
create unique index bodegas_nombre_normalizado_key on public.bodegas (lower(btrim(nombre)));

-- ---------------------------------------------------------------------
-- Siempre al menos una bodega activa
-- ---------------------------------------------------------------------
create or replace function public.proteger_ultima_bodega()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.activa and (tg_op = 'DELETE' or not new.activa)
     and not exists (select 1 from public.bodegas where activa and id <> old.id) then
    raise exception 'Debe quedar al menos una bodega activa';
  end if;
  return coalesce(new, old);
end;
$$;

create trigger bodegas_proteger_ultima
  before update of activa or delete on public.bodegas
  for each row execute function public.proteger_ultima_bodega();
