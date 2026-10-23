# Fusion Dashboard

Store Analysis dashboard de Fusion Restaurant Group, desplegado en Netlify.

## Subir a GitHub
1. Crear un repositorio **privado** en GitHub (ej. `fusion-dashboard`).
2. Subir el contenido de esta carpeta a la raíz del repo (Add file → Upload files, o `git push`).
3. En Netlify: Add new site → Import from Git → elegir el repo. Build command: vacío. Publish directory: `.`
4. Configurar las variables de entorno en Netlify (ver `PASOS_PRODUCCION.md`): `COGNITO_ODATA_URL`, `COGNITO_API_KEY`, `DASHBOARD_PASSWORD`, `SESSION_SECRET`.

Nunca guardar contraseñas ni API keys en el repo; van solo en las variables de Netlify.
