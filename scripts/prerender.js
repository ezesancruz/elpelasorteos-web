const path = require('path');
const fs = require('fs');
const http = require('http');
const { exec } = require('child_process');
const puppeteer = require('puppeteer');

const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const PORT = process.env.PRERENDER_PORT || process.env.PORT || 5173;
const ROUTES = ['/', '/ganadoresanteriores/'];

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function waitForServer(url, timeoutMs = 10000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      await new Promise((resolve, reject) => {
        const req = http.get(url, res => { res.resume(); resolve(); });
        req.on('error', reject);
      });
      return true;
    } catch (_) {
      await sleep(300);
    }
  }
  throw new Error('Servidor no respondió a tiempo');
}

async function run() {
  if (!fs.existsSync(DIST)) fs.mkdirSync(DIST, { recursive: true });

  const server = exec('node server/editor-server.js', {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT) },
  });

  const baseUrl = `http://localhost:${PORT}`;
  await waitForServer(baseUrl);

  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();

  for (const route of ROUTES) {
    const url = `${baseUrl}${route}`;
    await page.goto(url, { waitUntil: 'networkidle0' });
    try { await page.waitForSelector('#app', { timeout: 2000 }); } catch {}

    let html = await page.content();

    // Quitar scripts de app para snapshot estático
    html = html
      .replace(/<script[^>]*src=["']scripts\/(app|editor)\.js["'][^>]*><\/script>/g, '')
      .replace(/<script type=["']module["'][^>]*src=["']scripts\/(app|editor)\.js["'][^>]*><\/script>/g, '');

    const outPath = route === '/'
      ? path.join(DIST, 'index.html')
      : path.join(DIST, route, 'index.html');
    const outDir = path.dirname(outPath);
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(outPath, html, 'utf8');
    console.log('Snapshot:', route, '->', outPath);
  }

  await browser.close();
  server.kill();
}

run().catch(err => { console.error(err); process.exit(1); });

