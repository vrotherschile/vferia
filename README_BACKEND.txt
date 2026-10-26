VFeria Web + Backend Starter

Este paquete conserva el prototipo web original y añade los archivos iniciales para construir el backend:
- Code.gs: API Google Apps Script y creación de hojas de Google Sheets.
- worker.js: Worker de Cloudflare para almacenar imágenes en R2.
- SETUP_BACKEND.md: guía de instalación paso a paso.

IMPORTANTE: el frontend original aún funciona como prototipo local. No está conectado todavía a esta API. Primero instala y prueba el backend siguiendo SETUP_BACKEND.md; después debe actualizarse site.js para conectar login, perfil, productos y cargas de imagen, y resolver CORS mediante proxy Worker si el navegador lo requiere. No publiques este sistema como producción hasta completar esa integración y pruebas de seguridad.
