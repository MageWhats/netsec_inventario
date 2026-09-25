-- =====================================================================
-- Net&Sec Inventario - Fotos de productos (Supabase Storage)
-- Ejecutar en Supabase → SQL Editor (una sola vez, después de 0006).
--
-- Bucket "productos":
--   - Lectura pública por URL exacta (las rutas llevan un UUID aleatorio; nadie puede listarlas).
--   - Solo el rol admin sube, reemplaza, borra o lista archivos.
--   - El servidor rechaza archivos de más de 2 MB o que no sean JPG, PNG o WebP
--     (sin SVG: puede contener código).
-- La app reduce y comprime las fotos antes de subirlas (≈1200 px, WebP).
-- =====================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('productos', 'productos', true, 2097152, array['image/webp', 'image/jpeg', 'image/png'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy "productos: admin lista" on storage.objects
  for select to authenticated
  using (bucket_id = 'productos' and (select public.es_admin()));

create policy "productos: admin sube" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'productos' and (select public.es_admin()));

create policy "productos: admin reemplaza" on storage.objects
  for update to authenticated
  using (bucket_id = 'productos' and (select public.es_admin()))
  with check (bucket_id = 'productos' and (select public.es_admin()));

create policy "productos: admin borra" on storage.objects
  for delete to authenticated
  using (bucket_id = 'productos' and (select public.es_admin()));

-- imagen_url solo puede apuntar a una foto de este bucket (no a cualquier sitio de internet)
alter table public.productos drop constraint if exists productos_imagen_url_https;
alter table public.productos
  add constraint productos_imagen_url_bucket
  check (imagen_url ~ '^https://[a-z0-9]+\.supabase\.co/storage/v1/object/public/productos/[0-9a-f-]{36}/[0-9a-f-]{36}\.(webp|jpg|png)$');
