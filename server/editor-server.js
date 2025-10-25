require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const sharp = require('sharp');
const { randomUUID } = require('crypto');

const app = express();

// === SECURITY FLAGS ===
// Habilitar el editor por defecto (solo deshabilitar si EDITOR_ENABLED='false')
const EDITOR_ENABLED = process.env.EDITOR_ENABLED !== 'false';
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';

// Exponer flag al frontend
app.get('/api/config', (req, res) => {
  const tokenRequired = !isLocalRequest(req) && !!ADMIN_TOKEN;
  res.json({ editorEnabled: EDITOR_ENABLED, tokenRequired });
});

function requireEditorEnabled(_req, res, next) {
  if (!EDITOR_ENABLED) return res.status(403).json({ error: 'editor disabled' });
  next();
}
function isLocalRequest(req) {
  try {
    const host = (req.hostname || '').toLowerCase();
    const ip = (req.ip || '').toLowerCase();
    const fwd = String(req.headers['x-forwarded-for'] || '').toLowerCase();
    const isHostLocal = host === 'localhost' || host === '127.0.0.1';
    const isIpLocal = ip === '127.0.0.1' || ip === '::1' || ip.startsWith('::ffff:127.0.0.1');
    const forwardedLocals = fwd.split(',').map(s => s.trim());
    const isFwdLocal = forwardedLocals.some(x => x === '127.0.0.1' || x === '::1' || x.startsWith('::ffff:127.0.0.1'));
    return isHostLocal || isIpLocal || isFwdLocal;
  } catch (_) {
    return false;
  }
}

function requireAdmin(req, res, next) {
  // En local, no exigir token para facilitar edición
  if (isLocalRequest(req)) return next();
  const token = req.get('x-admin-token') || req.query.token || '';
  if (!token || token !== ADMIN_TOKEN) return res.status(401).json({ error: 'unauthorized' });
  next();
}

// === CONFIG ===
const PORT = process.env.PORT || 5173;                  // one port, one server
const ROOT_DIR = path.join(__dirname, '..');            // index.html, scripts, styles, data
const PUBLIC_DIR = path.join(__dirname, 'public');      // /server/public
const UPLOAD_DIR = path.join(PUBLIC_DIR, 'uploads');    // /server/public/uploads
const CONTENT_PATH = path.join(ROOT_DIR, 'data', 'site-content.json');

// ensure folders exist
if (!fs.existsSync(PUBLIC_DIR)) fs.mkdirSync(PUBLIC_DIR, { recursive: true });
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// middlewares
// Aumentar límite para contenidos más grandes
app.use(express.json({ limit: '10mb' }));
app.use(express.static(ROOT_DIR));
app.use('/uploads', express.static(UPLOAD_DIR));

// ===== API: content =====
app.get('/api/content', (_req, res) => {
  try {
    const data = fs.readFileSync(CONTENT_PATH, 'utf8');
    res.json(JSON.parse(data));
  } catch (e) {
    console.error('GET /api/content', e);
    res.status(500).json({ error: 'No se pudo leer el contenido' });
  }
});

app.put('/api/content', requireEditorEnabled, requireAdmin, (req, res) => {
  try {
    fs.writeFileSync(CONTENT_PATH, JSON.stringify(req.body, null, 2), 'utf8');
    res.json({ ok: true });
  } catch (e) {
    console.error('PUT /api/content', e);
    res.status(500).json({ error: 'No se pudo guardar el contenido' });
  }
});

// ===== API: uploader =====
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const safe = file.originalname.toLowerCase().replace(/[^a-z0-9._-]/g, '_');
    cb(null, `${Date.now()}_${safe}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (_req, file, cb) => {
    const ok = ['image/jpeg','image/png','image/webp','image/gif'].includes(file.mimetype);
    cb(ok ? null : new Error('Tipo no permitido'), ok);
  },
});

app.post('/api/upload', requireEditorEnabled, requireAdmin, upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const uid = randomUUID();
    const baseName = req.file.originalname
      .toLowerCase()
      .replace(/[^a-z0-9._-]/g, '_')
      .replace(/\.(jpg|jpeg|png|webp|gif)$/i, '');

    const outMain = path.join(UPLOAD_DIR, `${uid}_${baseName}.webp`);
    const outThumb = path.join(UPLOAD_DIR, `${uid}_${baseName}-thumb.webp`);

    const isBanner = /banner|hero/i.test(baseName);

    const pipeline = sharp(req.file.path)
      .rotate()
      .resize({ width: isBanner ? 1600 : 1000, withoutEnlargement: true })
      .webp({ quality: 100 });

    await pipeline.toFile(outMain);

    await sharp(req.file.path)
      .rotate()
      .resize({ width: 500, withoutEnlargement: true })
      .webp({ quality: 100 })
      .toFile(outThumb);

    try { fs.unlinkSync(req.file.path); } catch {}

    res.json({
      url: `/uploads/${path.basename(outMain)}`,
      thumb: `/uploads/${path.basename(outThumb)}`
    });
  } catch (e) {
    console.error('POST /api/upload', e);
    res.status(500).json({ error: 'No se pudo subir la imagen' });
  }
});

// fallback SPA
app.get('*', (_req, res) => res.sendFile(path.join(ROOT_DIR, 'index.html')));

app.listen(PORT, () => {
  console.log(`Server unico en http://localhost:${PORT}`);
});
