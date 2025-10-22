# Ojedapreparacion Web (Español)

Landing page y herramientas de edición para la campaña de sorteos de Ojeda Preparación.

## Destacados
- Aplicación de una sola página que renderiza contenido dinámico desde `data/site-content.json`.
- Editor visual integrado con vista previa en vivo y guardado usando un servidor Express liviano.
- Cargador de imágenes que guarda archivos en `server/public/uploads/` y genera URL listas para usar.
- Lista para desplegar como sitio estático (Netlify, Vercel, GitHub Pages) o junto con el servidor Node.js incluido.

## Requisitos
- Node.js 18 o superior
- npm 9 o superior
- Navegador moderno (Chrome, Edge, Firefox)

## Puesta en marcha
```bash
npm install
npm run dev
```
El comando inicia el servidor Express en `http://localhost:5173`, sirve la SPA, expone `/api/content` para guardar el JSON y `/api/upload` para subir imágenes.

Detén el servidor con `Ctrl + C`.

## Estructura del proyecto
```
web/
├── data/                  # Contenido editable (site-content.json)
├── ganadoresanteriores/   # Página "Ganadores" precalculada
├── scripts/               # Lógica del sitio y editor visual
├── server/                # Servidor Express (API de contenido y uploads)
├── sorteo/                # Acceso directo a la landing principal
├── styles/                # Estilos globales (main.css)
├── index.html             # Entrada principal de la SPA
├── package.json           # Dependencias y scripts npm
└── README*.md, LICENCE    # Documentación y licencia
```

## Cómo editar el contenido
### Editor visual (recomendado)
1. Abre `http://localhost:5173`.
2. Haz clic en el botón flotante `?` para mostrar el panel.
3. Alterna entre las páginas "Sorteo" y "Ganadores", ajusta textos, secciones y tema.
4. Usa **Guardar cambios** para escribir en `data/site-content.json` (requiere el servidor encendido) o **Descargar JSON** para exportar el contenido.
5. Las imágenes subidas quedan en `server/public/uploads/` y devuelven una URL relativa reutilizable.

### Edición manual
1. Abre `data/site-content.json` con tu editor preferido.
2. Modifica las entradas en `pages[]`. Las secciones disponibles incluyen `richText`, `linkCards`, `imageGrid`, `imageCarousel`, `imageHighlight`, `cta` y `winnerCards`.
3. Valida el archivo (por ejemplo con https://jsonlint.com) antes de guardar para evitar errores.

## Despliegue
- **Hosting estático**: sube la carpeta `web/` (puedes omitir `server/` si no necesitas edición en vivo).
- **Hosting dinámico**: despliega el servidor Node.js (Render, Railway, Fly.io, VPS, etc.) y publica `/api/content` y `/api/upload` detrás de HTTPS.
- Realiza respaldos frecuentes de `data/site-content.json` y mantén `server/public/uploads/` fuera del control de versiones (ver `.gitignore`).

## Documentación relacionada
- `README.md`: versión en inglés para colaboradores internacionales.
- `INSTRUCTIVO.txt`: manual extendido para operadores.
- `LICENCE`: términos de la licencia MIT.

## Licencia
Distribuido bajo la licencia MIT. Consulta `LICENCE` para más detalles.
