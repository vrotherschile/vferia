# VFeria — prototipo web actualizado

Páginas: `index.html` (web informativa), `login.html` (acceso de demostración), `panel.html` (administración) y `muestra.html` (tienda de muestra).

## Editor de imágenes
- Logo: lienzo 2:1 y salida 1080 × 540 px; se recomienda original de al menos 740 × 370 px.
- Productos: lienzo cuadrado y salida 1000 × 1000 px; se recomienda original de al menos 300 × 300 px.
- Opción para rellenar el marco o mostrar la imagen completa, además de control de zoom.
- Acepta originales de hasta 15 MB y los comprime al aplicar. No hace falta editar imágenes en programas externos.

Cada producto tiene enlace de venta en línea y enlace social opcional. Para probar, inicia sesión con cualquier usuario y contraseña no vacíos, edita el panel, guarda y pulsa “Ver mi tienda de muestra”.

## Limitaciones
Los datos se guardan en `localStorage`; no se publican ni sincronizan entre dispositivos. El acceso no valida credenciales reales. Antes de producción, conectar autenticación segura, API, base de datos y almacenamiento como Cloudflare R2. Guardar URLs de objetos en la base de datos, no imágenes Base64.
