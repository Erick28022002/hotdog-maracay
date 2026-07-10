# Despliegue seguro

## 1. Variables privadas en Vercel

En el proyecto del backend, abrir Settings > Environment Variables y configurar
para Production, Preview y Development:

- `SQUARE_ACCESS_TOKEN`
- `SQUARE_LOCATION_ID`
- `SQUARE_ENV=production`
- `SQUARE_WEBHOOK_KEY`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `RESEND_API_KEY`
- `ORDER_CONFIRMATION_FROM`
- `ORDER_NOTIFICATION_EMAIL`
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_USER`
- `SMTP_PASS`
- `ORDER_FROM_NMB`
- `ORDER_FROM_DORAL`
- `ORDER_FROM_DOWNTOWN`

La clave `SUPABASE_SERVICE_ROLE_KEY` se obtiene en Supabase > Project Settings >
API Keys. Nunca debe copiarse al frontend, subirse a GitHub ni enviarse por chat.

Para Microsoft 365 / Outlook, configurar:

- `SMTP_HOST=smtp.office365.com`
- `SMTP_PORT=587`
- `SMTP_USER=Miami@hotdogmaracay.com`
- `SMTP_PASS` con la contrasena segura/app password del buzon
- `ORDER_CONFIRMATION_FROM=Hot Dog Maracay Miami <Miami@hotdogmaracay.com>`

Si cada sede tiene su propio buzon, usar `ORDER_FROM_NMB`, `ORDER_FROM_DORAL`
y `ORDER_FROM_DOWNTOWN`. `ORDER_NOTIFICATION_EMAIL` es el correo interno del
restaurante que recibira copia de cada orden pagada.

`RESEND_API_KEY` queda como alternativa opcional. Si hay SMTP configurado, el
backend usa SMTP primero.

## 2. Despliegue coordinado

1. Configurar todas las variables privadas.
2. Desplegar este backend.
3. Confirmar que `/health` responde correctamente.
4. Desplegar el `index.html` actualizado inmediatamente despues.
5. Realizar un pedido real de importe pequeno y confirmar pago, recibo y KDS.
6. Aplicar `supabase-lockdown.sql` desde Supabase SQL Editor.
7. Confirmar que el KDS inicia sesion y puede leer y actualizar pedidos.

No desplegar solamente uno de los dos componentes: el frontend y el backend usan
un contrato de pedido nuevo y deben publicarse juntos.

## 3. Controles externos pendientes

- Configurar un limite de trafico para `/api/pay` en Vercel Firewall. El limite
  incluido en Express es una segunda barrera por instancia, no un limite global.
- Activar MFA en Vercel, Square, Supabase, GitHub y el proveedor del dominio.
- Revisar las tablas publicas sin RLS antes de habilitar RLS en bloque, porque el
  proyecto contiene otras aplicaciones que pueden depender de ellas.
