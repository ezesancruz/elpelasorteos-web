#!/usr/bin/env node
/**
 * Fase 3: Deduplicación de medios y normalización de referencias
 * - Calcula hash de archivos en server/public/uploads y agrupa duplicados.
 * - Elige un canónico por grupo (prioriza el más referenciado; si empata, lexicográfico).
 * - Reescribe referencias a duplicados en:
 *   - data/site-content.json (traversal JSON)
 *   - index.html, sorteo/*.html, scripts/*.js, styles/*.css (reemplazo texto exacto)
 * - Crea backups antes de modificar.
 * - NO mueve ni borra archivos (eso va en Fase 4).
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const UPLOADS_DIR = path.join(ROOT, 'server', 'public', 'uploads');
const DATA_JSON = path.join(ROOT, 'data', 'site-content.json');
const TXT_DIR = path.join(ROOT, 'txt');

function ensureDir(dir) { if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true }); }
function ts() {
  const d = new Date(); const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function walk(dir, predicate = () => true) {
  const out = [];
  (function rec(base) {
    if (!fs.existsSync(base)) return;
    const es = fs.readdirSync(base, { withFileTypes: true });
    for (const e of es) {
      const p = path.join(base, e.name);
      if (e.isDirectory()) rec(p);
      else if (predicate(p)) out.push(p);
    }
  })(dir);
  return out;
}

function sha1(file) {
  const h = crypto.createHash('sha1');
  h.update(fs.readFileSync(file));
  return h.digest('hex');
}

function collectReferences() {
  const refs = new Map(); // '/uploads/foo' -> count
  function bump(r) { refs.set(r, (refs.get(r) || 0) + 1); }

  // JSON
  if (fs.existsSync(DATA_JSON)) {
    const txt = fs.readFileSync(DATA_JSON, 'utf8');
    const m = txt.match(/"(\/uploads\/[^"\n]+)"/g) || [];
    for (const s of m) bump(s.slice(1, -1));
  }
  // HTML/JS/CSS
  const files = []
    .concat(walk(ROOT, p => /index\.html$/.test(p)))
    .concat(walk(path.join(ROOT, 'sorteo'), p => /\.html$/.test(p)))
    .concat(walk(path.join(ROOT, 'scripts'), p => /\.js$/.test(p)))
    .concat(walk(path.join(ROOT, 'styles'), p => /\.css$/.test(p)));
  const re = /(\/uploads\/[^"'\)\s>]+)/g;
  for (const f of files) {
    const txt = fs.readFileSync(f, 'utf8');
    let m;
    while ((m = re.exec(txt)) !== null) bump(m[1]);
  }
  return refs; // Map</uploads/... , count>
}

function chooseCanonical(group, refCounts) {
  // group: array of absolute file paths under uploads
  // Prefer the one with higher ref count; tie-breaker: lexicographically smallest basename
  let best = null; let bestScore = -1; let bestBase = '';
  for (const abs of group) {
    const rel = '/uploads/' + path.basename(abs);
    const score = refCounts.get(rel) || 0;
    const base = path.basename(abs);
    if (score > bestScore || (score === bestScore && base < bestBase)) {
      best = abs; bestScore = score; bestBase = base;
    }
  }
  return best;
}

function replaceInTextFile(file, mapping, backupsDir) {
  const txt = fs.readFileSync(file, 'utf8');
  let out = txt; let changed = false;
  for (const [fromUrl, toUrl] of mapping) {
    if (fromUrl === toUrl) continue;
    const esc = fromUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(esc, 'g');
    if (re.test(out)) { out = out.replace(re, toUrl); changed = true; }
  }
  if (changed) {
    const rel = path.relative(ROOT, file).replace(/\\/g, '/');
    const bkp = path.join(backupsDir, rel.replace(/[\/]/g, '__'));
    ensureDir(path.dirname(bkp));
    fs.writeFileSync(bkp, txt, 'utf8');
    fs.writeFileSync(file, out, 'utf8');
    return true;
  }
  return false;
}

function replaceInJsonFile(file, mapping, backupsDir) {
  const raw = fs.readFileSync(file, 'utf8');
  let data; try { data = JSON.parse(raw); } catch { return { changed: false, count: 0 }; }
  let count = 0;
  function walk(node) {
    if (Array.isArray(node)) return node.map(walk);
    if (node && typeof node === 'object') {
      for (const k of Object.keys(node)) node[k] = walk(node[k]);
      return node;
    }
    if (typeof node === 'string' && node.startsWith('/uploads/')) {
      const to = mapping.get(node);
      if (to && to !== node) { count++; return to; }
    }
    return node;
  }
  const next = walk(data);
  if (count > 0) {
    const bkp = path.join(backupsDir, 'site-content.json.bak');
    fs.writeFileSync(bkp, raw, 'utf8');
    fs.writeFileSync(file, JSON.stringify(next, null, 2), 'utf8');
    return { changed: true, count };
  }
  return { changed: false, count: 0 };
}

function main() {
  ensureDir(TXT_DIR);
  const backupsDir = path.join(TXT_DIR, `backups_dedupe_${ts()}`);
  ensureDir(backupsDir);

  // Gather uploads and hashes
  const files = walk(UPLOADS_DIR, p => /\.(jpe?g|png|webp|gif|mp4|webm|mov|ogg|heic|avif)$/i.test(p));
  const infos = files.map(f => ({ abs: f, base: path.basename(f), hash: sha1(f), size: fs.statSync(f).size }));
  const byHash = new Map();
  for (const info of infos) {
    if (!byHash.has(info.hash)) byHash.set(info.hash, []);
    byHash.get(info.hash).push(info.abs);
  }
  const dupGroups = Array.from(byHash.entries()).filter(([_, arr]) => arr.length > 1);

  const refCounts = collectReferences();

  // Build mapping from each duplicate URL to canonical URL
  const mapping = new Map(); // '/uploads/from' -> '/uploads/to'
  const groupsSummary = [];
  for (const [hash, group] of dupGroups) {
    const canonicalAbs = chooseCanonical(group, refCounts);
    const canonicalUrl = '/uploads/' + path.basename(canonicalAbs);
    const members = group.map(abs => '/uploads/' + path.basename(abs));
    for (const url of members) mapping.set(url, canonicalUrl);
    groupsSummary.push({ hash, canonical: canonicalUrl, members });
  }

  // Apply mapping to JSON and text files
  const changedFiles = [];
  const jsonRes = replaceInJsonFile(DATA_JSON, mapping, backupsDir);
  if (jsonRes.changed) changedFiles.push({ file: 'data/site-content.json', count: jsonRes.count });

  const textTargets = []
    .concat(walk(ROOT, p => /index\.html$/.test(p)))
    .concat(walk(path.join(ROOT, 'sorteo'), p => /\.html$/.test(p)))
    .concat(walk(path.join(ROOT, 'scripts'), p => /\.js$/.test(p)))
    .concat(walk(path.join(ROOT, 'styles'), p => /\.css$/.test(p)));
  for (const f of textTargets) {
    if (replaceInTextFile(f, mapping, backupsDir)) {
      changedFiles.push({ file: path.relative(ROOT, f).replace(/\\/g, '/'), count: NaN });
    }
  }

  // Report
  const out = [];
  out.push('Fase 3: Deduplicación de medios y normalización de referencias');
  out.push(`Fecha: ${new Date().toISOString()}`);
  out.push(`Grupos de duplicados detectados: ${dupGroups.length}`);
  if (dupGroups.length) {
    out.push('Detalle de grupos (primeros 20):');
    for (const g of groupsSummary.slice(0, 20)) {
      out.push(`- HASH ${g.hash} canonical=${g.canonical}`);
      for (const m of g.members) out.push(`  * ${m}`);
    }
    if (groupsSummary.length > 20) out.push(`... (+${groupsSummary.length - 20} más)`);
  }
  out.push(`Archivos modificados: ${changedFiles.length}`);
  for (const c of changedFiles) out.push(`- ${c.file}${isNaN(c.count) ? '' : ` (${c.count} reemplazos)`}`);
  const logPath = path.join(TXT_DIR, 'dedupe_resumen.txt');
  fs.writeFileSync(logPath, out.join('\n'), 'utf8');
  console.log(out.join('\n'));
}

main();

