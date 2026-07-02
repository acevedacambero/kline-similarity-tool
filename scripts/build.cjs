const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const rootHtml = path.join(root, 'K线结构相似度分析工具.html');
const publicHtml = path.join(root, 'public', 'index.html');
const srcDir = path.join(root, 'src');
const templatePath = path.join(srcDir, 'page.template.html');
const algorithmPath = path.join(srcDir, 'algorithm.js');
const placeholder = '/*__KLINE_WORKER_SOURCE__*/';

function lf(text) { return text.replace(/\r\n/g, '\n'); }

function bootstrap() {
  const html = lf(fs.readFileSync(rootHtml, 'utf8'));
  const pattern = /(<script id="workerSrc" type="text\/plain">\n)([\s\S]*?)(\n<\/script>)/;
  const match = html.match(pattern);
  if (!match) throw new Error('workerSrc block not found');
  fs.mkdirSync(srcDir, { recursive: true });
  fs.writeFileSync(algorithmPath, lf(match[2]).replace(/\n*$/, '') + '\n');
  fs.writeFileSync(templatePath, html.replace(pattern, `$1${placeholder}$3`));
}

if (!fs.existsSync(templatePath) || !fs.existsSync(algorithmPath)) bootstrap();
const template = lf(fs.readFileSync(templatePath, 'utf8'));
const algorithm = lf(fs.readFileSync(algorithmPath, 'utf8')).replace(/\n*$/, '');
if (!template.includes(placeholder)) throw new Error('worker source placeholder not found');
const output = template.replace(placeholder, algorithm);

if (process.argv.includes('--check')) {
  for (const file of [rootHtml, publicHtml]) {
    if (!fs.existsSync(file) || lf(fs.readFileSync(file, 'utf8')) !== output) {
      console.error(`Generated artifact is stale: ${path.relative(root, file)}`);
      process.exitCode = 1;
    }
  }
} else {
  fs.mkdirSync(path.dirname(publicHtml), { recursive: true });
  fs.writeFileSync(rootHtml, output);
  fs.writeFileSync(publicHtml, output);
  for (let i = 0; i < process.argv.length; i++) {
    if (process.argv[i] === '--copy-to' && process.argv[i + 1]) {
      const target = path.resolve(process.argv[++i]);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, output);
    }
  }
  console.log('Generated root and Cloudflare single-file artifacts.');
}
