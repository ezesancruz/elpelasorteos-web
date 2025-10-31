#!/usr/bin/env node
/**
 * Fase 5: Validación y posible rollback
 * - Verifica que data/site-content.json sea válido y no tenga data URIs.
 * - Recolecta todas las referencias a /uploads/* desde JSON/HTML/JS/CSS.
 * - Comprueba existencia física en server/public/uploads.
 * - Opcional (--restore-missing): intenta restaurar faltantes desde .quarantine.
 * - Genera resumen en txt/validacion_resumen.txt
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DATA_JSON = path.join(ROOT, 'data', 'site-content.json');
const UPLOADS_DIR = path.join(ROOT, 'server', 'public', 'uploads');
const QUAR_DIR = path.join(UPLOADS_DIR, '.quarantine');
const TXT_DIR = path.join(ROOT, 'txt');

const args = process.argv.slice(2);
const RESTORE = args.includes('--restore-missing');

function ensureDir(d){ if(!fs.existsSync(d)) fs.mkdirSync(d, {recursive:true}); }
function walk(dir, pred = () => true){
  const out = [];
  (function rec(base){
    if(!fs.existsSync(base)) return;
    const es = fs.readdirSync(base, {withFileTypes:true});
    for(const e of es){
      const p = path.join(base, e.name);
      if(e.isDirectory()) rec(p); else if(pred(p)) out.push(p);
    }
  })(dir);
  return out;
}

function collectRefs(){
  const refs = new Set();
  // JSON
  if(fs.existsSync(DATA_JSON)){
    const t = fs.readFileSync(DATA_JSON,'utf8');
    const m = t.match(/"(\/uploads\/[^"\n]+)"/g) || [];
    for(const s of m) refs.add(s.slice(1,-1));
  }
  // Text files
  const files = []
    .concat(walk(ROOT, p=>/index\.html$/.test(p)))
    .concat(walk(path.join(ROOT,'sorteo'), p=>/\.html$/.test(p)))
    .concat(walk(path.join(ROOT,'scripts'), p=>/\.js$/.test(p)))
    .concat(walk(path.join(ROOT,'styles'), p=>/\.css$/.test(p)));
  const re = /(\/uploads\/[A-Za-z0-9._\-]+\.(?:jpe?g|png|webp|gif|mp4|webm|mov|ogg|avif))/gi;
  for(const f of files){
    const txt = fs.readFileSync(f,'utf8');
    let m; while((m = re.exec(txt))!==null) refs.add(m[1]);
  }
  return Array.from(refs);
}

function findInQuarantine(basename){
  if(!fs.existsSync(QUAR_DIR)) return null;
  const entries = walk(QUAR_DIR, p=>true);
  for(const p of entries){ if(path.basename(p)===basename) return p; }
  return null;
}

function main(){
  ensureDir(TXT_DIR);
  const lines = [];
  lines.push('Fase 5: Validación y posible rollback');
  lines.push(`Fecha: ${new Date().toISOString()}`);

  // JSON válido y sin data URIs
  if(!fs.existsSync(DATA_JSON)){
    lines.push('ERROR: No existe data/site-content.json');
    fs.writeFileSync(path.join(TXT_DIR,'validacion_resumen.txt'), lines.join('\n'), 'utf8');
    console.log(lines.join('\n'));
    process.exit(1);
  }
  const raw = fs.readFileSync(DATA_JSON,'utf8');
  let data; let dataUriCount = (raw.split('data:image/').length - 1);
  try { data = JSON.parse(raw); } catch(e){
    lines.push('ERROR: JSON inválido');
    fs.writeFileSync(path.join(TXT_DIR,'validacion_resumen.txt'), lines.join('\n'), 'utf8');
    console.log(lines.join('\n'));
    process.exit(1);
  }
  lines.push(`JSON válido. Data URIs encontradas: ${dataUriCount}`);

  // Refs y existencia
  const refs = collectRefs();
  lines.push(`Referencias a /uploads/ encontradas: ${refs.length}`);
  let missing = [];
  for(const url of refs){
    const name = url.replace(/^\/uploads\//,'');
    const abs = path.join(UPLOADS_DIR, name);
    if(!fs.existsSync(abs)) missing.push({url, basename: path.basename(name)});
  }
  lines.push(`Archivos faltantes: ${missing.length}`);

  // Intento de restauración si se solicita
  let restored = [];
  if(RESTORE && missing.length){
    for(const m of missing){
      const src = findInQuarantine(m.basename);
      if(src){
        const dst = path.join(UPLOADS_DIR, m.basename);
        try { fs.renameSync(src, dst); restored.push({from: src, to: dst}); }
        catch(e){}
      }
    }
    // Recalcular faltantes
    const still = [];
    for(const m of missing){
      const dst = path.join(UPLOADS_DIR, m.basename);
      if(!fs.existsSync(dst)) still.push(m);
    }
    missing = still;
    lines.push(`Restaurados desde cuarentena: ${restored.length}`);
    lines.push(`Faltantes tras restaurar: ${missing.length}`);
  }

  if(missing.length){
    lines.push('Detalle faltantes (primeros 50):');
    for(const m of missing.slice(0,50)) lines.push(`- ${m.url}`);
  }

  const outPath = path.join(TXT_DIR,'validacion_resumen.txt');
  fs.writeFileSync(outPath, lines.join('\n'), 'utf8');
  console.log(lines.join('\n'));
}

main();
