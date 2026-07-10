-- Restrict administrative SECURITY DEFINER RPCs that are not called directly by
-- the public web checkout or the real KDS pages.

begin;

revoke execute on function public.calcular_pool_propinas_semanal(uuid) from public;
revoke execute on function public.calcular_pool_propinas_semanal(uuid) from anon;
revoke execute on function public.calcular_pool_propinas_semanal(uuid) from authenticated;
grant execute on function public.calcular_pool_propinas_semanal(uuid) to service_role;

revoke execute on function public.cerrar_semana(uuid) from public;
revoke execute on function public.cerrar_semana(uuid) from anon;
revoke execute on function public.cerrar_semana(uuid) from authenticated;
grant execute on function public.cerrar_semana(uuid) to service_role;

revoke execute on function public.process_pos_transaction(uuid) from public;
revoke execute on function public.process_pos_transaction(uuid) from anon;
revoke execute on function public.process_pos_transaction(uuid) from authenticated;
grant execute on function public.process_pos_transaction(uuid) to service_role;

commit;
