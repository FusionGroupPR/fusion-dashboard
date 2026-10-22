# Poner en producción · Dashboard Store Analysis (Fusion Restaurant Group)

## 0. Antes de empezar
- [ ] Cuenta en **Netlify** (netlify.com) y en **GitHub** (recomendado).
- [ ] Acceso de administrador a **Cognito Forms**.
- [ ] Revocar la API key que se compartió en el chat y crear una nueva (Cognito → Settings → Integrations → tu integración → API Keys).

## 1. Preparar Cognito
1. Abre el formulario **STORE ANALYSIS REPORT** → **Entries**.
2. Usa (o crea) una **vista de cuadrícula** que incluya: `STORE`, `WEEKENDING`, `FOODCOST_SALES2`, `FOODCOST_PURCHASE`, `FOODCOST_BEGINNINV`, `FOODCOST_ENDINGINV`, `LABORCOST_LABOR`, `Entry_DateSubmitted`.
3. Copia la **URL OData** de esa vista (la misma que usa Power BI: Transformar datos → Configuración de origen de datos).
   - Si la URL trae `?access_token=...`, no necesitas la API key.
   - Si no, usarás la API key nueva (paso 3).

## 2. Subir el código
**Opción A: GitHub (recomendada, permite actualizar fácil)**
1. Crea un repositorio **privado** en GitHub, por ejemplo `fusion-dashboard`.
2. Sube **todo el contenido** de la carpeta `netlify-deploy` (index.html, api.js, config.js, support.js, netlify.toml y la carpeta `netlify/`).
3. En Netlify: **Add new site → Import an existing project → GitHub** → elige el repositorio.
4. Build command: *(vacío)* · Publish directory: `.` → **Deploy**.

**Opción B: desde tu computadora (Netlify CLI)**
```
cd netlify-deploy
npx netlify-cli login
npx netlify-cli init
npx netlify-cli deploy --prod
```
> No uses "arrastrar y soltar": no publica las funciones `/api`.

## 3. Variables de entorno
Netlify → tu sitio → **Site configuration → Environment variables → Add a variable**:

| Variable | Valor |
|---|---|
| `COGNITO_ODATA_URL` | URL OData del paso 1 |
| `COGNITO_API_KEY` | API key nueva (solo si la URL no trae `access_token`) |
| `DASHBOARD_PASSWORD` | Contraseña para los usuarios del dashboard |
| `SESSION_SECRET` | Texto aleatorio de 32+ caracteres |

Para generar `SESSION_SECRET`: https://www.random.org/strings/ o en terminal `openssl rand -base64 32`.

Luego: **Deploys → Trigger deploy → Deploy site** (las variables solo aplican tras un nuevo deploy).

## 4. Verificar
1. Abre `https://TU-SITIO.netlify.app` → entra con `DASHBOARD_PASSWORD`.
2. En otra pestaña (ya con sesión): `https://TU-SITIO.netlify.app/api/data?debug=1`
   - Debe mostrar `total` (número de entradas) y 2 ejemplos.
3. Compara con Power BI la última semana: **Registros**, **AVG Ventas**, **Labor Cost %** y la pestaña **Pendientes**.

| Síntoma | Causa probable |
|---|---|
| "Contraseña incorrecta" siempre | Falta `DASHBOARD_PASSWORD` o no se hizo redeploy |
| `Cognito respondió 401` | Token/API key inválido o revocado |
| `Falta COGNITO_ODATA_URL` | Variable no creada o sin redeploy |
| Valores en 0 | Nombre de campo distinto → revisar `debug=1` y `FIELDS` en `netlify/functions/data.mjs` |
| Página en blanco | Falta algún archivo (support.js, api.js, config.js) |

## 5. Ajustes finales
- **Nombre del sitio:** Site configuration → Change site name (ej. `fusion-store-analysis`).
- **Dominio propio (opcional):** Domain management → Add a domain (ej. `dashboard.fusiongrouppr.com`) y crear el registro CNAME que indique Netlify.
- **HTTPS:** automático en Netlify.
- Compartir la URL y la contraseña con los 3 usuarios por un canal privado.

## 6. Mantenimiento
- **Cambiar contraseña:** editar `DASHBOARD_PASSWORD` → Trigger deploy. Las sesiones activas expiran en 12 h.
- **Metas, colores, tiendas cerradas, minutos de refresco:** editar `config.js` → subir a GitHub (redeploy automático).
- **Rotar API key de Cognito:** crear nueva → actualizar `COGNITO_API_KEY` → Trigger deploy → revocar la anterior.
- **Modo demo para presentaciones:** agregar `?demo=1` a la URL.
