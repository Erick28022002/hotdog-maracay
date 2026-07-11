-- Fixes the remaining recipe error logger search_path.
-- The previous value was stored as one quoted identifier, so unqualified
-- references such as errores_receta could fail at runtime.

alter function public.registrar_error_receta(text, text, text, text, text, date)
  set search_path = public, extensions, pg_temp;

notify pgrst, 'reload schema';
