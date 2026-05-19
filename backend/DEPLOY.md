# Desplegar el Backend en Railway

## Paso 1 — Conseguir tus credenciales de Square

### Location IDs (uno por sede)
1. Ve a **squareup.com** → inicia sesión
2. `Account & Settings` → `Business` → `Locations`
3. Haz clic en **North Miami** → copia el **Location ID** (ej: `LXXXXXXXXXXXXXXXXX`)
4. Repite para **Doral** y **Downtown Miami**

### Access Token
1. Ve a **developer.squareup.com** → inicia sesión
2. `Applications` → tu app (Hot Dog Maracay)
3. `Credentials` → copia **"Production Access Token"** (empieza con `EAAA...`)

---

## Paso 2 — Actualizar el backend en Railway

### Opción A: desde Railway Dashboard (más fácil)

1. Ve a **railway.app** → tu proyecto `hotdog-backend`
2. Haz clic en el servicio (el recuadro del backend)
3. Ve a la pestaña **"Variables"**
4. Agrega estas variables una por una:

| Variable | Valor |
|---|---|
| `SQUARE_ACCESS_TOKEN` | Tu token (EAAA...) |
| `SQUARE_ENV` | `production` |
| `LOC_NORTHMIAMI` | ID de North Miami (L...) |
| `LOC_DORAL` | ID de Doral (L...) |
| `LOC_DOWNTOWN` | ID de Downtown Miami (L...) |

5. Sube el nuevo `server.js` y `package.json` a tu repositorio de GitHub
6. Railway redesplegará automáticamente

### Opción B: nuevo proyecto en Railway (si prefieres empezar de cero)

1. Ve a **railway.app** → `New Project` → `Deploy from GitHub repo`
2. Selecciona el repo `hotdog-maracay`
3. En **"Root Directory"** pon: `backend`
4. Agrega las variables del Paso 2 en la pestaña `Variables`
5. Railway desplegará automáticamente

---

## Paso 3 — Verificar que funciona

Abre en el navegador:
```
https://TU-BACKEND.up.railway.app/health
```

Deberías ver algo así:
```json
{
  "status": "ok",
  "squareConnected": true,
  "sedes": "North Miami: LXXX, Doral: LXXX, Downtown Miami: LXXX"
}
```

Si `squareConnected` es `false`, revisa el `SQUARE_ACCESS_TOKEN`.
Si alguna sede dice `SIN CONFIGURAR`, revisa los `LOC_*`.

---

## Paso 4 — Actualizar la URL en el KDS

Si la URL de tu backend cambió, edita esta línea en `kds.html`:

```javascript
const BACKEND = 'https://TU-NUEVA-URL.up.railway.app';
```

---

## Cómo funciona el flujo completo

```
Cliente en la web
       ↓ hace pedido con tarjeta
hotdogmaracay.com → POST /api/pay → Railway Backend
                                         ↓
                                   Cobra con Square ✓
                                   Guarda pedido en DB
                                         ↓
Cliente en POS (tablet Square)     Backend consulta
       ↓ toma pedido               Square cada 5s
Square crea orden en su sistema →  Guarda pedido en DB
                                         ↓
                               KDS (North Miami / Doral / Downtown)
                               consulta GET /api/orders?location=X
                                         ↓
                                   Muestra pedidos en cocina ✓
```
