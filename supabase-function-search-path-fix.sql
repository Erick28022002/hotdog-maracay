-- Corrige funciones de inventario/recetas que tenian el search_path guardado
-- como un solo identificador con comas, lo que puede causar "relation does not
-- exist" aunque la tabla exista en public.

alter function public.pickup_cola_batch(integer, text)
  set search_path = public, extensions, pg_temp;

alter function public.procesar_combo(bigint, uuid, text, numeric, text, text)
  set search_path = public, extensions, pg_temp;

alter function public.procesar_reversion(bigint, text)
  set search_path = public, extensions, pg_temp;

alter function public.procesar_venta_receta(bigint, uuid, text, numeric, text, text)
  set search_path = public, extensions, pg_temp;
