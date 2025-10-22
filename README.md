# Ojedapreparacion Web

Landing page and admin tooling for the Ojeda Preparacion sweepstakes campaign.

## Highlights
- Single-page application that renders dynamic content from `data/site-content.json`.
- Built-in visual editor with live preview and content persistence via a lightweight Express server.
- Image uploader that stores assets under `server/public/uploads/` and rewrites URLs automatically.
- Ready to deploy as a static site (Netlify, Vercel, GitHub Pages) or behind the bundled Node.js server.

## Requirements
- Node.js 18+
- npm 9+ (comes with recent Node.js releases)
- Modern browser (Chrome, Edge, Firefox)

## Quick start
```bash
npm install
npm run dev
```
The command above starts the Express server on `http://localhost:5173`, serves the SPA, exposes the `/api/content` endpoint to persist JSON edits, and `/api/upload` to handle image uploads.

Stop the server at any time with `Ctrl + C`.

## Project layout
```
web/
├── data/                  # Editable content (site-content.json)
├── ganadoresanteriores/   # Pre-rendered "Ganadores" page
├── scripts/               # Front-end logic and visual editor
├── server/                # Express server (content + uploads API)
├── sorteo/                # Shortcut to the main landing page
├── styles/                # Global styles (main.css)
├── index.html             # Entry point served by the SPA
├── package.json           # Dependencies and npm scripts
└── README*.md, LICENCE    # Documentation and licensing
```

## Editing content
### Visual editor (recommended)
1. Open `http://localhost:5173`.
2. Click the floating `?` button to open the editor panel.
3. Switch between the "Sorteo" and "Ganadores" pages, update hero copy, manage sections, and change theming.
4. Use **Save changes** to persist directly to `data/site-content.json` (server must be running) or **Download JSON** to export the content manually.
5. Uploading images from the editor stores them under `server/public/uploads/` and returns a relative URL you can reuse in the JSON.

### Manual edit
1. Open `data/site-content.json` in your editor of choice.
2. Update the relevant `pages[]` entries. Section types include `richText`, `linkCards`, `imageGrid`, `imageCarousel`, `imageHighlight`, `cta`, and `winnerCards`.
3. Validate the file (for example with https://jsonlint.com) before saving to avoid broken builds.

## Deploying
- **Static hosting**: build assets manually (no bundler required) and upload the `web/` directory, excluding `server/` if you do not need runtime editing.
- **Dynamic hosting**: deploy the Node.js server (e.g., on Render, Railway, Fly.io, VPS). Keep `/api/content` and `/api/upload` behind HTTPS if exposed publicly.
- Backup `data/site-content.json` regularly and keep `server/public/uploads/` outside of version control (see `.gitignore`).

## Pre-render (optional, SEO-friendly)
Create static HTML snapshots for key routes without dynamic scripts.

```bash
npm run prerender
```

- Outputs `dist/` snapshots for `/` and `/ganadoresanteriores/`.
- Strips `<script src="scripts/app.js">` and `scripts/editor.js` from snapshots to make them fully static.
- Useful for static hosting (upload `dist/` as your site root) or CI/CD pre-rendering.

## Related docs
- `README_es.md`: localized quick start in Spanish.
- `INSTRUCTIVO.txt`: extended operator manual for editors and stakeholders.
- `LICENCE`: licensing terms (MIT).

## License
Distributed under the MIT License. See `LICENCE` for full details.
