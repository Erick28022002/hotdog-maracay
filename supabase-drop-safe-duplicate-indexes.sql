-- Drops duplicate indexes that do not back constraints.
-- Keep constraint-backed unique indexes in place to preserve data integrity.

drop index if exists public.idx_catalogo_upc;
drop index if exists public.cierres_caja_fecha_sede_uniq;
