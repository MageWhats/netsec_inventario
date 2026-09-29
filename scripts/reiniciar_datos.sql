-- =====================================================================
-- Net&Sec Inventario - Reiniciar TODOS los datos (empezar desde 0)
-- Ejecutar en Supabase → SQL Editor. NO es una migración: es un borrado
-- manual e IRREVERSIBLE. Hacer un backup antes si hay algo que conservar.
--
-- Borra:
--   - Productos, familias/colores y unidades/seriales
--   - Clientes y proveedores
--   - Movimientos (entradas, salidas, ajustes) y sus líneas
--   - Tomas de inventario (conteos y seriales contados)
--   - Órdenes de compra y sus productos (migración 0017)
--   - Historial de cambios (auditoría)
--   → La app queda vacía: stock en 0 y reportes sin datos.
--
-- Conserva (la app los necesita y no tiene pantalla para crearlos):
--   - Usuarios y roles (perfiles) → para poder seguir entrando
--   - Bodega principal            → la usan todos los movimientos
--   - Categorías                  → la lista para clasificar productos
--   - Datos de la empresa         → encabezan las remisiones en PDF
--
-- Los consecutivos vuelven a empezar: NetE-/NetS-/NetA-000001, OC-000001, tomas #1 y
-- los SKU de cada categoría en NS-XX-0001.
--
-- Las fotos de productos NO se borran con SQL (Supabase no lo permite):
-- ir a Storage → bucket "productos" → seleccionar todo → Delete.
-- =====================================================================

begin;

-- Consecutivo de SKU de cada categoría (migración 0014). Va antes del
-- truncate para que tampoco quede en el historial de cambios.
update public.categorias set ultimo_sku = 0;

-- Sin CASCADE a propósito: si alguna otra tabla dependiera de estas,
-- el script falla en lugar de borrar algo que no está en la lista.
truncate table
  public.toma_seriales,
  public.toma_productos,
  public.tomas_inventario,
  public.movimiento_items,
  public.movimientos,
  public.orden_compra_items,
  public.ordenes_compra,
  public.unidades,
  public.productos,
  public.familias,
  public.clientes,
  public.proveedores,
  public.auditoria
restart identity;

commit;

-- Verificación: todo debe dar 0
select 'productos' as tabla, count(*) from public.productos
union all select 'familias', count(*) from public.familias
union all select 'unidades', count(*) from public.unidades
union all select 'clientes', count(*) from public.clientes
union all select 'proveedores', count(*) from public.proveedores
union all select 'movimientos', count(*) from public.movimientos
union all select 'movimiento_items', count(*) from public.movimiento_items
union all select 'ordenes_compra', count(*) from public.ordenes_compra
union all select 'tomas_inventario', count(*) from public.tomas_inventario
union all select 'auditoria', count(*) from public.auditoria;
