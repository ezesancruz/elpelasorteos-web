#!/usr/bin/env node
/**
 * Fase 2: Saneamiento de JSON (thumbs/base64 → archivos)
 * - Busca valores data URI (base64) en `data/site-content.json`.
 * - Convierte a archivos físicos en `server/public/uploads` con nombre estable por hash.
 * - Reemplaza en el JSON el valor por la URL `/uploads/...`.
 * - Crea backup con timestamp antes de sobrescribir.
 * - Salida por consola: resumen de cambios.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const DATA_JSON = path.join(ROOT, 'data', 'site-content.json');
const UPLOADS_DIR = path.join(ROOT, 'server', 'public', 'uploads');
const TXT_DIR = path.join(ROOT, 'txt');

function ensureDir(dir) { if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true }); }

function ts() {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function isDataUri(str) {
  return typeof str === 'string' && /^data:(image\/[a-zA-Z0-9.+-]+);base64,/.test(str);
}

function extFromMime(mime) {
  if (mime === 'image/webp') return '.webp';
  if (mime === 'image/jpeg') return '.jpg';
  if (mime === 'image/png') return '.png';
  if (mime === 'image/gif') return '.gif';
  return '.bin';
}

function writeIfNeeded(buf, hint, mime) {
  ensureDir(UPLOADS_DIR);
  const hash = crypto.createHash('sha1').update(buf).digest('hex');
  const ext = extFromMime(mime);
  const suffix = /thumb/i.test(hint) ? '_thumb' : ''; // usar sufijo si la clave sugiere thumb
  const file = `${hash}${suffix}${ext}`;
  const abs = path.join(UPLOADS_DIR, file);
  if (!fs.existsSync(abs)) fs.writeFileSync(abs, buf);
  return `/uploads/${file}`;
}

function traverseAndReplace(node, onReplace) {
  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i++) {
      node[i] = traverseAndReplace(node[i], onReplace);
    }
    return node;
  } else if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) {
      node[k] = traverseAndReplaceWithKey(v, k, onReplace);
    }
    return node;
  }
  return node;
}

function traverseAndReplaceWithKey(value, key, onReplace) {
  if (typeof value === 'string' && isDataUri(value)) {
    const m = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.*)$/s.exec(value);
    if (m) {
      const mime = m[1];
      const b64 = m[2];
      try {
        const buf = Buffer.from(b64, 'base64');
        const url = writeIfNeeded(buf, key, mime);
        onReplace({ key, mime, bytes: buf.length, url });
        return url;
      } catch (e) {
        return value; // conservar si falla
      }
    }
  }
  // continuar descendiendo
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      value[i] = traverseAndReplace(value[i], onReplace);
    }
    return value;
  } else if (value && typeof value === 'object') {
    for (const [k2, v2] of Object.entries(value)) {
      value[k2] = traverseAndReplaceWithKey(v2, k2, onReplace);
    }
    return value;
  }
  return value;
}

function main() {
  ensureDir(TXT_DIR);
  const backupPath = path.join(path.dirname(DATA_JSON), `site-content.backup-${ts()}.json`);
  const logPath = path.join(TXT_DIR, 'fix_thumbs_resumen.txt');

  if (!fs.existsSync(DATA_JSON)) {
    console.error('No existe data/site-content.json');
    process.exit(1);
  }

  const original = fs.readFileSync(DATA_JSON, 'utf8');
  let data;
  try { data = JSON.parse(original); } catch (e) {
    console.error('JSON inválido, abortando.');
    process.exit(1);
  }

  const changes = [];
  const beforeCount = (original.split('data:image/').length - 1);
  traverseAndReplace(data, (info) => changes.push(info));

  const afterStr = JSON.stringify(data, null, 2);
  const afterCount = (afterStr.split('data:image/').length - 1);

  // Backup y escritura segura
  fs.writeFileSync(backupPath, original, 'utf8');
  fs.writeFileSync(DATA_JSON, afterStr, 'utf8');

  const lines = [];
  lines.push('Fase 2: Saneamiento de JSON (thumbs/base64 → archivos)');
  lines.push(`Fecha: ${new Date().toISOString()}`);
  lines.push(`Backups: ${path.relative(ROOT, backupPath)}`);
  lines.push(`Reemplazos realizados: ${changes.length}`);
  lines.push(`Data URIs antes: ${beforeCount} | después: ${afterCount}`);
  if (changes.length) {
    lines.push('Detalle (primeros 50):');
    for (const c of changes.slice(0, 50)) {
      lines.push(`- key=${c.key} mime=${c.mime} bytes=${c.bytes} -> ${c.url}`);
    }
    if (changes.length > 50) lines.push(`... (+${changes.length - 50} más)`);
  }
  fs.writeFileSync(logPath, lines.join('\n'), 'utf8');

  console.log(lines.join('\n'));
}

main();
