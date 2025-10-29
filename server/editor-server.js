require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const sharp = require('sharp');
const { randomUUID } = require('crypto');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');

const app = express();
const { spawn } = require('child_process');

// === CONFIG ===
const PORT = process.env.PORT || 5173;
const ROOT_DIR = path.join(__dirname, '..');
const PUBLIC_DIR = path.join(__dirname, 'public');
const UPLOAD_DIR = path.join(PUBLIC_DIR, 'uploads');
const CONTENT_PATH = path.join(ROOT_DIR, 'data', 'site-content.json');

// === SECURITY ===
const ADMIN_USER = process.env.ADMIN_USER;
const ADMIN_PASS = process.env.ADMIN_PASS;
const ADMIN_JWT_SECRET = process.env.ADMIN_JWT_SECRET || 'dev-secret-change-me';

// ensure folders exist
if (!fs.existsSync(PUBLIC_DIR)) fs.mkdirSync(PUBLIC_DIR, { recursive: true });
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// middlewares
app.use(express.json({ limit: '10mb' }));
app.use(cookieParser());

// ===== AUTH =====

// Emite cookie de sesión admin
function issueAdminCookie(res, payload) {
  const token = jwt.sign(payload, ADMIN_JWT_SECRET, { expiresIn: '12h' });
  res.cookie('admin_session', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production', // true si estás en HTTPS
    maxAge: 12 * 60 * 60 * 1000,
  });
}

// Comprueba si la request es admin por cookie
function isAdmin(req) {
  const t = req.cookies?.admin_session;
  if (!t) return false;
  try {
    jwt.verify(t, ADMIN_JWT_SECRET);
    return true;
  } catch {
    return false;
  }
}

function requireAdmin(req, res, next) {
  if (!isAdmin(req)) return res.status(401).json({ ok: false, error: 'No autorizado' });
  next();
}

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
});

app.post('/api/auth/login', loginLimiter, (req, res) => {
  const { username, password } = req.body || {};
  if (username === ADMIN_USER && password === ADMIN_PASS) {
    issueAdminCookie(res, { u: username });
    return res.json({ ok: true });
  }
  return res.status(401).json({ ok: false, error: 'Credenciales inválidas' });
});

app.post('/api/auth/logout', (req, res) => {
  res.clearCookie('admin_session');
  res.json({ ok: true });
});

app.get('/api/auth/check', (req, res) => {
  res.json({ ok: true, isAdmin: isAdmin(req) });
});

// ===== API: pagos (consulta SQLite via Python) =====
// Evita mantener un microservicio aparte; llama un script Python que usa sqlite3 (stdlib)
app.get('/api/payments/verificar', async (req, res) => {
  try {
    const op = String(req.query.op || '').trim();
    if (!/^\d{6,24}$/.test(op)) {
      return res.status(200).json({ ok: false, verified: false, mensaje: 'Ingresá un número válido (6-24 dígitos).' });
    }

    const scriptPath = path.join(ROOT_DIR, 'microservices', 'integracion_mercadopago_app', 'scripts', 'query_payment.py');

    // Helper para ejecutar Python con fallback a 'py' en Windows
    const runPython = (cmd) => new Promise((resolve, reject) => {
      const child = spawn(cmd, [scriptPath, op], {
        cwd: path.dirname(scriptPath),
        env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
        stdio: ['ignore', 'pipe', 'pipe']
      });
      let out = '';
      let err = '';
      child.stdout.on('data', (d) => { out += d.toString(); });
      child.stderr.on('data', (d) => { err += d.toString(); });
      child.on('close', (code) => {
        if (code === 0) return resolve(out);
        reject(new Error(err || `python exit ${code}`));
      });
      child.on('error', reject);
    });

    let raw;
    try {
      raw = await runPython('python');
    } catch (_) {
      try {
        raw = await runPython(process.platform === 'win32' ? 'py' : 'python3');
      } catch (err2) {
        console.error('GET /api/payments/verificar', err2);
        return res.status(200).json({ ok: false, verified: false, mensaje: 'No se pudo comprobar ahora. Intentá más tarde.' });
      }
    }

    const data = JSON.parse(raw);
    return res.json(data);
  } catch (e) {
    console.error('GET /api/payments/verificar', e);
    return res.status(200).json({ ok: false, verified: false, mensaje: 'No se pudo comprobar ahora. Intentá más tarde.' });
  }
});


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

// El endpoint de guardado ahora requiere ser admin
app.put('/api/content', requireAdmin, (req, res) => {
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

// Uploader para videos (guardar tal cual, sin procesar)
const videoUpload = multer({
  storage,
  limits: { fileSize: 200 * 1024 * 1024 }, // 200 MB
  fileFilter: (_req, file, cb) => {
    const allowed = [
      'video/mp4',
      'video/webm',
      'video/ogg',
      'video/quicktime',
      'application/octet-stream' // algunos navegadores etiquetan así
    ];
    const ok = allowed.includes(file.mimetype);
    cb(ok ? null : new Error('Tipo de video no permitido'), ok);
  }
});

// El endpoint de subida ahora requiere ser admin
app.post('/api/upload', requireAdmin, upload.single('image'), async (req, res) => {
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

// Subida de videos para fondos
app.post('/api/upload-video', requireAdmin, videoUpload.single('video'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const uid = randomUUID();
    const baseName = req.file.originalname
      .toLowerCase()
      .replace(/[^a-z0-9._-]/g, '_');

    // Guardamos el archivo tal cual, manteniendo extensión
    const outPath = path.join(UPLOAD_DIR, `${uid}_${baseName}`);
    fs.renameSync(req.file.path, outPath);

    return res.json({ url: `/uploads/${path.basename(outPath)}` });
  } catch (e) {
    console.error('POST /api/upload-video', e);
    return res.status(500).json({ error: 'No se pudo subir el video' });
  }
});

// ===== STATIC & FALLBACK =====
// Servir archivos estáticos desde el root y los uploads
app.use(express.static(ROOT_DIR));
app.use('/uploads', express.static(UPLOAD_DIR));

// fallback SPA
app.get('*', (_req, res) => res.sendFile(path.join(ROOT_DIR, 'index.html')));

app.listen(PORT, () => {
  console.log(`Server unico en http://localhost:${PORT}`);
});
