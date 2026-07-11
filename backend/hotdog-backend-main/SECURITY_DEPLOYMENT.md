# Despliegue seguro

## 1. Variables privadas en Vercel

En el proyecto del backend, abrir Settings > Environment Variables y configurar
para Production, Preview y Development:

- `SQUARE_NMB_ACCESS_TOKEN`
- `SQUARE_NMB_LOCATION_ID`
- `SQUARE_DORAL_ACCESS_TOKEN`
- `SQUARE_DORAL_LOCATION_ID`
- `SQUARE_DOWNTOWN_ACCESS_TOKEN`
- `SQUARE_DOWNTOWN_LOCATION_ID`
- `SQUARE_WEBHOOK_KEY`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ORDER_CONFIRMATION_FROM`
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_USER`
- `SMTP_PASS`
- `ORDER_FROM_NMB`
- `ORDER_FROM_DORAL`
- `ORDER_FROM_DOWNTOWN`
- `ORDER_NOTIFICATION_EMAIL_ENABLED=false`
- `ORDER_NOTIFICATION_EMAIL`

Variables opcionales:

- `SQUARE_ACCESS_TOKEN`
- `SQUARE_LOCATION_ID`
- `SQUARE_ENV=production`
- `RESEND_API_KEY`

`SQUARE_ACCESS_TOKEN` y `SQUARE_LOCATION_ID` solo quedan como respaldo para
webhooks POS antiguos que no incluyan `location_id`. Los pedidos web reales
deben usar las variables por sede. Una sede sin token o location ID propio queda
deshabilitada para pedidos online; nunca cae en la cuenta de otra sede.

La clave `SUPABASE_SERVICE_ROLE_KEY` se obtiene en Supabase > Project Settings >
API Keys. Nunca debe copiarse al frontend, subirse a GitHub ni enviarse por chat.

Para Microsoft 365 / Outlook, configurar:

- `SMTP_HOST=smtp.office365.com`
- `SMTP_PORT=587`
- `SMTP_USER=Miami@hotdogmaracay.com`
- `SMTP_PASS` con la contrasena segura/app password del buzon
- `ORDER_CONFIRMATION_FROM=Hot Dog Maracay Miami <Miami@hotdogmaracay.com>`

Si cada sede tiene su propio buzon, usar `ORDER_FROM_NMB`, `ORDER_FROM_DORAL`
y `ORDER_FROM_DOWNTOWN`.

El correo interno del restaurante queda apagado por defecto para no llenar la
bandeja. Para recibir copia de cada orden pagada, configurar:

- `ORDER_NOTIFICATION_EMAIL_ENABLED=true`
- `ORDER_NOTIFICATION_EMAIL=Miami@hotdogmaracay.com`

`RESEND_API_KEY` queda como alternativa opcional. Si hay SMTP configurado, el
backend usa SMTP primero.

## 2. Despliegue coordinado

1. Configurar todas las variables privadas.
2. Desplegar este backend.
3. Confirmar que `/health` responde correctamente.
4. Desplegar el `index.html` actualizado inmediatamente despues.
5. Realizar un pedido real de importe pequeno y confirmar pago, recibo y KDS.
6. Confirmar que el KDS real usa `status` y `sort_pos` como unicos updates
   directos sobre `web_orders`.
7. Aplicar `migration_checkout_persistence.sql` desde Supabase SQL Editor.
8. Aplicar `supabase-lockdown.sql` desde Supabase SQL Editor.
9. Aplicar `supabase-authenticated-functions-hardening.sql` desde Supabase SQL
   Editor para limitar RPC autenticadas por sede.
10. Aplicar `supabase-profile-identity-hardening.sql` desde Supabase SQL Editor
   para que solo cuentas activas/aprobadas otorguen acceso admin o por sede.
11. Aplicar `supabase-profiles-hardening.sql` desde Supabase SQL Editor para
   impedir cambios de rol/sede por self-service.
12. Aplicar `supabase-anon-hardening.sql` desde Supabase SQL Editor para quitar
   permisos anonimos directos sobre tablas y vistas internas.
13. Aplicar `supabase-admin-rpc-hardening.sql` desde Supabase SQL Editor para
   limitar RPC administrativas a `service_role`.
14. Aplicar `supabase-owner-financial-hardening.sql` desde Supabase SQL Editor
   para limitar datos financieros/contactos de duenos solo a administradores.
15. Aplicar `supabase-provider-access-hardening.sql` desde Supabase SQL Editor
   para limitar contactos de proveedores por sede.
16. Aplicar `supabase-authenticated-privileges-hardening.sql` desde Supabase SQL
   Editor para quitar permisos administrativos de tablas al rol autenticado.
17. Confirmar que el KDS inicia sesion y puede leer, ordenar y actualizar
   pedidos.

No desplegar solamente uno de los dos componentes: el frontend y el backend usan
un contrato de pedido nuevo y deben publicarse juntos.

## 3. Controles externos pendientes

- Configurar un limite de trafico para `/api/pay` en Vercel Firewall. El limite
  incluido en Express es una segunda barrera por instancia, no un limite global.
- Activar MFA en Vercel, Square, Supabase, GitHub y el proveedor del dominio.
- Revisar las tablas publicas sin RLS antes de habilitar RLS en bloque, porque el
  proyecto contiene otras aplicaciones que pueden depender de ellas.
- Antes de desplegar nuevamente el backend, reponer `SQUARE_WEBHOOK_KEY` en
  Vercel Production desde Square Dashboard. El despliegue activo conserva la
  clave, pero la variable ya no aparece en la lista actual de Production.
