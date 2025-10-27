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
5. Las imágenes subidas desde el panel se guardan en `server/public/uploads/` y devuelven una URL relativa (`/uploads/...`) que puedes reutilizar en el JSON.

### Edición manual
1. Abre `data/site-content.json` con tu editor preferido.
2. Modifica las entradas en `pages[]`. Las secciones disponibles incluyen `richText`, `linkCards`, `imageGrid`, `imageCarousel`, `imageHighlight`, `cta` y `winnerCards`.
3. Valida el archivo (por ejemplo con https://jsonlint.com) antes de guardar para evitar errores.

## Despliegue
- **Hosting estático**: Para un hosting estático (Netlify, Vercel, GitHub Pages, S3, etc.) basta con subir el contenido de la carpeta `web` sin el directorio `server/`. El sitio funciona como SPA.
- **Hosting dinámico**: Si se necesita permitir guardado en producción, despliega también el servidor Express en la infraestructura elegida y expón las rutas `/api/content` y `/api/upload` (HTTPS recomendado).
- Realiza respaldos frecuentes de `data/site-content.json` y mantén `server/public/uploads/` fuera del control de versiones (ver `.gitignore`).

## Despliegue con Docker
Este proyecto incluye un `Dockerfile` y `docker-compose.yml` para facilitar la creación y ejecución de la aplicación en un contenedor.

### Creando la imagen
Para construir la imagen de Docker, ejecuta el siguiente comando en el directorio `web`:
```bash
docker build -t elpelasorteos-web .
```

### Ejecutando el contenedor
Puedes ejecutar el contenedor usando `docker run` o `docker-compose`.

#### Usando `docker run`
```bash
docker run -p 8080:8080 -d --name elpelasorteos-web elpelasorteos-web
```

#### Usando `docker-compose`
El archivo `docker-compose.yml` está configurado para ejecutar la aplicación y un servidor Caddy como proxy inverso.
Para iniciar la aplicación, ejecuta el siguiente comando en el directorio `web`:
```bash
docker-compose up -d
```
Esto iniciará la aplicación web en el puerto 8080 y el servidor Caddy en los puertos 80 y 443.

## Pre-render (opcional, mejora SEO)
Genera snapshots HTML estáticos para rutas clave sin los scripts dinámicos.

```bash
npm run prerender
```

- Genera archivos en `dist/` para `/` y `/ganadoresanteriores/`.
- Remueve los `<script src="scripts/app.js">` y `scripts/editor.js` en los snapshots para que sean 100% estáticos.
- Útil si vas a subir a hosting estático (sube `dist/` como raíz del sitio) o si querés prerender en CI/CD.

## Documentación relacionada
- `README.md`: versión en inglés para colaboradores internacionales.
- `INSTRUCTIVO.txt`: manual extendido para operadores.
- `LICENCE`: términos de la licencia MIT.

## Mantenimiento del repositorio
- Evita commitear artefactos pesados (archivos de build, comprimidos).
- Antes de hacer commit, elimina diagnósticos y archivos temporales en la raíz:
  - Borrar `webv1.zip`.
  - Borrar archivos `diagnost*.txt`.
- `.gitignore` ya contempla patrones para archivos comprimidos (por ejemplo `*.zip`). Si aparecen localmente, elimínalos antes de `git add`.

## Solución de problemas frecuentes
- **El botón "Guardar cambios" falla**: confirma que `npm run dev` está activo y que el JSON es válido.
- **No se ven nuevas imágenes**: verifica que la subida terminó sin error y que el archivo exista en `server/public/uploads/`.
- **El sitio muestra pantalla en blanco**: abre la consola del navegador (F12 -> Console) y revisa errores de JSON o rutas inexistentes.
- **Error de permisos al guardar**: revisa que la carpeta `data/` tenga permisos de escritura.

## Licencia
Distribuido bajo la licencia MIT. Consulta `LICENCE` para más detalles.
