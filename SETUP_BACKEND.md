# VFeria — backend desde cero (Google Sheets + Apps Script + Cloudflare R2)

Este paquete crea una primera API de servidor. No está desplegada hasta que completes los pasos siguientes. Haz pruebas con cuentas ficticias antes de usar datos reales.

## 0. Alcance y seguridad
- Google Sheets almacena usuarios, negocios, productos, sesiones y auditoría.
- Apps Script verifica usuario/contraseña, crea sesiones con vencimiento, limita productos a 30 y comprueba el negocio propietario en cada operación.
- Cloudflare Worker recibe cargas autenticadas y guarda los objetos en R2.
- No publiques `VFERIA_UPLOAD_SECRET` ni lo insertes en el JavaScript de la web.
- La autenticación de esta API requiere endurecimiento antes de producción: protección contra intentos repetidos, recuperación de contraseña, política de bloqueo, revisión de CORS y pruebas de seguridad. La función de contraseña utiliza SHA-256 iterado con salt por compatibilidad de Apps Script; para un sistema comercial con cuentas sensibles, considera un proveedor de identidad o hashing PBKDF2/bcrypt/Argon2 en un backend dedicado.

## 1. Crear la hoja de cálculo
1. Crea una hoja de cálculo nueva llamada `VFeria DB` en Google Drive.
2. En esa hoja abre **Extensiones → Apps Script**.
3. Reemplaza el contenido de `Code.gs` con el archivo `Code.gs` incluido aquí.
4. Guarda y ejecuta `setupVferia()` desde el editor.
5. Acepta los permisos solicitados.
6. Verifica que aparezcan las pestañas `Users`, `Businesses`, `Products`, `Sessions` y `Audit`.

## 2. Crear usuario inicial y emprendedores
1. En `Code.gs`, edita la función `createInitialAdmin()` y reemplaza `CAMBIAR_ADMIN` y `CAMBIAR_POR_UNA_CLAVE_LARGA_Y_UNICA` por un usuario y contraseña únicos de al menos 14 caracteres.
2. Ejecuta la función una sola vez. No reutilices la contraseña de tu correo.
3. Para cada emprendedor, edita `createEntrepreneurAccount()` con usuario, contraseña temporal y nombre comercial; ejecútala una vez por cuenta.
4. Guarda las contraseñas iniciales por un canal seguro y pide a los usuarios cambiarlas cuando se implemente el flujo de cambio de contraseña. No compartas la hoja con los emprendedores.

## 3. Crear el Worker de imágenes
1. En Cloudflare abre **Workers & Pages → Create → Worker**.
2. Crea un Worker, pega `worker.js` y despliega.
3. En **Settings → Bindings**, añade un binding de tipo **R2 bucket** llamado exactamente `R2_BUCKET` y selecciona el bucket de imágenes.
4. En **Settings → Variables and Secrets**, crea un secreto `VFERIA_UPLOAD_SECRET` con una cadena aleatoria larga (32+ bytes). No lo pongas en variables públicas ni en el código fuente.
5. Crea una variable `R2_PUBLIC_BASE_URL` con la URL pública de imágenes que configures para el bucket (dominio personalizado o URL pública de R2). Para producción se recomienda un subdominio propio como `imagenes.vferia.cl` cuando DNS esté activo.
6. Crea una variable `ALLOWED_ORIGIN` con el origen exacto de la web, por ejemplo `https://vferia.cl` (sin barra final). Durante las pruebas puedes usar el dominio `*.github.io` real que sirva el sitio; no dejes `*` en producción.
7. Despliega y prueba `https://TU-WORKER.workers.dev/health`.

**R2 público:** los objetos de catálogo necesitan poder verse en la web y Unity. Usa un dominio público de lectura para el bucket; la escritura permanece protegida por el secreto compartido entre Apps Script y Worker. No habilites escrituras públicas en el bucket.

## 4. Conectar Apps Script al Worker
En Apps Script abre **Project Settings → Script Properties** y añade:
- `R2_WORKER_URL` = URL base del Worker, por ejemplo `https://vferia-images.TUUSUARIO.workers.dev`.
- `R2_WORKER_SECRET` = exactamente el mismo secreto `VFERIA_UPLOAD_SECRET` del Worker.
- `VF_SPREADSHEET_ID` se guarda al ejecutar `setupVferia()`; no lo borres.

## 5. Publicar Apps Script como Web App
1. **Deploy → New deployment → Web app**.
2. Execute as: **Me**.
3. Who has access: **Anyone** (la API valida sesión dentro de cada operación; el endpoint de login debe ser público para autenticar).
4. Deploy, autoriza permisos y copia la URL que termina en `/exec`.
5. Prueba `URL/exec?action=health` en el navegador; debe responder JSON con `ok:true`.
6. Cada vez que actualices el código, crea una nueva versión del deployment o actualiza el deployment existente.

## 6. API implementada
Las solicitudes POST llevan JSON en `body` con una propiedad `action`:
- `login`: `{ "action":"login", "username":"...", "password":"..." }`
- `me`, `logout`, `getProfile`, `listProducts`: requieren `token`.
- `saveProfile`: requiere `token` y `profile`.
- `saveProduct`: requiere `token` y `product`.
- `deleteProduct`: requiere `token` y `productId`.
- `setProductPublished`: requiere `token`, `productId`, `published`.
- `uploadImage`: requiere `token`, `kind` (`logo` o `product`) y `base64` como Data URL de imagen JPEG/PNG/WEBP ya recortada.
- Lectura pública: `GET URL/exec?action=publicStore&businessId=...` devuelve sólo tiendas publicadas y productos publicados.

Nota técnica: `ContentService` de Apps Script no permite definir cabeceras CORS personalizadas. Antes de conectar el frontend en GitHub Pages, realiza una prueba real de `fetch` desde el dominio publicado. Si el navegador bloquea CORS, no desactives la seguridad: añade un proxy Worker para la API que reenvíe solicitudes a Apps Script y controle el origen. El frontend no debe guardar contraseñas ni tokens en `localStorage`; usa `sessionStorage` para la sesión y cierra sesión al expirar.

## 7. Antes de producción
- Implementar cambio y recuperación de contraseña.
- Añadir límites de intentos de login y alertas.
- Revisar política de contraseñas, hashing robusto y expiración/revocación de sesiones.
- Probar separación entre negocios y autorización de todas las acciones.
- Validar tamaño real, firma/MIME y contenido de imagen, no sólo extensión.
- Configurar dominio público de imágenes, HTTPS y política de caché.
- Añadir copias de seguridad de la hoja y política de retención de auditoría.
- No publicar datos personales en el endpoint público.
