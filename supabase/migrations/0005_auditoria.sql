-- =====================================================================
-- Net&Sec Inventario - Registro de auditoría
-- Ejecutar en Supabase → SQL Editor (una sola vez, después de 0004).
--
-- Guarda automáticamente quién cambió qué y cuándo en los catálogos,
-- precios, clientes, proveedores y roles. Los movimientos ya son un
-- historial inmutable, así que no se duplican aquí.
-- La tabla solo se llena con triggers: desde la app es de solo lectura.
-- =====================================================================

create table public.auditoria (
  id            bigint generated always as identity primary key,
  tabla         text not null,
  registro_id   text not null,
  descripcion   text,          -- nombre legible del registro (nombre, SKU, serial...)
  accion        text not null check (accion in ('crear', 'modificar', 'eliminar')),
  -- crear/eliminar: la fila completa; modificar: { campo: { "antes": ..., "despues": ... } }
  cambios       jsonb not null,
  usuario_id    uuid,
  usuario_email text,
  fecha         timestamptz not null default now()
);

create index auditoria_fecha_idx on public.auditoria (fecha desc);
create index auditoria_registro_idx on public.auditoria (tabla, registro_id);

alter table public.auditoria enable row level security;

create policy "admin: lectura" on public.auditoria
  for select to authenticated using ((select public.es_admin()));

revoke insert, update, delete, truncate on public.auditoria from anon, authenticated;

-- ---------------------------------------------------------------------
-- Trigger genérico
-- ---------------------------------------------------------------------
create or replace function public.registrar_auditoria()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_nueva   jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  v_vieja   jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  v_fila    jsonb := coalesce(v_nueva, v_vieja);
  v_cambios jsonb;
begin
  if tg_op = 'UPDATE' then
    select jsonb_object_agg(n.key, jsonb_build_object('antes', v_vieja -> n.key, 'despues', n.value))
    into v_cambios
    from jsonb_each(v_nueva) n
    where n.key not in ('updated_at')
      and (v_vieja -> n.key) is distinct from n.value;

    -- Actualización sin cambios reales: no se registra
    if v_cambios is null then
      return new;
    end if;
  else
    v_cambios := v_fila;
  end if;

  insert into public.auditoria (tabla, registro_id, descripcion, accion, cambios, usuario_id, usuario_email)
  values (
    tg_table_name,
    coalesce(v_fila ->> 'id', ''),
    coalesce(v_fila ->> 'nombre', v_fila ->> 'numero_serie', v_fila ->> 'sku', v_fila ->> 'documento'),
    case tg_op when 'INSERT' then 'crear' when 'UPDATE' then 'modificar' else 'eliminar' end,
    v_cambios,
    auth.uid(),
    auth.jwt() ->> 'email'
  );

  return coalesce(new, old);
end;
$$;

revoke execute on function public.registrar_auditoria from public, anon, authenticated;

create trigger auditoria_productos
  after insert or update or delete on public.productos
  for each row execute function public.registrar_auditoria();

create trigger auditoria_clientes
  after insert or update or delete on public.clientes
  for each row execute function public.registrar_auditoria();

create trigger auditoria_proveedores
  after insert or update or delete on public.proveedores
  for each row execute function public.registrar_auditoria();

create trigger auditoria_categorias
  after insert or update or delete on public.categorias
  for each row execute function public.registrar_auditoria();

create trigger auditoria_bodegas
  after insert or update or delete on public.bodegas
  for each row execute function public.registrar_auditoria();

-- Cambios de rol o nombre de los usuarios de la app
create trigger auditoria_perfiles
  after insert or update or delete on public.perfiles
  for each row execute function public.registrar_auditoria();

-- Unidades: su estado cambia con los movimientos (que ya son historial); aquí solo MAC y notas
create trigger auditoria_unidades
  after update of mac, notas on public.unidades
  for each row execute function public.registrar_auditoria();
