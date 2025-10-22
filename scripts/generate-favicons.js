const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'favicon.png');

async function ensurePng(srcPath) {
  const meta = await sharp(srcPath).metadata();
  if (meta.format !== 'png') {
    // Convert any input to PNG (keeps alpha if present)
    const tmp = srcPath + '.png';
    await sharp(srcPath).png().toFile(tmp);
    return tmp;
  }
  return srcPath;
}

async function main() {
  if (!fs.existsSync(SRC)) {
    console.error('No se encontró favicon.png en la raíz. Sube el archivo y reintenta.');
    process.exit(1);
  }

  const srcPng = await ensurePng(SRC);

  const targets = [
    { file: 'favicon-16x16.png', size: 16 },
    { file: 'favicon-32x32.png', size: 32 },
    { file: 'apple-touch-icon.png', size: 180 },
  ];

  for (const t of targets) {
    const outPath = path.join(ROOT, t.file);
    await sharp(srcPng)
      .resize(t.size, t.size, { fit: 'cover', withoutEnlargement: false })
      .png({ quality: 100 })
      .toFile(outPath);
    console.log('Generado:', t.file);
  }

  if (srcPng !== SRC) {
    try { fs.unlinkSync(srcPng); } catch {}
  }
}

main().catch(err => { console.error(err); process.exit(1); });

