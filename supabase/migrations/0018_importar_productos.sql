-- =====================================================================
-- 0018: importar productos desde Excel / CSV
--
-- importar_productos(p_productos) crea muchos productos de una vez y, si
-- traen stock inicial, registra un ajuste + "Inventario inicial" con todos
-- ellos. Todo o nada: si una fila tiene un error no se crea ninguno, y el
-- mensaje dice qué fila falló.
--
-- Cada elemento de p_productos:
--   { nombre, categoria (nombre de una categoría existente), marca, modelo,
--     descripcion, codigo_barras, es_serializado, precio_venta,
--     stock_minimo, costo, stock_inicial, fila (n.º de fila en el archivo) }
-- El SKU lo genera la base de datos (migración 0014). Los productos con
-- serial no llevan stock inicial: sus unidades entran con los seriales.
-- =====================================================================

create or replace function public.importar_productos(p_productos jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item          jsonb;
  v_fila          text;
  v_categoria_id  uuid;
  v_serializado   boolean;
  v_costo         numeric;
  v_stock         integer;
  v_codigo        text;
  v_producto_id   uuid;
  v_creados       integer := 0;
  v_items_ajuste  jsonb := '[]'::jsonb;
  v_ajuste_id     uuid;
begin
  if not public.es_admin() then
    raise exception 'Solo un administrador puede importar productos' using errcode = '42501';
  end if;
  if p_productos is null or jsonb_typeof(p_productos) <> 'array' or jsonb_array_length(p_productos) = 0 then
    raise exception 'El archivo no tiene productos';
  end if;
  if jsonb_array_length(p_productos) > 2000 then
    raise exception 'Se pueden importar como máximo 2000 productos por archivo';
  end if;

  for v_item in select * from jsonb_array_elements(p_productos) loop
    v_fila := coalesce(v_item ->> 'fila', '?');

    select id into v_categoria_id
    from public.categorias
    where lower(btrim(nombre)) = lower(btrim(v_item ->> 'categoria'));
    if v_categoria_id is null then
      raise exception 'Fila %: la categoría "%" no existe (créala en Configuración → Categorías)',
        v_fila, coalesce(v_item ->> 'categoria', '');
    end if;

    v_serializado := coalesce((v_item ->> 'es_serializado')::boolean, false);
    v_costo := coalesce((v_item ->> 'costo')::numeric, 0);
    v_stock := coalesce((v_item ->> 'stock_inicial')::integer, 0);
    v_codigo := nullif(btrim(v_item ->> 'codigo_barras'), '');

    if v_costo < 0 or v_stock < 0 then
      raise exception 'Fila %: el costo y el stock inicial no pueden ser negativos', v_fila;
    end if;
    if v_serializado and v_stock > 0 then
      raise exception 'Fila %: un producto con serial no lleva stock inicial (sus unidades entran con los seriales)', v_fila;
    end if;
    if v_codigo is not null and exists (select 1 from public.productos where codigo_barras = v_codigo) then
      raise exception 'Fila %: ya existe un producto con el código de barras %', v_fila, v_codigo;
    end if;

    begin
      insert into public.productos (
        nombre, categoria_id, marca, modelo, descripcion, codigo_barras,
        es_serializado, precio_venta, stock_minimo, precio_costo
      )
      values (
        btrim(v_item ->> 'nombre'),
        v_categoria_id,
        nullif(btrim(v_item ->> 'marca'), ''),
        nullif(btrim(v_item ->> 'modelo'), ''),
        nullif(btrim(v_item ->> 'descripcion'), ''),
        v_codigo,
        v_serializado,
        coalesce((v_item ->> 'precio_venta')::numeric, 0),
        coalesce((v_item ->> 'stock_minimo')::integer, 0),
        v_costo
      )
      returning id into v_producto_id;
    exception
      when check_violation or not_null_violation or unique_violation then
        raise exception 'Fila %: %', v_fila, sqlerrm;
    end;
    v_creados := v_creados + 1;

    if v_stock > 0 then
      v_items_ajuste := v_items_ajuste || jsonb_build_array(jsonb_build_object(
        'producto_id', v_producto_id, 'cantidad', v_stock, 'costo_unitario', v_costo));
    end if;
  end loop;

  if jsonb_array_length(v_items_ajuste) > 0 then
    v_ajuste_id := public.registrar_movimiento(
      p_tipo   => 'ajuste_entrada',
      p_items  => v_items_ajuste,
      p_notas  => 'Stock inicial de la importación de productos',
      p_motivo => 'inventario_inicial'
    );
  end if;

  return jsonb_build_object('creados', v_creados, 'ajuste_id', v_ajuste_id);
end;
$$;

revoke execute on function public.importar_productos from public, anon;
grant execute on function public.importar_productos to authenticated;
