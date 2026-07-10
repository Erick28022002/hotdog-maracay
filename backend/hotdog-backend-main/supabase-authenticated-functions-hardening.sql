-- Harden authenticated SECURITY DEFINER functions that are exposed through RPC.
-- Apply after the main RLS policies and profile helpers exist.

begin;

create or replace function public.fn_mapear_linea_catalogo(
  p_descripcion text,
  p_sede text default 'nmb'::text
)
returns table(catalogo_id uuid, categoria text, nombre_catalogo text)
language plpgsql
stable
security definer
set search_path = public, extensions, pg_temp
as $$
begin
  if auth.role() = 'authenticated'
     and not public.auth_is_admin()
     and coalesce(p_sede, '') <> coalesce(public.get_my_sede(), '') then
    raise exception 'No autorizado' using errcode = '42501';
  end if;

  return query
  select c.id, c.categoria, c.nombre_producto
  from public.catalogo_insumos c
  where c.activo = true
    and c.sede = p_sede
    and (
      c.upc_sku = p_descripcion
      or c.nombre_producto ilike p_descripcion
      or exists (
        select 1
        from unnest(c.alias_ocr) a
        where lower(a) = lower(p_descripcion)
           or lower(p_descripcion) like '%' || lower(a) || '%'
      )
    )
  limit 1;
end;
$$;

revoke all on function public.fn_mapear_linea_catalogo(text, text) from public;
revoke all on function public.fn_mapear_linea_catalogo(text, text) from anon;
grant execute on function public.fn_mapear_linea_catalogo(text, text) to authenticated, service_role;

commit;
