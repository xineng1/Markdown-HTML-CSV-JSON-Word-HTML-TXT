// 把 src/ 下的资源内联打包为单个 index.html
const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'src');
const OUT = path.join(ROOT, 'index.html');

const read = (p) => fs.readFileSync(p, 'utf8');
const safe = (s) => String(s).replace(/<\/script/gi, '<\\/script');

function build() {
  const css = read(path.join(SRC, 'style.css'));
  const tpl = read(path.join(SRC, 'template.html'));
  const marked = read(path.join(SRC, 'vendor', 'marked.min.js'));
  const purify = read(path.join(SRC, 'vendor', 'purify.min.js'));
  const hljs = read(path.join(SRC, 'vendor', 'hljs.bundle.js'));
  const docx = read(path.join(SRC, 'export-docx.js'));
  const app = read(path.join(SRC, 'app.js'));

  const missing = [];
  [['marked.min.js', marked], ['purify.min.js', purify], ['hljs.bundle.js', hljs]].forEach(([n, c]) => {
    if (!c || c.length < 1024) missing.push(n);
  });
  if (missing.length) {
    console.error('[build] 缺少或未生成的依赖：' + missing.join(', '));
    console.error('[build] 请先运行：node scripts/build-hljs.js');
    process.exit(1);
  }

  const html = tpl
    .replace('/*__CSS__*/', () => safe(css))
    .replace('/*__VENDOR_MARKED__*/', () => safe(marked))
    .replace('/*__VENDOR_PURIFY__*/', () => safe(purify))
    .replace('/*__VENDOR_HLJS__*/', () => safe(hljs))
    .replace('/*__DOCX__*/', () => safe(docx))
    .replace('/*__INLINE_CSS__*/', () => 'window.__MD_CSS__ = ' + JSON.stringify(css) + ';')
    .replace('/*__APP__*/', () => "var INLINE_CSS = (window.__MD_CSS__ || '');\n" + safe(app));

  fs.writeFileSync(OUT, html, 'utf8');
  const kb = (fs.statSync(OUT).size / 1024).toFixed(1);
  console.log(`[build] index.html -> ${kb} KB`);
  return OUT;
}

build();

if (process.argv.includes('--watch')) {
  console.log('[watch] 监听 src/ 变化…');
  let timer = null;
  const watchDir = (d) => {
    fs.watch(d, { recursive: false }, (evt, file) => {
      if (!file) return;
      clearTimeout(timer);
      timer = setTimeout(() => {
        try { build(); } catch (e) { console.error('[watch] build error:', e.message); }
      }, 120);
    });
  };
  watchDir(SRC);
  watchDir(path.join(SRC, 'vendor'));
}
