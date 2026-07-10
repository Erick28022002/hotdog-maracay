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

La clave `SUPABASE_SERVICE_ROLE_KEY` se obtiene en Supabase > Project Settings >
API Keys. Nunca debe copiarse al frontend, subirse a GitHub ni enviarse por chat.

`RESEND_API_KEY` activa los correos de confirmacion. `ORDER_CONFIRMATION_FROM`
debe ser un remitente verificado en Resend, por ejemplo
`Hot Dog Maracay <orders@hotdogmaracay.com>`. `ORDER_NOTIFICATION_EMAIL` es el
correo interno del restaurante que recibira copia de cada orden pagada.

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
