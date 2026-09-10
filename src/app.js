/* =========================================================
 * MD Reader · 单文件 Markdown 阅读器
 * 依赖（已内联）：marked / DOMPurify / highlight.js
 * ========================================================= */
(function () {
  'use strict';

  var MD_EXT = /\.(md|markdown|mdown|mkd|mdtxt|mdx)$/i;
  var IMG_EXT = /\.(png|jpe?g|gif|bmp|webp|svg|ico|avif|tiff?)$/i;
  // 明确按二进制处理、不收进阅读列表的扩展名
  var BIN_EXT = /\.(pdf|doc|docx|xls|xlsx|ppt|pptx|zip|rar|7z|tar|gz|bz2|xz|exe|dll|msi|so|dylib|bin|iso|mp3|wav|flac|aac|ogg|m4a|mp4|mkv|avi|mov|wmv|flv|webm|ttf|otf|woff2?|eot|psd|ai|sketch|db|sqlite|dat|class|jar|pyc|o|a|lib|obj|apk|ipa|crx|dmg|pkg|deb|rpm)$/i;

  // 代码/文本扩展名 -> highlight.js 语言名
  var LANG_MAP = {
    js: 'javascript', mjs: 'javascript', cjs: 'javascript', jsx: 'javascript',
    ts: 'typescript', tsx: 'typescript', mts: 'typescript', cts: 'typescript',
    py: 'python', pyw: 'python', rb: 'ruby', php: 'php', java: 'java',
    kt: 'kotlin', kts: 'kotlin', c: 'c', h: 'c', cpp: 'cpp', cc: 'cpp', cxx: 'cpp',
    hpp: 'cpp', hh: 'cpp', cs: 'csharp', go: 'go', rs: 'rust', swift: 'swift',
    m: 'objectivec', mm: 'objectivec', sh: 'bash', bash: 'bash', zsh: 'bash',
    ksh: 'bash', ps1: 'powershell', psm1: 'powershell', bat: 'dos', cmd: 'dos',
    sql: 'sql', r: 'r', jl: 'julia', lua: 'lua', pl: 'perl', pm: 'perl',
    dart: 'dart', scala: 'scala', groovy: 'groovy', gradle: 'groovy',
    css: 'css', scss: 'scss', sass: 'scss', less: 'less', styl: 'stylus',
    vue: 'xml', svelte: 'xml', htm: 'xml', html: 'xml', xml: 'xml',
    xsl: 'xml', xslt: 'xml', svg: 'xml', plist: 'xml', csproj: 'xml', props: 'xml',
    yml: 'yaml', yaml: 'yaml', toml: 'ini', ini: 'ini', cfg: 'ini',
    conf: 'ini', properties: 'properties', env: 'properties',
    dockerfile: 'dockerfile', cmake: 'cmake', makefile: 'makefile', mk: 'makefile',
    graphql: 'graphql', gql: 'graphql', proto: 'protobuf', tex: 'latex', cls: 'latex',
    diff: 'diff', patch: 'diff', json: 'json', jsonc: 'json', json5: 'json',
    log: 'plaintext', txt: 'plaintext', text: 'plaintext', csv: 'plaintext',
    tsv: 'plaintext', md: 'markdown', markdown: 'markdown', srt: 'plaintext',
    vtt: 'plaintext', asm: 'x86asm', v: 'verilog', sv: 'verilog', vhd: 'vhdl'
  };

  var MAX_FILE_SIZE = 16 * 1024 * 1024; // 16MB，超过则跳过

  // 判断文件该怎么读：markdown | html | csv | json | code | text | image | binary
  function detectKind(name) {
    var m = String(name).toLowerCase().match(/\.([a-z0-9]+)$/);
    var ext = m ? m[1] : '';
    if (/^(md|markdown|mdown|mkd|mdtxt|mdx)$/.test(ext)) return { kind: 'markdown' };
    if (/^(html|htm|xhtml)$/.test(ext)) return { kind: 'html' };
    if (/^(csv|tsv)$/.test(ext)) return { kind: 'csv', sep: ext === 'tsv' ? '\t' : ',' };
    if (/^(json|jsonc|json5)$/.test(ext)) return { kind: 'json' };
    if (LANG_MAP[ext] && LANG_MAP[ext] !== 'plaintext' && LANG_MAP[ext] !== 'markdown') {
      return { kind: 'code', lang: LANG_MAP[ext] };
    }
    return { kind: 'text' };
  }

  function isImageName(name) { return IMG_EXT.test(name); }
  function isBinaryName(name) { return BIN_EXT.test(name); }

  // 内容嗅探：含 NUL 字节基本可判定为二进制
  function looksBinary(buf) {
    var b = new Uint8Array(buf);
    var n = Math.min(b.length, 8192);
    for (var i = 0; i < n; i++) if (b[i] === 0) return true;
    return false;
  }

  var state = {
    files: [],        // {id, name, path, dir, size, text, handle|file, scrollTop}
    images: new Map(),// 相对路径(小写) -> blobURL
    currentId: null,
    dirHandle: null,   // File System Access API 目录句柄（用于重新扫描）
    headings: [],
    search: { hits: [], idx: -1, raw: '' },
    prefs: null,
    editing: false,
    dirHandle: null,
  };

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  /* ---------------- 偏好持久化 ---------------- */
  var PREFS_KEY = 'mdreader.prefs.v1';
  var defaultPrefs = {
    theme: 'light',   // light | dark
    fontSize: 16,
    width: 860,
    sidebar: true,
    outline: true,
    showAllFiles: false,
  };

  function loadPrefs() {
    var p = {};
    for (var k in defaultPrefs) p[k] = defaultPrefs[k];
    try {
      var raw = localStorage.getItem(PREFS_KEY);
      if (raw) {
        var o = JSON.parse(raw);
        for (var k2 in defaultPrefs) if (o[k2] !== undefined) p[k2] = o[k2];
      }
    } catch (e) { /* file:// 下可能不可用，忽略 */ }
    if (p.theme === 'auto') p.theme = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    return p;
  }

  function savePrefs() {
    try { localStorage.setItem(PREFS_KEY, JSON.stringify(state.prefs)); } catch (e) { /* ignore */ }
  }

  /* ---------------- 小工具 ---------------- */
  var toastTimer = null;
  function toast(msg) {
    var el = $('#toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove('show'); }, 2000);
  }

  function fmtSize(n) {
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
    return (n / 1024 / 1024).toFixed(2) + ' MB';
  }

  function baseName(p) {
    p = String(p || '').replace(/\\/g, '/');
    return p.split('/').pop() || p;
  }

  function dirName(p) {
    p = String(p || '').replace(/\\/g, '/');
    var i = p.lastIndexOf('/');
    return i < 0 ? '' : p.slice(0, i);
  }

  // 规范化路径：去 ./ 、解析 ../
  function normPath(p) {
    p = String(p || '').replace(/\\/g, '/').trim();
    var out = [];
    p.split('/').forEach(function (seg) {
      if (!seg || seg === '.') return;
      if (seg === '..') out.pop(); else out.push(seg);
    });
    return out.join('/');
  }

  function joinPath(a, b) {
    a = String(a || ''); b = String(b || '').replace(/\\/g, '/');
    if (!a) return normPath(b);
    return normPath(a.replace(/\\/g, '/') + '/' + b);
  }

  async function decodeBuffer(buf) {
    var bytes = new Uint8Array(buf);
    if (bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) {
      return new TextDecoder('utf-8').decode(bytes.subarray(3));
    }
    try {
      return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch (e) {
      try { return new TextDecoder('gbk').decode(bytes); } catch (e2) {
        return new TextDecoder('utf-8').decode(bytes);
      }
    }
  }

  /* ---------------- 渲染管线 ---------------- */
  marked.setOptions({ gfm: true, breaks: false, pedantic: false });

  var PURIFY_CFG = {
    ADD_TAGS: ['input', 'details', 'summary'],
    ADD_ATTR: ['checked', 'disabled', 'type', 'target', 'rel', 'id', 'align', 'colspan', 'rowspan', 'start'],
    ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel|ftp|file|data|blob):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
  };

  var usedIds = {};
  function slug(text, seq) {
    var s = String(text).trim().toLowerCase()
      .replace(/[`*_~\[\]()#!]/g, '')
      .replace(/[\s　]+/g, '-')
      .replace(/[^\w\u4e00-\u9fa5-]/g, '')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
    if (!s) s = 'section';
    var id = seq ? s + '-' + seq : s;
    if (usedIds[id]) {
      var i = 2;
      while (usedIds[id + '-' + i]) i++;
      id = id + '-' + i;
    }
    usedIds[id] = 1;
    return id;
  }

  function renderMarkdown(text, ctxPath) {
    usedIds = {};
    var raw = marked.parse(text);
    var clean = DOMPurify.sanitize(raw, PURIFY_CFG);

    var holder = document.createElement('div');
    holder.innerHTML = clean;
    holder.className = 'md';

    // 标题：生成 id + 锚点
    $$('h1,h2,h3,h4,h5,h6', holder).forEach(function (h) {
      if (!h.id) h.id = slug(h.textContent);
      var a = document.createElement('a');
      a.className = 'anchor';
      a.href = '#' + h.id;
      a.textContent = '#';
      a.setAttribute('aria-hidden', 'true');
      h.insertBefore(a, h.firstChild);
    });

    // 代码块：高亮 + 语言标签 + 复制按钮
    $$('pre', holder).forEach(function (pre) {
      var code = pre.querySelector('code');
      if (!code) return;
      var lang = '';
      var m = (code.className || '').match(/language-([\w+#-]+)/);
      if (m) lang = m[1];
      if (lang && window.hljs) {
        try {
          var res = window.hljs.highlight(code.textContent, { language: lang, ignoreIllegals: true });
          code.innerHTML = res.value;
          code.classList.add('hljs');
        } catch (e) { /* 未知语言，跳过 */ }
      }
      var tag = document.createElement('span');
      tag.className = 'lang-tag';
      tag.textContent = lang || 'text';
      pre.appendChild(tag);

      // 注意：不在此处绑定事件。正文会被 innerHTML 重建（搜索/切换文档），
      // 元素级监听器会丢失，统一改用 #content 上的事件委托。
      var btn = document.createElement('button');
      btn.className = 'copy-btn';
      btn.type = 'button';
      btn.textContent = '复制';
      pre.appendChild(btn);
    });

    // 表格：包一层以支持横向滚动
    $$('table', holder).forEach(function (t) {
      var w = document.createElement('div');
      w.className = 'table-wrap';
      t.parentNode.insertBefore(w, t);
      w.appendChild(t);
    });

    // 任务列表
    $$('li', holder).forEach(function (li) {
      if (li.querySelector(':scope > input[type="checkbox"]')) li.classList.add('task');
    });

    resolveImages(holder, ctxPath);
    resolveLinks(holder, ctxPath);
    return holder;
  }

  // 本地相对路径图片 -> blob URL
  function resolveImages(root, ctxPath) {
    $$('img', root).forEach(function (img) {
      var src = img.getAttribute('src') || img.getAttribute('data-src') || '';
      if (!src) return;
      if (/^(https?:|data:|blob:|file:)/i.test(src)) {
        if (/^https?:/i.test(src)) { img.loading = 'lazy'; img.referrerPolicy = 'no-referrer'; }
        return;
      }
      var resolved = resolveLocalAsset(src, ctxPath);
      if (resolved) {
        img.src = resolved;
      } else {
        img.classList.add('broken');
        img.title = '未找到图片：' + src + '\n（请连同图片所在的整个文件夹一起拖入）';
        if (!img.alt) img.alt = '[图片缺失] ' + src;
      }
      img.loading = 'lazy';
    });
  }

  // 外链新窗口；指向本地其它文档的链接 -> 库内跳转
  function resolveLinks(root, ctxPath) {
    $$('a', root).forEach(function (a) {
      var href = a.getAttribute('href') || '';
      if (/^(https?:|mailto:|tel:)/i.test(href)) {
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        return;
      }
      if (/^#/.test(href)) return;
      var target = null;
      try { target = findLinkedFile(decodeURIComponent(href.split('#')[0]), ctxPath); } catch (e) { }
      if (target) {
        a.classList.add('internal');
        a.title = '跳转到：' + target.name;
        a.dataset.fileId = target.id;
        try { a.dataset.anchor = decodeURIComponent(href.split('#')[1] || ''); } catch (err) { a.dataset.anchor = ''; }
      }
    });
  }

  /* ---------------- 多格式渲染分派 ---------------- */
  function renderContent(f) {
    var kind = f.kind || 'markdown';
    try {
      if (kind === 'markdown') return renderMarkdown(f.text, f.path);
      if (kind === 'html') return renderHtml(f.text, f.path);
      if (kind === 'csv') return renderCsv(f.text, f.sep || ',');
      if (kind === 'json') return renderJson(f.text);
      if (kind === 'code') return renderCodeText(f.text, f.lang || '', f.name);
      return renderPlainText(f.text, f.name);
    } catch (e) {
      return renderPlainText('⚠ 渲染出错：' + (e && e.message ? e.message : e) +
        '\n\n--- 原始内容 ---\n\n' + f.text, f.name);
    }
  }

  function shell() {
    var d = document.createElement('div');
    d.className = 'md';
    return d;
  }

  function renderPlainText(text, name) {
    var d = shell();
    var pre = document.createElement('pre');
    pre.className = 'plain';
    pre.textContent = text == null ? '' : text;
    d.appendChild(pre);
    return d;
  }

  function renderCodeText(text, lang, name) {
    var d = shell();
    var pre = document.createElement('pre');
    var code = document.createElement('code');
    if (lang && window.hljs) {
      try {
        code.innerHTML = window.hljs.highlight(text == null ? '' : text, { language: lang, ignoreIllegals: true }).value;
        code.classList.add('hljs');
      } catch (e) { code.textContent = text; }
    } else {
      code.textContent = text == null ? '' : text;
    }
    pre.appendChild(code);
    var tag = document.createElement('span');
    tag.className = 'lang-tag';
    tag.textContent = lang || (name && name.split('.').pop()) || 'text';
    pre.appendChild(tag);
    var btn = document.createElement('button');
    btn.className = 'copy-btn';
    btn.type = 'button';
    btn.textContent = '复制';
    pre.appendChild(btn);
    d.appendChild(pre);
    return d;
  }

  function renderJson(text) {
    var pretty = null;
    try { pretty = JSON.stringify(JSON.parse(text), null, 2); } catch (e) { pretty = null; }
    if (pretty === null) return renderCodeText(text, 'json');
    var d = renderCodeText(pretty, 'json');
    var tip = document.createElement('p');
    tip.className = 'file-tip';
    tip.textContent = '已格式化为 2 空格缩进的 JSON';
    d.insertBefore(tip, d.firstChild);
    return d;
  }

  function parseDelimited(text, sep) {
    var rows = [], row = [], cell = '', q = false;
    for (var i = 0; i < text.length; i++) {
      var ch = text.charAt(i);
      if (q) {
        if (ch === '"') {
          if (text.charAt(i + 1) === '"') { cell += '"'; i++; } else q = false;
        } else cell += ch;
      } else if (ch === '"') {
        q = true;
      } else if (ch === sep) {
        row.push(cell); cell = '';
      } else if (ch === '\n') {
        row.push(cell); rows.push(row); row = []; cell = '';
      } else if (ch !== '\r') {
        cell += ch;
      }
    }
    if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
    return rows;
  }

  function renderCsv(text, sep) {
    var d = shell();
    var rows = parseDelimited(text || '', sep);
    var CAP = 800;
    var wrap = document.createElement('div');
    wrap.className = 'table-wrap';
    var table = document.createElement('table');
    rows.slice(0, CAP).forEach(function (r, i) {
      var tr = document.createElement('tr');
      r.forEach(function (c) {
        var td = document.createElement(i === 0 ? 'th' : 'td');
        td.textContent = c;
        tr.appendChild(td);
      });
      table.appendChild(tr);
    });
    wrap.appendChild(table);
    d.appendChild(wrap);
    if (rows.length > CAP) {
      var p = document.createElement('p');
      p.className = 'file-tip';
      p.textContent = '共 ' + rows.length + ' 行，仅显示前 ' + CAP + ' 行。';
      d.appendChild(p);
    }
    return d;
  }

  function renderHtml(text, ctxPath) {
    var d = shell();
    var clean = DOMPurify.sanitize(text || '', PURIFY_CFG);
    d.innerHTML = clean;

    // 剥离可能残留的样式/脚本，避免污染阅读区
    $$('script,style,link,meta,iframe,object,embed', d).forEach(function (el) {
      if (el.parentNode) el.parentNode.removeChild(el);
    });
    // 正文类容器去掉固定宽度，交给阅读器排版
    $$('body,html', d).forEach(function (el) {
      el.removeAttribute('style');
      el.removeAttribute('width');
    });
    resolveImages(d, ctxPath);
    resolveLinks(d, ctxPath);
    return d;
  }

  function resolveLocalAsset(src, ctxPath) {
    var decoded;
    try { decoded = decodeURIComponent(String(src)); } catch (e) { decoded = String(src); }
    var candidates = [];
    if (ctxPath) candidates.push(joinPath(dirName(ctxPath), decoded));
    candidates.push(normPath(decoded));
    candidates.push(decoded.replace(/^\.?\//, ''));
    for (var i = 0; i < candidates.length; i++) {
      var key = candidates[i].toLowerCase();
      if (state.images.has(key)) return state.images.get(key);
    }
    // 兜底：仅按文件名匹配
    var bn = baseName(decoded).toLowerCase();
    var it = state.images.entries();
    var step = it.next();
    while (!step.done) {
      if (baseName(step.value[0]) === bn) return step.value[1];
      step = it.next();
    }
    return null;
  }

  function findLinkedFile(href, ctxPath) {
    if (!href) return null;
    var raw = String(href).replace(/\\/g, '/').split('#')[0];
    if (!raw) return null;
    var decoded = raw;
    try { decoded = decodeURIComponent(raw); } catch (e) { }
    var cands = [];
    if (ctxPath) cands.push(joinPath(dirName(ctxPath), decoded));
    cands.push(normPath(decoded));
    cands.push(decoded.replace(/^\.?\//, ''));
    for (var i = 0; i < cands.length; i++) {
      var f = state.files.find(function (x) { return x.path.toLowerCase() === cands[i].toLowerCase(); });
      if (f) return f;
    }
    var bn = baseName(decoded).toLowerCase();
    return state.files.find(function (x) { return x.name.toLowerCase() === bn; }) || null;
  }

  function copyText(t) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(t).then(function () { return true; }, function () { return fallbackCopy(t); });
    }
    return Promise.resolve(fallbackCopy(t));
  }
  function fallbackCopy(t) {
    try {
      var ta = document.createElement('textarea');
      ta.value = t;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      var ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch (e) { return false; }
  }

  /* ---------------- 文件导入 ---------------- */
  function addEntries(entries) {
    // entries: [{path, name, blob|file, size}]
    var added = 0, updated = 0, skipped = 0, tooBig = 0, images = 0, firstNewId = null;
    entries.forEach(function (e) {
      var name = e.name || baseName(e.path);

      if (isImageName(name)) {
        try {
          var key = normPath(e.path).toLowerCase();
          if (state.images.has(key)) URL.revokeObjectURL(state.images.get(key));
          state.images.set(key, URL.createObjectURL(e.blob));
          images++;
        } catch (err) { skipped++; }
        return;
      }
      if (isBinaryName(name)) { skipped++; return; }
      if (e.size > MAX_FILE_SIZE) { tooBig++; return; }

      var path = normPath(e.path);
      var idx = state.files.findIndex(function (x) { return x.path === path; });
      if (idx >= 0) {
        state.files[idx].blob = e.blob;
        state.files[idx].size = e.size;
        state.files[idx].text = null; // 内容变了，下次打开重新读
        updated++;
      } else {
        var id = 'f' + (++uidSeq);
        var kind = detectKind(name);
        state.files.push({
          id: id,
          name: baseName(path),
          path: path,
          dir: dirName(path),
          size: e.size,
          kind: kind.kind,
          lang: kind.lang || '',
          sep: kind.sep || ',',
          text: null,
          blob: e.blob,
          handle: e.handle || null,
          dirty: false,
          scrollTop: 0,
        });
        added++;
        if (!firstNewId) firstNewId = id;
      }
    });
    return { added: added, updated: updated, skipped: skipped, tooBig: tooBig, images: images, firstNewId: firstNewId };
  }

  function importSummary(res) {
    var parts = [];
    if (res.added) parts.push('新增 ' + res.added);
    if (res.updated) parts.push('更新 ' + res.updated);
    if (res.images) parts.push('图片 ' + res.images);
    if (res.skipped) parts.push('跳过 ' + res.skipped + ' 个二进制文件');
    if (res.tooBig) parts.push(res.tooBig + ' 个文件过大');
    return parts.length ? '已导入：' + parts.join('，') : '';
  }

  var uidSeq = 0;

  async function ingestFileList(fileList, rootPrefix) {
    var list = Array.prototype.slice.call(fileList);
    var entries = [];
    for (var i = 0; i < list.length; i++) {
      var f = list[i];
      var rel = f.webkitRelativePath || f.name;
      entries.push({ path: (rootPrefix ? rootPrefix + '/' : '') + rel, name: f.name, blob: f, size: f.size });
    }
    return entries;
  }

  // 递归读取拖入的目录
  function readEntry(entry, prefix, out) {
    return new Promise(function (resolve) {
      if (!entry) return resolve();
      if (entry.isFile) {
        entry.file(function (f) {
          out.push({ path: joinPath(prefix, f.name), name: f.name, blob: f, size: f.size });
          resolve();
        }, function () { resolve(); });
      } else if (entry.isDirectory) {
        var reader = entry.createReader();
        var all = [];
        function readBatch() {
          reader.readEntries(function (results) {
            if (!results.length) {
              var p = Promise.resolve();
              all.forEach(function (e) {
                p = p.then(function () { return readEntry(e, joinPath(prefix, entry.name), out); });
              });
              p.then(resolve);
              return;
            }
            all = all.concat(Array.prototype.slice.call(results));
            readBatch();
          }, function () { resolve(); });
        }
        readBatch();
      } else resolve();
    });
  }

  async function handleDataTransfer(dt) {
    if (!dt) { toast('这次拖拽没有携带文件数据，请改用「打开文件」按钮'); return; }

    var entries = [];
    var bareFiles = [];

    // 注意：不能再假设 items[0].webkitGetAsEntry 一定存在。
    // 部分拖拽源（搜索工具、压缩包、邮件客户端）会往 items 里塞 text/uri-list
    // 等字符串条目，旧实现只看第 0 项，一旦它是字符串就会整条路径静默失败。
    var items = dt.items ? Array.prototype.slice.call(dt.items) : [];
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      if (!it) continue;
      if (typeof it.kind === 'string' && it.kind !== 'file') continue;
      var en = null;
      try { en = it.webkitGetAsEntry ? it.webkitGetAsEntry() : null; } catch (e) { en = null; }
      if (en) { entries.push(en); continue; }
      try {
        var bf = it.getAsFile ? it.getAsFile() : null;
        if (bf) bareFiles.push(bf);
      } catch (e2) { /* 忽略这一项，继续处理其它 */ }
    }

    var out = [];
    if (entries.length) {
      var results = await Promise.all(entries.map(function (en) {
        var arr = [];
        return readEntry(en, '', arr).then(function () { return arr; }, function () { return arr; });
      }));
      results.forEach(function (arr) { out = out.concat(arr); });
    }

    // 没有任何 entry（含旧浏览器 / 虚拟文件）时退回 File 列表
    if (!out.length) {
      var list = bareFiles.length ? bareFiles
        : (dt.files && dt.files.length ? Array.prototype.slice.call(dt.files) : []);
      out = await ingestFileList(list, '');
    }

    if (!out.length) {
      toast('没识别到文件：请把文件或整个文件夹拖到页面中间再松手');
      return;
    }

    // 只拖了一个顶层文件夹时，去掉这层前缀让路径更干净
    var tops = {};
    out.forEach(function (e) { tops[e.path.split('/')[0]] = 1; });
    if (Object.keys(tops).length === 1 && out.length > 1) {
      var first = out[0].path.split('/')[0];
      if (out.some(function (e) { return e.path.indexOf('/') > 0; })) {
        out.forEach(function (e) { e.path = e.path.slice(first.length + 1); });
      }
    }

    var res = addEntries(out);
    renderTree();
    toast(importSummary(res) || '这些文件已经读过了，没有新增内容');
    if (res.firstNewId && !state.currentId) openFile(res.firstNewId);
  }

  /* ---------------- 侧栏文件树 ---------------- */
  function renderTree() {
    var box = $('#filetree');
    var kw = $('#filter').value.trim().toLowerCase();
    box.innerHTML = '';

    if (!state.files.length) {
      box.innerHTML = '<div class="tree-empty">还没有文件<br>把 .md 文件或整个文件夹拖进窗口即可</div>';
      $('#file-count').textContent = '0';
      return;
    }

    var groups = {};
    var order = [];
    state.files.forEach(function (f) {
      var g = f.dir || '（根目录）';
      if (!groups[g]) { groups[g] = []; order.push(g); }
      groups[g].push(f);
    });
    order.sort(function (a, b) {
      if (a === '（根目录）') return -1;
      if (b === '（根目录）') return 1;
      return a.localeCompare(b, 'zh');
    });

    // 同名文件多于一个时，额外显示所在目录以便区分
    var nameCount = {};
    state.files.forEach(function (f) { nameCount[f.name] = (nameCount[f.name] || 0) + 1; });

    var shown = 0;
    order.forEach(function (g) {
      var list = groups[g].filter(function (f) {
        return !kw || f.name.toLowerCase().indexOf(kw) >= 0 || f.path.toLowerCase().indexOf(kw) >= 0;
      });
      if (!list.length) return;
      shown += list.length;

      var gh = document.createElement('div');
      gh.className = 'tree-group';
      gh.innerHTML = '<span class="caret">▾</span><span></span>';
      gh.lastChild.textContent = g;
      gh.addEventListener('click', function () { gh.classList.toggle('collapsed'); });
      box.appendChild(gh);

      list.sort(function (a, b) { return a.name.localeCompare(b.name, 'zh'); });
      list.forEach(function (f) {
        var it = document.createElement('div');
        it.className = 'tree-item' + (f.id === state.currentId ? ' active' : '');
        it.dataset.id = f.id;
        it.title = f.path + ' · ' + fmtSize(f.size || 0);
        it.innerHTML =
          '<svg class="icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4">' +
          '<path d="M9.2 1.6H4a1.4 1.4 0 0 0-1.4 1.4v10.2A1.4 1.4 0 0 0 4 14.6h8a1.4 1.4 0 0 0 1.4-1.4V5.8z"/>' +
          '<path d="M9.2 1.6v4.2h4.2"/></svg>' +
          '<span class="name"></span>';
        it.querySelector('.name').textContent = f.name;
        if (g === '（根目录）') {
          var b = document.createElement('span');
          b.className = 'badge';
          b.textContent = fmtSize(f.size || 0);
          it.appendChild(b);
        }
        it.addEventListener('click', function () { openFile(f.id); });
        box.appendChild(it);
      });
    });

    if (!shown) {
      box.innerHTML = '<div class="tree-empty">没有匹配「' + $('#filter').value + '」的文件</div>';
    }
    $('#file-count').textContent = String(state.files.length);
  }

  /* ---------------- 打开文件 ---------------- */
  async function openFile(id, anchor) {
    var f = state.files.find(function (x) { return x.id === id; });
    if (!f) return;

    if (state.currentId) {
      var prev = state.files.find(function (x) { return x.id === state.currentId; });
      if (prev) prev.scrollTop = $('#content-wrap').scrollTop;
    }

    state.currentId = id;
    if (f.text === null || f.text === undefined) {
      if (!f.blob) { toast('无法读取该文件内容'); return; }
      try {
        var buf = await f.blob.arrayBuffer();
        if (looksBinary(buf) && f.kind !== 'image') {
          f.binary = true;
          f.text = '';
        } else {
          f.text = await decodeBuffer(buf);
        }
      } catch (e) {
        f.text = '读取失败：' + e.message;
      }
    }

    var wrap = $('#content-wrap');
    var node;
    if (f.binary) {
      node = shell();
      var tip = document.createElement('p');
      tip.className = 'file-tip warn';
      tip.textContent = '「' + f.name + '」看起来是二进制文件，无法作为文本预览。';
      var tip2 = document.createElement('p');
      tip2.className = 'file-tip';
      tip2.textContent = '支持预览的格式：Markdown、HTML、CSV/TSV、JSON、各类代码与纯文本文件。';
      node.appendChild(tip);
      node.appendChild(tip2);
    } else {
      node = renderContent(f);
    }
    $('#content').innerHTML = '';
    $('#content').appendChild(node);
    state.search.raw = $('#content').innerHTML;
    clearSearch(true);

    $('#empty').classList.add('hide');
    document.title = f.name + ' · MD Reader';

    // 大纲
    buildOutline(node);

    // 状态栏
    var plain = node.textContent || '';
    var chars = plain.replace(/\s/g, '').length;
    $('#stat-chars').textContent = chars.toLocaleString('zh-CN');
    $('#stat-lines').textContent = String(f.text.split('\n').length);
    $('#stat-read').textContent = Math.max(1, Math.round(chars / 400)) + ' 分钟';
    $('#stat-path').textContent = f.path;
    $('#stat-path').title = f.path;
    $('#stat-size').textContent = fmtSize(f.size || 0);
    $('#stat-kind').textContent = kindLabel(f);
    $('#statusbar').classList.toggle('dirty', !!f.dirty);

    // 恢复滚动
    wrap.scrollTop = anchor ? 0 : (f.scrollTop || 0);
    renderTree();
    updateActiveTreeItem();

    if (anchor) {
      setTimeout(function () {
        var el = document.getElementById(anchor);
        if (el) el.scrollIntoView({ block: 'start' });
      }, 30);
    } else {
      wrap.scrollTop = f.scrollTop || 0;
    }

    // 编辑模式下同步编辑器内容
    if (state.editing) {
      clearTimeout(editTimer);
      $('#editor').value = f.text == null ? '' : f.text;
      updateEditHint();
    }

    onScroll();
  }

  function updateActiveTreeItem() {
    $$('#filetree .tree-item').forEach(function (it) {
      it.classList.toggle('active', it.dataset.id === state.currentId);
    });
  }

  function currentFile() {
    return state.files.find(function (x) { return x.id === state.currentId; }) || null;
  }

  var KIND_LABEL = { markdown: 'Markdown', html: 'HTML', csv: '表格', json: 'JSON', code: '代码', text: '文本' };
  function kindLabel(f) {
    if (!f) return '—';
    if (f.binary) return '二进制';
    var base = KIND_LABEL[f.kind] || '文本';
    return f.lang ? base + ' · ' + f.lang : base;
  }

  function reloadCurrent() {
    var f = currentFile();
    if (!f || !f.blob) { toast('当前内容无法重新读取（剪贴板内容）'); return; }
    f.text = null;
    openFile(f.id);
    toast('已重新加载');
  }

  function stepFile(dir) {
    if (!state.files.length) return;
    var i = state.files.findIndex(function (x) { return x.id === state.currentId; });
    i = i < 0 ? 0 : (i + dir + state.files.length) % state.files.length;
    openFile(state.files[i].id);
  }

  /* ---------------- 大纲 ---------------- */
  function buildOutline(root) {
    var list = $('#outline-list');
    state.headings = $$('h1,h2,h3,h4,h5,h6', root);
    list.innerHTML = '';
    if (!state.headings.length) {
      var cf = currentFile();
      var isDoc = cf && (cf.kind === 'markdown' || cf.kind === 'html');
      list.innerHTML = '<div class="ol-empty">' +
        (isDoc ? '本文没有标题' : '该格式没有大纲') + '</div>';
      return;
    }
    state.headings.forEach(function (h) {
      var lv = Number(h.tagName[1]);
      var a = document.createElement('div');
      a.className = 'ol-item';
      a.dataset.level = String(Math.min(lv, 6));
      a.dataset.id = h.id;
      a.textContent = h.textContent.replace(/^#\s*/, '');
      a.title = a.textContent;
      a.addEventListener('click', function () {
        var el = document.getElementById(h.id);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
      list.appendChild(a);
    });
  }

  function scrollEl() {
    return state.editing ? $('#content') : $('#content-wrap');
  }

  var olTick = null;
  function syncOutline() {
    if (olTick) return;
    olTick = requestAnimationFrame(function () {
      olTick = null;
      var wrap = scrollEl();
      if (!wrap) return;
      var top = wrap.scrollTop + 80;
      var idx = -1;
      for (var i = 0; i < state.headings.length; i++) {
        if (state.headings[i].offsetTop <= top) idx = i; else break;
      }
      if (idx < 0) idx = 0;
      var id = state.headings[idx] ? state.headings[idx].id : null;
      $$('#outline-list .ol-item').forEach(function (it) {
        it.classList.toggle('active', it.dataset.id === id);
      });
    });
  }

  function onScroll() {
    var wrap = scrollEl();
    if (!wrap) return;
    var max = wrap.scrollHeight - wrap.clientHeight;
    var p = max > 0 ? (wrap.scrollTop / max) * 100 : 0;
    $('#progress').style.width = p.toFixed(2) + '%';
    $('#totop').classList.toggle('show', wrap.scrollTop > 400);
    if (!state.editing) {
      var f = currentFile();
      if (f) f.scrollTop = wrap.scrollTop;
    }
    syncOutline();
  }

  /* ---------------- 正文搜索 ---------------- */
  function clearSearch(silent) {
    if (state.search.raw && $('#content').innerHTML !== state.search.raw) {
      $('#content').innerHTML = state.search.raw;
      buildOutline($('#content'));
    }
    state.search.hits = [];
    state.search.idx = -1;
    $('#search').classList.remove('has-value');
    if (!silent) $('#search-count').textContent = '';
  }

  function doSearch(kw) {
    var wrap = $('#search-wrap');
    if (!kw) { clearSearch(); return; }
    if (!currentFile()) return;

    if (!$('#content').querySelector('mark')) {
      // 从原始 HTML 恢复再高亮
      $('#content').innerHTML = state.search.raw;
    } else {
      $('#content').innerHTML = state.search.raw;
    }
    buildOutline($('#content'));

    var lower = kw.toLowerCase();
    var marks = [];
    var walker = document.createTreeWalker($('#content'), NodeFilter.SHOW_TEXT, {
      acceptNode: function (n) {
        if (!n.nodeValue || !n.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
        var p = n.parentNode;
        if (!p) return NodeFilter.FILTER_REJECT;
        var tag = p.nodeName;
        if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'MARK') return NodeFilter.FILTER_REJECT;
        return n.nodeValue.toLowerCase().indexOf(lower) >= 0 ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      }
    });
    var targets = [];
    while (walker.nextNode()) targets.push(walker.currentNode);

    targets.forEach(function (node) {
      var text = node.nodeValue;
      var frag = document.createDocumentFragment();
      var pos = 0, idx;
      var ltext = text.toLowerCase();
      while ((idx = ltext.indexOf(lower, pos)) >= 0) {
        if (idx > pos) frag.appendChild(document.createTextNode(text.slice(pos, idx)));
        var mk = document.createElement('mark');
        mk.textContent = text.substr(idx, kw.length);
        frag.appendChild(mk);
        marks.push(mk);
        pos = idx + kw.length;
      }
      if (pos < text.length) frag.appendChild(document.createTextNode(text.slice(pos)));
      node.parentNode.replaceChild(frag, node);
    });

    state.search.hits = marks;
    state.search.idx = marks.length ? 0 : -1;
    wrap.classList.add('has-value');
    $('#search-count').textContent = marks.length ? '1/' + marks.length : '无结果';
    if (marks.length) gotoHit(0);
  }

  function gotoHit(i) {
    var marks = state.search.hits;
    if (!marks.length) return;
    if (i < 0) i = marks.length - 1;
    if (i >= marks.length) i = 0;
    state.search.idx = i;
    marks.forEach(function (m, k) { m.classList.toggle('current', k === i); });
    marks[i].scrollIntoView({ block: 'center', behavior: 'smooth' });
    $('#search-count').textContent = (i + 1) + '/' + marks.length;
  }

  /* ---------------- 命令面板 ---------------- */
  var paletteItems = [];
  function openPalette() {
    $('#palette').classList.add('show');
    $('#palette-input').value = '';
    renderPalette('');
    setTimeout(function () { $('#palette-input').focus(); }, 20);
  }
  function closePalette() { $('#palette').classList.remove('show'); }

  function renderPalette(q) {
    var list = $('#palette-list');
    list.innerHTML = '';
    q = q.trim().toLowerCase();

    var cmds = [
      { cmd: 'open', nm: '打开文件…', fn: pickFiles },
      { cmd: 'folder', nm: '打开整个文件夹…', fn: pickFolderFSA },
      { cmd: 'edit', nm: '编辑 / 阅读模式切换', fn: toggleEditMode },
      { cmd: 'save', nm: '保存当前文档 (Ctrl+S)', fn: saveCurrent },
      { cmd: 'paste', nm: '从剪贴板粘贴 Markdown', fn: pasteFromClipboard },
      { cmd: 'theme', nm: '切换深色 / 浅色主题', fn: toggleTheme },
      { cmd: 'html', nm: '导出为 HTML 网页', fn: function () { exportAs('html'); } },
      { cmd: 'word', nm: '导出为 Word 文档 (.docx)', fn: function () { exportAs('docx'); } },
      { cmd: 'txt', nm: '导出为纯文本 (.txt)', fn: function () { exportAs('txt'); } },
      { cmd: 'print', nm: '打印 / 另存为 PDF', fn: function () { window.print(); } },
      { cmd: 'reload', nm: '重新加载当前文件', fn: reloadCurrent },
      { cmd: 'rescan', nm: '重新扫描文件夹（同步磁盘新增）', fn: scanFSA },
      { cmd: 'clear', nm: '清空文件列表', fn: clearAll },
      { cmd: 'outline', nm: '显示 / 隐藏大纲', fn: function () { toggleOutline(); } },
      { cmd: 'sidebar', nm: '显示 / 隐藏文件列表', fn: function () { toggleSidebar(); } },
    ];

    paletteItems = [];
    cmds.forEach(function (c) {
      if (!q || c.nm.toLowerCase().indexOf(q) >= 0 || c.cmd.indexOf(q) >= 0) {
        paletteItems.push({ nm: c.nm, pt: '命令', fn: c.fn });
      }
    });
    var mds = state.files.filter(function (f) {
      return !q || f.name.toLowerCase().indexOf(q) >= 0 || f.path.toLowerCase().indexOf(q) >= 0;
    }).slice(0, 200);
    mds.forEach(function (f) {
      paletteItems.push({ nm: f.name, pt: f.dir || '/', fn: function () { openFile(f.id); } });
    });

    if (!paletteItems.length) {
      list.innerHTML = '<div class="empty">没有匹配项</div>';
      return;
    }
    paletteItems.slice(0, 60).forEach(function (it, i) {
      var d = document.createElement('div');
      d.className = 'item' + (i === 0 ? ' sel' : '');
      d.innerHTML = '<span class="nm"></span><span class="pt"></span>';
      d.querySelector('.nm').textContent = it.nm;
      d.querySelector('.pt').textContent = it.pt;
      d.addEventListener('click', function () { closePalette(); it.fn(); });
      list.appendChild(d);
    });
  }

  function movePaletteSel(dir) {
    var items = $$('#palette-list .item');
    if (!items.length) return;
    var i = items.findIndex(function (x) { return x.classList.contains('sel'); });
    if (i >= 0) items[i].classList.remove('sel');
    i = (i + dir + items.length) % items.length;
    items[i].classList.add('sel');
    items[i].scrollIntoView({ block: 'nearest' });
  }

  /* ---------------- 其它动作 ---------------- */
  function toggleTheme() {
    state.prefs.theme = state.prefs.theme === 'dark' ? 'light' : 'dark';
    applyPrefs();
    savePrefs();
  }

  function toggleSidebar() {
    state.prefs.sidebar = !state.prefs.sidebar;
    applyPrefs(); savePrefs();
  }
  function toggleOutline() {
    state.prefs.outline = !state.prefs.outline;
    applyPrefs(); savePrefs();
  }

  function clearAll() {
    if (!state.files.length && !state.images.size) return;
    state.images.forEach(function (u) { URL.revokeObjectURL(u); });
    state.images.clear();
    state.files = [];
    state.currentId = null;
    state.headings = [];
    $('#content').innerHTML = '';
    $('#empty').classList.remove('hide');
    $('#outline-list').innerHTML = '<div class="ol-empty">—</div>';
    ['#stat-chars', '#stat-lines', '#stat-read', '#stat-path', '#stat-size'].forEach(function (s) { $(s).textContent = '—'; });
    document.title = 'MD Reader';
    renderTree();
    toast('已清空');
  }

  async function pasteFromClipboard() {
    var text = null;
    try { text = await navigator.clipboard.readText(); } catch (e) { }
    if (text === null || !String(text).trim()) {
      toast('剪贴板为空或浏览器不允许读取');
      return;
    }
    addPasted(text);
  }

  function addPasted(text) {
    var name = '剪贴板 ' + new Date().toLocaleTimeString('zh-CN', { hour12: false }) + '.md';
    var f = {
      id: 'f' + (++uidSeq),
      name: name, path: name, dir: '（剪贴板）',
      size: text.length, text: text, blob: null, scrollTop: 0,
    };
    state.files.push(f);
    renderTree();
    openFile(f.id);
    toast('已从剪贴板创建文档');
  }

  function blobToDataURL(blob) {
    return new Promise(function (resolve, reject) {
      var fr = new FileReader();
      fr.onload = function () { resolve(fr.result); };
      fr.onerror = reject;
      fr.readAsDataURL(blob);
    });
  }

  function downloadBlob(blob, filename) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
  }

  function baseNoExt(name) { return String(name).replace(/\.[^.]+$/, ''); }

  // blob: 图片离开当前会话会失效，导出前转成 data:
  async function inlineImages(root) {
    var imgs = root.querySelectorAll('img');
    for (var i = 0; i < imgs.length; i++) {
      var src = imgs[i].getAttribute('src') || '';
      if (/^blob:/.test(src)) {
        try {
          var resp = await fetch(src);
          imgs[i].setAttribute('src', await blobToDataURL(await resp.blob()));
        } catch (e) { /* 保持原样 */ }
      }
      imgs[i].removeAttribute('loading');
      imgs[i].removeAttribute('srcset');
    }
    return imgs.length;
  }

  function contentClone() {
    var holder = document.createElement('div');
    holder.innerHTML = $('#content').innerHTML;
    $$('.copy-btn', holder).forEach(function (el) {
      if (el.parentNode) el.parentNode.removeChild(el);
    });
    return holder;
  }

  async function exportAs(fmt) {
    var f = currentFile();
    if (!f) { toast('还没有打开任何文档'); return; }
    if (fmt === 'print') { window.print(); return; }
    if (fmt === 'html') return exportHtmlFile(f);
    if (fmt === 'txt') return exportTxtFile(f);
    if (fmt === 'docx') return exportDocxFile(f);
  }

  async function exportHtmlFile(f) {
    var css = INLINE_CSS || '';
    var holder = contentClone();
    await inlineImages(holder);
    var body = holder.innerHTML;

    var doc = '<!DOCTYPE html>\n<html lang="zh-CN" data-theme="' + state.prefs.theme + '">\n<head>\n' +
      '<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
      '<title>' + escapeHtml(f.name) + '</title>\n<style>\n' + css + '\n' +
      '\nbody{overflow:auto;height:auto}#topbar,#sidebar,#outline,#statusbar,#progress,#totop,#editor-pane{display:none!important}' +
      '#main{display:block}#content-wrap{overflow:visible;display:block}' +
      '\n</style>\n</head>\n<body>\n<div id="content" class="md-wrap">' + body + '</div>\n</body>\n</html>';
    downloadBlob(new Blob([doc], { type: 'text/html;charset=utf-8' }), baseNoExt(f.name) + '.html');
    toast('已导出 HTML');
  }

  function exportTxtFile(f) {
    var text = domToPlainText(contentClone());
    downloadBlob(new Blob([text], { type: 'text/plain;charset=utf-8' }), baseNoExt(f.name) + '.txt');
    toast('已导出纯文本');
  }

  async function exportDocxFile(f) {
    if (!window.MDDocx) { toast('Word 导出模块未加载'); return; }
    toast('正在生成 Word 文档…');
    try {
      var blob = await window.MDDocx.toBlob(contentClone(), { title: baseNoExt(f.name) });
      downloadBlob(blob, baseNoExt(f.name) + '.docx');
      toast('已导出 Word 文档');
    } catch (e) {
      toast('导出失败：' + (e && e.message ? e.message : e));
    }
  }

  /* -------- DOM -> 纯文本 -------- */
  function domToPlainText(root) {
    var lines = [];

    function inlineText(node) {
      var s = '';
      var kids = node.childNodes || [];
      for (var i = 0; i < kids.length; i++) {
        var c = kids[i];
        if (c.nodeType === 3) s += c.nodeValue;
        else if (c.nodeType === 1) {
          var t = c.tagName.toLowerCase();
          if (t === 'br') s += '\n';
          else if (t === 'img') s += '［图片' + (c.getAttribute('alt') ? '：' + c.getAttribute('alt') : '') + '］';
          else if (t === 'input') continue;
          else s += inlineText(c);
        }
      }
      return s;
    }

    function emit(raw) {
      var t = String(raw)
        .replace(/[ \t]+\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .replace(/[ \t]{2,}/g, ' ')
        .trim();
      if (!t) return;
      if (lines.length && lines[lines.length - 1] !== '') lines.push('');
      lines.push(t);
    }

    function list(el, depth) {
      var ordered = el.tagName.toLowerCase() === 'ol';
      var items = Array.prototype.slice.call(el.children).filter(function (x) {
        return x.tagName && x.tagName.toLowerCase() === 'li';
      });
      var pad = new Array(depth + 1).join('  ');
      items.forEach(function (li, i) {
        var cb = li.querySelector(':scope > input[type="checkbox"]');
        var marker = cb ? (cb.checked ? '[x] ' : '[ ] ') : (ordered ? (i + 1) + '. ' : '- ');
        var txt = inlineText(li).trim().replace(/\s*\n\s*/g, ' ');
        if (txt) lines.push(pad + marker + txt);
        Array.prototype.slice.call(li.children).forEach(function (sub) {
          var t = sub.tagName.toLowerCase();
          if (t === 'ul' || t === 'ol') list(sub, depth + 1);
        });
      });
      lines.push('');
    }

    function tableToText(t) {
      var rows = Array.prototype.slice.call(t.querySelectorAll('tr'));
      rows.forEach(function (tr, i) {
        var cells = Array.prototype.slice.call(tr.children).map(function (td) {
          return (td.textContent || '').trim().replace(/\s+/g, ' ');
        });
        lines.push(cells.join('\t'));
        if (i === 0) lines.push(cells.map(function () { return '--------'; }).join('\t'));
      });
      lines.push('');
    }

    function block(node, depth) {
      var kids = node.childNodes || [];
      for (var i = 0; i < kids.length; i++) {
        var c = kids[i];
        if (c.nodeType !== 1) continue;
        var tag = c.tagName.toLowerCase();

        if (/^h[1-6]$/.test(tag)) { emit(inlineText(c)); continue; }
        if (tag === 'p') { emit(inlineText(c)); continue; }
        if (tag === 'pre') {
          var codeEl = c.querySelector('code') || c;
          var txt = (codeEl.textContent || '').replace(/\s+$/, '');
          emit(txt.split('\n').map(function (l) { return '    ' + l; }).join('\n'));
          continue;
        }
        if (tag === 'blockquote') {
          emit(inlineText(c).split('\n').map(function (l) { return '> ' + l; }).join('\n'));
          continue;
        }
        if (tag === 'ul' || tag === 'ol') { list(c, depth); continue; }
        if (tag === 'table') { tableToText(c); continue; }
        if (tag === 'hr') { emit('———————————'); continue; }
        if (tag === 'img') {
          emit('［图片' + (c.getAttribute('alt') ? '：' + c.getAttribute('alt') : '') + '］');
          continue;
        }
        if (['div', 'section', 'article', 'figure', 'figcaption', 'header', 'footer', 'body', 'details', 'summary'].indexOf(tag) >= 0) {
          block(c, depth);
          continue;
        }
        emit(inlineText(c));
      }
    }

    block(root, 0);
    return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* -------- 通过 URL 自动打开本地文件（配合 open-md.bat） -------- */
  // file:// 页面默认不能 fetch 本地文件，需要浏览器带 --allow-file-access-from-files 启动。
  // open-md.bat 会把待打开文件的绝对路径写入同目录的 _last_open.txt，再启动带该参数的浏览器。
  async function tryAutoOpen() {
    if (!/[?&]autofile=/.test(location.search)) return;
    try {
      var r = await fetch('_last_open.txt?t=' + Date.now(), { cache: 'no-store' });
      if (!r.ok) return;
      var p = (await r.text()).split(/\r?\n/)[0].replace(/^"|"$/g, '').trim();
      if (p) await loadPathFromUrl(p);
    } catch (e) {
      toast('自动打开失败：请用 open-md.bat 启动');
    }
  }

  async function loadPathFromUrl(p) {
    var url;
    if (/^[a-zA-Z]:[\\/]/.test(p)) url = 'file:///' + p.replace(/\\/g, '/');
    else if (/^file:/i.test(p)) url = p;
    else url = p;
    url = encodeURI(url).replace(/#/g, '%23');

    var r = await fetch(url, { cache: 'no-store' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    var buf = await r.arrayBuffer();
    var text = await decodeBuffer(buf);

    var path = normPath(p.replace(/\\/g, '/').replace(/^file:\/\/\/?/i, ''));
    var f = state.files.find(function (x) { return x.path === path; });
    if (!f) {
      f = {
        id: 'f' + (++uidSeq),
        name: baseName(path),
        path: path,
        dir: dirName(path),
        size: buf.byteLength,
        text: text,
        blob: new File([buf], baseName(path), { type: 'text/markdown' }),
        scrollTop: 0,
      };
      state.files.push(f);
    } else {
      f.text = text;
      f.size = buf.byteLength;
      f.blob = new File([buf], f.name, { type: 'text/markdown' });
    }
    renderTree();
    openFile(f.id);
  }

  /* -------- 打开文件：优先用 File System Access API，能拿到可写句柄 -------- */
  function finishImport(entries) {
    if (!entries || !entries.length) return;
    var res = addEntries(entries);
    renderTree();
    toast(importSummary(res) || '没有新增内容');
    if (res.firstNewId && !state.currentId) openFile(res.firstNewId);
    else if (res.firstNewId && state.editing) openFile(res.firstNewId);
  }

  async function pickFiles() {
    if (!window.showOpenFilePicker) { $('#file-input').click(); return; }
    try {
      var handles = await window.showOpenFilePicker({ multiple: true });
      var out = [];
      for (var i = 0; i < handles.length; i++) {
        var h = handles[i];
        var file = await h.getFile();
        out.push({ path: file.name, name: file.name, blob: file, size: file.size, handle: h });
      }
      finishImport(out);
    } catch (e) {
      if (e && e.name === 'AbortError') return;
      $('#file-input').click();
    }
  }

  /* -------- 可选：File System Access API 打开文件夹（支持重新扫描） -------- */
  async function pickFolderFSA() {
    if (!window.showDirectoryPicker) { $('#dir-input').click(); return; }
    try {
      var h = await window.showDirectoryPicker({ id: 'mdreader', mode: 'read' });
      state.dirHandle = h;
      await scanFSA();
    } catch (e) {
      if (e && e.name === 'AbortError') return;
      $('#dir-input').click();
    }
  }

  var SKIP_DIRS = { 'node_modules': 1, '.git': 1, '.svn': 1, 'dist': 1, 'build': 1, '__pycache__': 1, '.venv': 1, 'venv': 1 };

  async function scanDirHandle(dir, prefix, out) {
    var it = dir.entries();
    var step = await it.next();
    while (!step.done) {
      var name = step.value[0], h = step.value[1];
      if (h.kind === 'file') {
        if (!isBinaryName(name)) {
          try {
            var f = await h.getFile();
            out.push({ path: joinPath(prefix, name), name: name, blob: f, size: f.size, handle: h });
          } catch (e) { /* 读取失败则跳过 */ }
        }
      } else if (h.kind === 'directory') {
        if (!SKIP_DIRS[name] && name.charAt(0) !== '.') await scanDirHandle(h, joinPath(prefix, name), out);
      }
      step = await it.next();
    }
  }

  async function scanFSA() {
    if (!state.dirHandle) { $('#dir-input').click(); return; }
    toast('正在扫描…');
    var out = [];
    try {
      await scanDirHandle(state.dirHandle, '', out);
    } catch (e) {
      toast('扫描失败：' + (e.message || e));
      return;
    }
    finishImport(out);
  }

  /* ---------------- 编辑模式 ---------------- */
  var editTimer = null;

  function setEditMode(on) {
    var f = currentFile();
    if (on) {
      if (!f) { toast('先打开一个文档再编辑'); return; }
      if (f.binary) { toast('二进制文件无法编辑'); return; }
    }
    state.editing = !!on;
    $('#app').classList.toggle('editing', state.editing);
    $('#btn-edit').classList.toggle('on', state.editing);
    $('#edit-label').textContent = state.editing ? '阅读' : '编辑';

    if (state.editing) {
      $('#editor').value = f.text == null ? '' : f.text;
      updateEditHint();
      renderPreview();
      setTimeout(function () {
        var ta = $('#editor');
        if (ta) ta.focus();
      }, 30);
    } else {
      clearTimeout(editTimer);
      if (f) {
        f.text = $('#editor').value;
        renderPreview();
      }
    }
    onScroll();
  }

  function toggleEditMode() { setEditMode(!state.editing); }

  function updateEditHint() {
    var f = currentFile();
    var el = $('#editor-hint');
    if (!el || !f) return;
    el.textContent = f.handle && f.handle.createWritable
      ? 'Ctrl+S 写回原文件'
      : 'Ctrl+S 另存为下载';
  }

  function markDirty() {
    var f = currentFile();
    if (!f) return;
    f.text = $('#editor').value;
    f.dirty = true;
    $('#statusbar').classList.add('dirty');
  }

  function schedulePreview() {
    clearTimeout(editTimer);
    editTimer = setTimeout(renderPreview, 260);
  }

  function onEditorInput() {
    markDirty();
    schedulePreview();
  }

  function onEditorKeydown(e) {
    var ta = e.target;
    if (e.key === 'Tab') {
      e.preventDefault();
      ta.setRangeText('  ', ta.selectionStart, ta.selectionEnd, 'end');
      markDirty(); schedulePreview();
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.altKey) {
      var val = ta.value;
      var pos = ta.selectionStart;
      var start = val.lastIndexOf('\n', pos - 1) + 1;
      var line = val.slice(start, pos);
      var m = /^(\s*)([-*+]|\d+\.)\s+(\[[ xX]\]\s+)?/.exec(line);
      if (!m) return;
      e.preventDefault();
      var body = line.slice(m[0].length);
      if (!body.trim()) {
        // 空的列表项，回车结束列表
        ta.setRangeText('\n' + m[1], pos, ta.selectionEnd, 'end');
      } else {
        var marker = m[2];
        if (/^\d+\.$/.test(marker)) marker = (parseInt(marker, 10) + 1) + '.';
        var task = m[3] ? '[ ] ' : '';
        ta.setRangeText('\n' + m[1] + marker + ' ' + task, pos, ta.selectionEnd, 'end');
      }
      markDirty(); schedulePreview();
    }
  }

  function renderPreview() {
    var f = currentFile();
    if (!f) return;
    f.text = $('#editor').value;
    f.binary = false;

    var node = renderContent(f);
    var content = $('#content');
    content.innerHTML = '';
    content.appendChild(node);
    state.search.raw = content.innerHTML;
    buildOutline(node);

    var plain = node.textContent || '';
    var chars = plain.replace(/\s/g, '').length;
    $('#stat-chars').textContent = chars.toLocaleString('zh-CN');
    $('#stat-lines').textContent = String(String(f.text).split('\n').length);
    $('#stat-read').textContent = Math.max(1, Math.round(chars / 400)) + ' 分钟';
  }

  async function saveCurrent() {
    var f = currentFile();
    if (!f) { toast('还没有打开任何文档'); return; }
    if (state.editing) f.text = $('#editor').value;
    var text = f.text || '';

    if (f.handle && f.handle.createWritable) {
      try {
        var w = await f.handle.createWritable();
        await w.write(text);
        await w.close();
        f.dirty = false;
        f.size = text.length;
        $('#statusbar').classList.remove('dirty');
        $('#stat-size').textContent = fmtSize(f.size);
        renderTree();
        toast('已保存到 ' + f.name);
        return;
      } catch (e) {
        toast('写回原文件失败，改为下载');
      }
    }

    var ext = (String(f.name).match(/\.[^.]+$/) || ['.md'])[0];
    downloadBlob(new Blob([text], { type: 'text/plain;charset=utf-8' }),
      baseNoExt(f.name) + '-edited' + ext);
    f.dirty = false;
    $('#statusbar').classList.remove('dirty');
    toast('已另存为下载（浏览器不允许直接改写磁盘文件）');
  }

  /* -------- 编辑器工具栏动作 -------- */
  function editorEl() { return $('#editor'); }

  function surround(before, after, placeholder) {
    var ta = editorEl();
    if (!ta) return;
    var s = ta.selectionStart, e = ta.selectionEnd;
    var sel = ta.value.slice(s, e) || placeholder || '';
    ta.setRangeText(before + sel + after, s, e, 'end');
    ta.focus();
    markDirty();
    schedulePreview();
  }

  function prefixLines(prefix, placeholder) {
    var ta = editorEl();
    if (!ta) return;
    var val = ta.value;
    var s = ta.selectionStart, e = ta.selectionEnd;
    var start = val.lastIndexOf('\n', s - 1) + 1;
    var end = val.indexOf('\n', e);
    if (end < 0) end = val.length;
    var block = val.slice(start, end);
    if (!block && placeholder) block = placeholder;
    var lines = block.split('\n');
    var allPrefixed = lines.every(function (l) { return l.indexOf(prefix) === 0; });
    var out = lines.map(function (l) {
      if (allPrefixed) return l.slice(prefix.length);
      return l ? prefix + l : prefix.trim();
    }).join('\n');
    ta.setRangeText(out, start, end, 'select');
    ta.focus();
    markDirty();
    schedulePreview();
  }

  function insertText(t) {
    var ta = editorEl();
    if (!ta) return;
    ta.setRangeText(t, ta.selectionStart, ta.selectionEnd, 'end');
    ta.focus();
    markDirty();
    schedulePreview();
  }

  function applyMarkdownAction(action) {
    switch (action) {
      case 'bold': surround('**', '**', '粗体'); break;
      case 'italic': surround('*', '*', '斜体'); break;
      case 'strike': surround('~~', '~~', '删除线'); break;
      case 'code': surround('`', '`', 'code'); break;
      case 'h1': prefixLines('# '); break;
      case 'h2': prefixLines('## '); break;
      case 'h3': prefixLines('### '); break;
      case 'ul': prefixLines('- '); break;
      case 'ol': prefixLines('1. '); break;
      case 'task': prefixLines('- [ ] '); break;
      case 'quote': prefixLines('> '); break;
      case 'link': surround('[', '](https://)', '链接文字'); break;
      case 'image': surround('![', '](./image.png)', '图片说明'); break;
      case 'table': insertText('\n| 列 1 | 列 2 |\n| --- | --- |\n| 内容 | 内容 |\n'); break;
      case 'codeblock': surround('\n```\n', '\n```\n', 'code'); break;
      case 'hr': insertText('\n\n---\n\n'); break;
    }
  }

  function openLightbox(src) {
    if (!src) return;
    $('#lightbox-img').src = src;
    $('#lightbox').classList.add('show');
  }

  function applyPrefs() {
    var p = state.prefs;
    document.documentElement.setAttribute('data-theme', p.theme);
    document.documentElement.style.setProperty('--cw', p.width + 'px');
    document.documentElement.style.setProperty('--font-size', p.fontSize + 'px');
    $('#app').classList.toggle('sidebar-hidden', !p.sidebar);
    $('#app').classList.toggle('outline-hidden', !p.outline);
    $('#btn-sidebar').classList.toggle('on', p.sidebar);
    $('#btn-outline').classList.toggle('on', p.outline);
    $('#theme-icon').innerHTML = p.theme === 'dark'
      ? '<path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6L17 7M7 17l-1.4 1.4"/><circle cx="12" cy="12" r="4"/>'
      : '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>';
  }

  function bumpFont(d) {
    state.prefs.fontSize = Math.min(24, Math.max(12, state.prefs.fontSize + d));
    applyPrefs(); savePrefs();
  }
  function bumpWidth(d) {
    state.prefs.width = Math.min(1400, Math.max(560, state.prefs.width + d));
    applyPrefs(); savePrefs();
  }

  /* ---------------- 事件绑定 ---------------- */
  // 元素不存在时静默跳过，避免模板调整后整页脚本挂掉
  function on(sel, evt, fn, opt) {
    var el = $(sel);
    if (el) el.addEventListener(evt, fn, opt);
  }

  function bind() {
    on('#btn-open', 'click', pickFiles);
    on('#btn-folder', 'click', pickFolderFSA);
    on('#btn-palette', 'click', openPalette);
    on('#btn-theme', 'click', toggleTheme);
    on('#btn-sidebar', 'click', toggleSidebar);
    on('#btn-outline', 'click', toggleOutline);
    on('#btn-reload', 'click', reloadCurrent);
    on('#btn-clear', 'click', clearAll);
    on('#btn-edit', 'click', toggleEditMode);
    on('#btn-prev', 'click', function () { stepFile(-1); });
    on('#btn-next', 'click', function () { stepFile(1); });
    on('#btn-font-down', 'click', function () { bumpFont(-1); });
    on('#btn-font-up', 'click', function () { bumpFont(1); });
    on('#empty-open', 'click', pickFiles);
    on('#empty-folder', 'click', pickFolderFSA);
    on('#empty-paste', 'click', pasteFromClipboard);
    on('#editor-save', 'click', saveCurrent);
    on('#editor-close', 'click', function () { setEditMode(false); });

    // 导出菜单
    on('#btn-export', 'click', function (e) {
      e.stopPropagation();
      $('#export-menu').classList.toggle('show');
    });
    document.addEventListener('click', function (e) {
      var m = $('#export-menu');
      if (m && (!e.target.closest || !e.target.closest('.menu-wrap'))) m.classList.remove('show');
    });
    $$('#export-menu .menu-item').forEach(function (b) {
      b.addEventListener('click', function () {
        $('#export-menu').classList.remove('show');
        exportAs(b.dataset.fmt);
      });
    });

    // 编辑器工具栏
    $$('#editor-toolbar .ebtn[data-md]').forEach(function (b) {
      b.addEventListener('click', function () { applyMarkdownAction(b.dataset.md); });
    });
    on('#editor', 'input', onEditorInput);
    on('#editor', 'keydown', onEditorKeydown);

    $('#file-input').addEventListener('change', async function (e) {
      var entries = await ingestFileList(e.target.files, '');
      finishImport(entries);
      e.target.value = '';
    });

    $('#dir-input').addEventListener('change', async function (e) {
      var list = Array.prototype.slice.call(e.target.files);
      var entries = list.map(function (f) {
        return { path: f.webkitRelativePath || f.name, name: f.name, blob: f, size: f.size };
      });
      finishImport(entries);
      e.target.value = '';
    });

    $('#filter').addEventListener('input', renderTree);

    var sInput = $('#search');
    var sTimer = null;
    sInput.addEventListener('input', function () {
      clearTimeout(sTimer);
      var v = sInput.value;
      sTimer = setTimeout(function () { doSearch(v.trim()); }, 180);
    });
    sInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        gotoHit(state.search.idx + (e.shiftKey ? -1 : 1));
      } else if (e.key === 'Escape') {
        sInput.value = '';
        clearSearch();
        sInput.blur();
      }
    });
    $('#search-clear').addEventListener('click', function () {
      sInput.value = ''; clearSearch(); sInput.focus();
    });
    $('#search-prev').addEventListener('click', function () { gotoHit(state.search.idx - 1); });
    $('#search-next').addEventListener('click', function () { gotoHit(state.search.idx + 1); });

    $('#palette-input').addEventListener('input', function () { renderPalette(this.value); });
    $('#palette-input').addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown') { e.preventDefault(); movePaletteSel(1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); movePaletteSel(-1); }
      else if (e.key === 'Enter') {
        e.preventDefault();
        var sel = $('#palette-list .item.sel');
        if (sel) sel.click();
      } else if (e.key === 'Escape') closePalette();
    });
    $('#palette').addEventListener('click', function (e) { if (e.target === this) closePalette(); });

    on('#content-wrap', 'scroll', onScroll, { passive: true });
    on('#content', 'scroll', onScroll, { passive: true });
    on('#totop', 'click', function () {
      var el = scrollEl();
      if (el) el.scrollTo({ top: 0, behavior: 'smooth' });
    });

    // 正文内的交互统一走委托（DOM 会被 innerHTML 重建，元素级监听会失效）
    $('#content').addEventListener('click', function (e) {
      var t = e.target;
      if (!t || !t.closest) return;

      // 代码复制
      var cbtn = t.closest('.copy-btn');
      if (cbtn) {
        var code = cbtn.parentNode && cbtn.parentNode.querySelector('code');
        if (code) {
          copyText(code.textContent).then(function (ok) {
            cbtn.textContent = ok ? '已复制' : '失败';
            cbtn.classList.add('done');
            setTimeout(function () { cbtn.textContent = '复制'; cbtn.classList.remove('done'); }, 1400);
          });
        }
        return;
      }

      // 内部文档链接
      var ia = t.closest('a.internal');
      if (ia) {
        e.preventDefault();
        openFile(ia.dataset.fileId, ia.dataset.anchor || '');
        return;
      }

      // 标题锚点：复制定位链接
      var an = t.closest('a.anchor');
      if (an) {
        e.preventDefault();
        var aid = an.getAttribute('href').slice(1);
        copyText(location.href.split('#')[0] + '#' + aid).then(function () { toast('已复制标题链接'); });
        return;
      }

      // 图片点击放大
      if (t.tagName === 'IMG' && !t.classList.contains('broken')) openLightbox(t.src);
    });

    $('#lightbox').addEventListener('click', function () { this.classList.remove('show'); });

    // 拖放：只在 document 上绑一次（同时绑 window 会让 drop 触发两次）。
    // 遮罩由 dragover 心跳控制，避免子元素间移动引起的 enter/leave 抖动把遮罩卡住。
    function showDropzone(on) { $('#dropzone').classList.toggle('show', !!on); }
    function allowDrop(e) {
      e.preventDefault();
      e.stopPropagation();
      if (e.dataTransfer) { try { e.dataTransfer.dropEffect = 'copy'; } catch (err) { /* ignore */ } }
    }

    document.addEventListener('dragenter', function (e) {
      allowDrop(e);
      showDropzone(true);
    });
    document.addEventListener('dragover', function (e) {
      allowDrop(e);
    });
    document.addEventListener('dragleave', function (e) {
      // 只有真正离开窗口（relatedTarget 为 null 或不在文档内）才收起遮罩，
      // 否则在子元素之间移动时会疯狂闪烁。
      if (e.relatedTarget === null || !document.contains(e.relatedTarget)) {
        showDropzone(false);
      }
    });
    document.addEventListener('drop', async function (e) {
      allowDrop(e);
      showDropzone(false);
      await handleDataTransfer(e.dataTransfer);
    });
    window.addEventListener('blur', function () { showDropzone(false); });

    // 快捷键
    document.addEventListener('keydown', function (e) {
      var mod = e.ctrlKey || e.metaKey;
      var tag = (e.target.tagName || '').toLowerCase();
      var typing = tag === 'input' || tag === 'textarea';

      if (mod && e.key.toLowerCase() === 'k') { e.preventDefault(); openPalette(); return; }
      if (mod && e.key.toLowerCase() === 'o') { e.preventDefault(); pickFiles(); return; }
      if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); saveCurrent(); return; }
      if (mod && e.key.toLowerCase() === 'e') { e.preventDefault(); toggleEditMode(); return; }
      if (mod && e.key.toLowerCase() === 'p') { e.preventDefault(); window.print(); return; }
      if (mod && e.key.toLowerCase() === 'f') { e.preventDefault(); $('#search').focus(); $('#search').select(); return; }
      if (mod && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        if (state.editing) applyMarkdownAction('bold');
        else if (e.shiftKey) toggleOutline();
        else toggleSidebar();
        return;
      }
      if (mod && e.key.toLowerCase() === 'i' && state.editing) {
        e.preventDefault(); applyMarkdownAction('italic'); return;
      }
      if (mod && (e.key === '=' || e.key === '+')) { e.preventDefault(); bumpFont(1); return; }
      if (mod && e.key === '-') { e.preventDefault(); bumpFont(-1); return; }
      if (e.altKey && e.key.toLowerCase() === 'd') { e.preventDefault(); toggleTheme(); return; }
      if (e.altKey && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
        e.preventDefault(); stepFile(e.key === 'ArrowDown' ? 1 : -1); return;
      }
      if (e.key === 'Escape') {
        if ($('#palette').classList.contains('show')) { closePalette(); return; }
        if ($('#lightbox').classList.contains('show')) { $('#lightbox').classList.remove('show'); return; }
      }
      if (!typing && !state.editing && (e.key === 'j' || e.key === 'k')) {
        e.preventDefault(); stepFile(e.key === 'j' ? 1 : -1);
      }
    });

    window.addEventListener('beforeprint', function () { });
    window.addEventListener('resize', function () { onScroll(); });
  }

  /* ---------------- 启动 ---------------- */
  function init() {
    state.prefs = loadPrefs();
    applyPrefs();
    bind();
    renderTree();
    $('#outline-list').innerHTML = '<div class="ol-empty">打开文档后显示大纲</div>';
    onScroll();
    tryAutoOpen();

    // 调试 / 自动化测试入口
    window.MDReader = {
      state: state,
      openFile: openFile,
      addPasted: addPasted,
      render: renderMarkdown,
      _test: {
        addEntries: addEntries,
        renderTree: renderTree,
        renderMarkdown: renderMarkdown,
        renderPalette: renderPalette,
        doSearch: doSearch,
      },
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else init();
})();
