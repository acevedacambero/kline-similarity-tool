const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const root = path.resolve(__dirname, '..');
const htmlFiles = fs.readdirSync(root).filter(name => name.toLowerCase().endsWith('.html'));
if (htmlFiles.length !== 1) throw new Error(`Expected one root HTML file, found ${htmlFiles.length}`);
const rootPath = path.join(root, htmlFiles[0]);
const publicPath = path.join(root, 'public', 'index.html');
if (!fs.existsSync(publicPath)) throw new Error('Missing public/index.html');
const html = fs.readFileSync(rootPath, 'utf8');
const publicHtml = fs.readFileSync(publicPath, 'utf8');
const sha = text => crypto.createHash('sha256').update(text).digest('hex');
if (sha(html) !== sha(publicHtml)) throw new Error('public/index.html is not synchronized with the root HTML');

const scripts = [...html.matchAll(/<script(?:[^>]*)>([\s\S]*?)<\/script>/g)];
if (scripts.length !== 3) throw new Error(`Expected 3 script blocks, found ${scripts.length}`);
for (const index of [1, 2]) new Function(scripts[index][1]);
for (const id of ['dir', 'btnA', 'btnM', 'matchTable', 'workerSrc']) {
  if (!html.includes(`id="${id}"`)) throw new Error(`Missing HTML element: ${id}`);
}

const wrangler = JSON.parse(fs.readFileSync(path.join(root, 'wrangler.jsonc'), 'utf8'));
if (wrangler.name !== 'kline-similarity-tool' || wrangler.assets?.directory !== './public' ||
    wrangler.assets?.not_found_handling !== 'single-page-application') {
  throw new Error('Invalid Cloudflare Static Assets configuration');
}

// Word boundaries deliberately exclude internal helpers such as primeFileLoads/prefetch.
if (/\bfetch\s*\(|\bXMLHttpRequest\b|\bWebSocket\s*\(|\bsendBeacon\s*\(/.test(html)) {
  throw new Error('Unexpected network API found');
}
if (/<(?:script|img|link)\b[^>]*(?:src|href)\s*=\s*["']https?:\/\//.test(html) ||
    /<form\b[^>]*action\s*=\s*["']https?:\/\//.test(html) ||
    /createElement\s*\(\s*["']script["']\s*\)/.test(html)) {
  throw new Error('Unexpected external resource or dynamic script loading found');
}

if (process.argv.includes('--require-stamp')) {
  const meta = html.match(/<span id="buildInfo"[^>]*>([^<]*)<\/span>/)?.[1] || '';
  if (!/^build [0-9a-f]{7} · \d{4}-\d{2}-\d{2}$/.test(meta)) throw new Error(`Missing stamped build metadata: ${meta}`);
}
console.log('POLICY_OK: syntax, controls, static deployment, local-only policy, and build metadata passed.');
