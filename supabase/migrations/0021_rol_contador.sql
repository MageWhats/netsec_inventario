-- =====================================================================
-- 0021: rol contador
--
-- Rol nuevo para la contadora: ve todo lo que ve el rol lectura (costos y
-- reportes incluidos) y además lleva la contabilidad (migración 0022):
-- plan de cuentas, comprobantes, periodos y configuración contable.
-- No registra movimientos de inventario.
--
-- Va en su propia migración: Postgres no deja usar un valor nuevo de un
-- enum en la misma transacción que lo crea. Ejecútala sola y luego la 0022.
-- =====================================================================

alter type public.rol_usuario add value if not exists 'contador';
