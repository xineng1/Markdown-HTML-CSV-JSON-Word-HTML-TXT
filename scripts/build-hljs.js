// 用 esbuild 把 highlight.js(core + 常用语言) 打成 IIFE，供单文件 HTML 内联
const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..');
const NM = 'C:/Users/wweiv/.workbuddy/binaries/node/workspace/node_modules';
const esbuild = require(path.join(NM, 'esbuild'));

const entry = path.join(ROOT, 'src', 'vendor', 'hljs-entry.js');
const out = path.join(ROOT, 'src', 'vendor', 'hljs.bundle.js');

esbuild
  .build({
    entryPoints: [entry],
    bundle: true,
    minify: true,
    format: 'iife',
    target: ['es2019'],
    nodePaths: [NM],
    outfile: out,
    legalComments: 'none',
    logLevel: 'info',
  })
  .then(() => {
    const kb = (fs.statSync(out).size / 1024).toFixed(1);
    console.log(`[hljs] built -> ${out} (${kb} KB)`);
  })
  .catch((e) => {
    console.error('[hljs] build failed:', e.message);
    process.exit(1);
  });
