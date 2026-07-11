-- Make product recipe writes use the hardened admin helper.
-- Older policy checked profiles.role directly and did not require active/approved
-- account status.

begin;

drop policy if exists admin_write_rec on public.product_recipes;
create policy admin_write_rec
on public.product_recipes
for all
to authenticated
using (public.auth_is_admin())
with check (public.auth_is_admin());

commit;
