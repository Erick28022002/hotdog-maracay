-- Adds covering indexes for foreign keys reported by Supabase Performance Advisor.
-- These indexes improve joins and FK checks as operational tables grow.

create index if not exists idx_aprendizaje_mapeos_linea_id
  on public.aprendizaje_mapeos (linea_id);

create index if not exists idx_aprendizaje_mapeos_variante_anterior_id
  on public.aprendizaje_mapeos (variante_anterior_id);

create index if not exists idx_aprendizaje_mapeos_variante_correcta_id
  on public.aprendizaje_mapeos (variante_correcta_id);

create index if not exists idx_cierres_caja_submitted_by_user_id
  on public.cierres_caja (submitted_by_user_id);

create index if not exists idx_closing_owner_distributions_owner_id
  on public.closing_owner_distributions (owner_id);

create index if not exists idx_combo_componentes_componente_receta_id
  on public.combo_componentes (componente_receta_id);

create index if not exists idx_egresos_owner_id
  on public.egresos (owner_id);

create index if not exists idx_facturas_compra_lineas_variante_producto_id
  on public.facturas_compra_lineas (variante_producto_id);

create index if not exists idx_historial_precios_proveedor_referencia_orden_id
  on public.historial_precios_proveedor (referencia_orden_id);

create index if not exists idx_mapeos_ia_productos_producto_maestro_id
  on public.mapeos_ia_productos (producto_maestro_id);

create index if not exists idx_mapeos_ia_productos_variante_producto_id
  on public.mapeos_ia_productos (variante_producto_id);

create index if not exists idx_movimientos_inventario_producto_maestro_id
  on public.movimientos_inventario (producto_maestro_id);

create index if not exists idx_movimientos_inventario_variante_id
  on public.movimientos_inventario (variante_id);

create index if not exists idx_pos_extra_mapping_producto_maestro_id
  on public.pos_extra_mapping (producto_maestro_id);

create index if not exists idx_profiles_approved_by
  on public.profiles (approved_by);

create index if not exists idx_revision_facturas_linea_id
  on public.revision_facturas (linea_id);

create index if not exists idx_tip_distribution_employee_id
  on public.tip_distribution (employee_id);

create index if not exists idx_variantes_producto_proveedor_preferido_id
  on public.variantes_producto (proveedor_preferido_id);

create index if not exists idx_ventas_cola_descuento_receta_id
  on public.ventas_cola_descuento (receta_id);

create index if not exists idx_ventas_cola_descuento_reversa_de_id
  on public.ventas_cola_descuento (reversa_de_id);

create index if not exists idx_ventas_extras_producto_maestro_id
  on public.ventas_extras (producto_maestro_id);
