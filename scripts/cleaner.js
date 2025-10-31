#!/usr/bin/env node
/**
 * Limpiador de residuos (no destructivo por defecto)
 *
 * Capacidades:
 * - Escanea referencias a uploads en: data/site-content.json, *.html, scripts/*.js, styles/*.css
 * - Lista archivos en server/public/uploads y detecta:
 *   - No referenciados (candidatos a limpieza)
 *   - Duplicados por hash (agrupados)
 *   - Los más pesados (top N)
 * - Cuenta data URIs (base64) en el JSON
 * - Busca console.log/debug/warn en scripts/*.js
 * - Opcional: mueve no referenciados a cuarentena (sin borrar) con --quarantine
 *
 * Uso:
 *   node scripts/cleaner.js              # solo reporte
 *   node scripts/cleaner.js --quarantine # mueve no referenciados a server/public/uploads/.quarantine
 *   node scripts/cleaner.js --limit 20   # top 20 pesados en el informe
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const UPLOADS_DIR = path.join(ROOT, 'server', 'public', 'uploads');
const DATA_JSON = path.join(ROOT, 'data', 'site-content.json');
const TXT_DIR = path.join(ROOT, 'txt');

const args = process.argv.slice(2);
const SHOULD_QUARANTINE = args.includes('--quarantine');
const LIMIT_IDX = Math.max(args.indexOf('--limit'), args.indexOf('-n'));
const TOP_LIMIT = (LIMIT_IDX >= 0 && Number(args[LIMIT_IDX + 1])) || 30;

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function walk(dir, predicate = () => true) {
  const results = [];
  (function rec(base) {
    const entries = fs.existsSync(base) ? fs.readdirSync(base, { withFileTypes: true }) : [];
    for (const ent of entries) {
      const p = path.join(base, ent.name);
      if (ent.isDirectory()) rec(p);
      else if (predicate(p)) results.push(p);
    }
  })(dir);
  return results;
}

function sha1OfFile(file) {
  const h = crypto.createHash('sha1');
  const buf = fs.readFileSync(file);
  h.update(buf);
  return h.digest('hex');
}

function collectReferences() {
  const refs = new Set();
  const dataRefs = { uploads: new Set(), dataUris: 0 };
  // JSON
  if (fs.existsSync(DATA_JSON)) {
    const txt = fs.readFileSync(DATA_JSON, 'utf8');
    const uploadMatches = txt.match(/"(\/uploads\/[^"\n]+)"/g) || [];
    for (const m of uploadMatches) {
      const url = m.slice(1, -1); // strip quotes
      refs.add(url);
      dataRefs.uploads.add(url);
    }
    const dataUriMatches = txt.match(/data:(image|video)\//g) || [];
    dataRefs.dataUris = dataUriMatches.length;
  }
  // HTML/JS/CSS
  const files = []
    .concat(walk(ROOT, p => /index\.html$/.test(p)))
    .concat(walk(path.join(ROOT, 'sorteo'), p => /\.html$/.test(p)))
    .concat(walk(path.join(ROOT, 'scripts'), p => /\.js$/.test(p)))
    .concat(walk(path.join(ROOT, 'styles'), p => /\.css$/.test(p)));
  const uploadRegex = /(\/uploads\/[^"'\)\s>]+)/g;
  for (const f of files) {
    try {
      const txt = fs.readFileSync(f, 'utf8');
      let m;
      while ((m = uploadRegex.exec(txt)) !== null) {
        refs.add(m[1]);
      }
    } catch {}
  }
  return { refs, dataRefs };
}

function main() {
  ensureDir(TXT_DIR);
  const reportPath = path.join(TXT_DIR, 'limpieza_resumen.txt');
  const quarantineDir = path.join(UPLOADS_DIR, '.quarantine');
  if (SHOULD_QUARANTINE) ensureDir(quarantineDir);

  // Listar uploads
  const uploadFiles = walk(UPLOADS_DIR, p => /\.(jpe?g|png|webp|gif|mp4|webm|mov|ogg|heic|avif)$/i.test(p));
  const relFs = f => f.replace(ROOT, '').replace(/\\/g, '/');
  const toWebUrl = f => '/uploads/' + path.relative(UPLOADS_DIR, f).replace(/\\/g, '/');

  // Referencias
  const { refs, dataRefs } = collectReferences();

  // Mapa info de archivos
  const infos = uploadFiles.map(f => {
    const stat = fs.statSync(f);
    let hash = '';
    try { hash = sha1OfFile(f); } catch {}
    return { path: f, relFs: relFs(f), webUrl: toWebUrl(f), size: stat.size, hash };
  });

  // No referenciados
  const unreferenced = infos.filter(i => !refs.has(i.webUrl));

  // Duplicados por hash
  const byHash = new Map();
  for (const info of infos) {
    if (!info.hash) continue;
    if (!byHash.has(info.hash)) byHash.set(info.hash, []);
    byHash.get(info.hash).push(info);
  }
  const duplicates = Array.from(byHash.values()).filter(group => group.length > 1);

  // Top pesados
  const heaviest = [...infos].sort((a, b) => b.size - a.size).slice(0, TOP_LIMIT);

  // Logs de consola
  const scriptFiles = walk(path.join(ROOT, 'scripts'), p => /\.js$/.test(p));
  const consoleHits = [];
  const consoleRegex = /console\.(log|debug|warn|error)\s*\(/g;
  for (const f of scriptFiles) {
    try {
      const txt = fs.readFileSync(f, 'utf8');
      let m, count = 0;
      while ((m = consoleRegex.exec(txt)) !== null) count++;
      if (count) consoleHits.push({ rel: rel(f), count });
    } catch {}
  }

  // Quarantine (opcional, no destructivo)
  let moved = [];
  if (SHOULD_QUARANTINE && unreferenced.length) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const target = path.join(quarantineDir, stamp);
    ensureDir(target);
    for (const u of unreferenced) {
      const dest = path.join(target, path.basename(u.path));
      try {
        fs.renameSync(u.path, dest);
        moved.push({ from: relFs(u.path), to: relFs(dest) });
      } catch (e) {}
    }
  }

  // Reporte
  const lines = [];
  lines.push('RESUMEN LIMPIEZA (no destructivo)');
  lines.push(`Fecha: ${new Date().toISOString()}`);
  lines.push('');
  lines.push('Totales:');
  lines.push(`- uploads totales: ${infos.length}`);
  lines.push(`- referenciados: ${infos.length - unreferenced.length}`);
  lines.push(`- NO referenciados: ${unreferenced.length}`);
  lines.push(`- grupos de duplicados por hash: ${duplicates.length}`);
  lines.push(`- data URIs en JSON: ${dataRefs.dataUris}`);
  lines.push('');
  lines.push('Top archivos pesados:');
  for (const h of heaviest) {
    lines.push(`- ${h.webUrl}  ${h.size} bytes`);
  }
  lines.push('');
  if (unreferenced.length) {
    lines.push('No referenciados:');
    for (const u of unreferenced.slice(0, 200)) {
      lines.push(`- ${u.webUrl}  ${u.size} bytes`);
    }
    if (unreferenced.length > 200) {
      lines.push(`- ... (${unreferenced.length - 200} más)`);
    }
    lines.push('');
  }
  if (duplicates.length) {
    lines.push('Duplicados por hash:');
    for (const group of duplicates.slice(0, 50)) {
      lines.push(`- HASH ${group[0].hash} (${group.length} archivos)`);
      for (const item of group) lines.push(`  * ${item.rel}  ${item.size} bytes`);
    }
    if (duplicates.length > 50) lines.push(`- ... (${duplicates.length - 50} grupos más)`);
    lines.push('');
  }
  if (consoleHits.length) {
    lines.push('Logs de consola detectados:');
    for (const hit of consoleHits) lines.push(`- ${hit.rel}: ${hit.count}`);
    lines.push('');
  }
  if (moved.length) {
    lines.push('Movidos a cuarentena:');
    for (const mv of moved) lines.push(`- ${mv.from} -> ${mv.to}`);
    lines.push('');
  }
  fs.writeFileSync(reportPath, lines.join('\n'), 'utf8');
  console.log(`Reporte escrito en ${path.relative(ROOT, reportPath)}`);
  if (SHOULD_QUARANTINE) console.log('Cuarentena aplicada (sin borrar).');
}

main();
