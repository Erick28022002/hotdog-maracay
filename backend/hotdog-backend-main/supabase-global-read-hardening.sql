-- Require an approved active account for global catalog/reference reads.
-- This prevents pending or inactive authenticated accounts from reading
-- operational catalog, recipe, mapping, and reference tables.

begin;

drop policy if exists combo_componentes_read on public.combo_componentes;
create policy combo_componentes_read
on public.combo_componentes
for select
to authenticated
using (public.auth_is_admin() or public.get_my_sede() <> '__no_sede__');

drop policy if exists ec_read on public.expense_categories;
create policy ec_read
on public.expense_categories
for select
to authenticated
using (public.auth_is_admin() or public.get_my_sede() <> '__no_sede__');

drop policy if exists mip_read on public.mapeos_ia_productos;
create policy mip_read
on public.mapeos_ia_productos
for select
to authenticated
using (public.auth_is_admin() or public.get_my_sede() <> '__no_sede__');

drop policy if exists all_read_recipes on public.product_recipes;
create policy all_read_recipes
on public.product_recipes
for select
to authenticated
using (public.auth_is_admin() or public.get_my_sede() <> '__no_sede__');

drop policy if exists productos_read on public.productos_maestros;
create policy productos_read
on public.productos_maestros
for select
to authenticated
using (public.auth_is_admin() or public.get_my_sede() <> '__no_sede__');

drop policy if exists receta_ingredientes_read on public.receta_ingredientes;
create policy receta_ingredientes_read
on public.receta_ingredientes
for select
to authenticated
using (public.auth_is_admin() or public.get_my_sede() <> '__no_sede__');

drop policy if exists sedes_corp_read on public.sedes_corporativo;
create policy sedes_corp_read
on public.sedes_corporativo
for select
to authenticated
using (public.auth_is_admin() or public.get_my_sede() <> '__no_sede__');

drop policy if exists vp_read on public.variantes_producto;
create policy vp_read
on public.variantes_producto
for select
to authenticated
using (public.auth_is_admin() or public.get_my_sede() <> '__no_sede__');

drop policy if exists vex_read on public.ventas_extras;
create policy vex_read
on public.ventas_extras
for select
to authenticated
using (public.auth_is_admin() or public.get_my_sede() <> '__no_sede__');

commit;
