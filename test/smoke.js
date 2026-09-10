// 冒烟测试：用真实 Chrome 打开 index.html，验证核心功能
// 运行：node test/smoke.js
const path = require('path');
const fs = require('fs');
const { chromium } = require(
  'C:/Users/wweiv/.workbuddy/binaries/node/workspace/node_modules/playwright-core'
);

const ROOT = path.resolve(__dirname, '..');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PAGE = 'file:///' + path.join(ROOT, 'index.html').replace(/\\/g, '/');

let pass = 0, fail = 0;
const errors = [];

function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '  → ' + extra : '')); }
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  // 用例里故意引用了不存在的图片，其资源 404 属预期行为，不计入错误
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const t = m.text();
    if (/Failed to load resource/i.test(t)) return;
    errors.push('console: ' + t);
  });

  await page.goto(PAGE);
  await page.waitForTimeout(400);

  console.log('\n[1] 页面初始化');
  ok('无 JS 报错', errors.length === 0, errors.join(' | '));
  ok('空状态可见', await page.locator('#empty').isVisible());
  ok('三栏 DOM 就绪',
    (await page.locator('#sidebar').count()) === 1 &&
    (await page.locator('#outline').count()) === 1);

  console.log('\n[2] 导入文档');
  await page.setInputFiles('#file-input', [
    path.join(ROOT, 'test/fixtures/demo.md'),
    path.join(ROOT, 'test/fixtures/sub/other.md'),
  ]);
  await page.waitForTimeout(500);
  ok('文件树出现 2 个文件', (await page.locator('#filetree .tree-item').count()) === 2,
    '实际 ' + (await page.locator('#filetree .tree-item').count()));
  ok('空状态隐藏', !(await page.locator('#empty').isVisible()));
  ok('标题渲染正确',
    (await page.locator('#content .md h1').first().innerText()).includes('MD Reader 功能演示'));

  console.log('\n[3] Markdown 语法');
  ok('代码高亮生效', (await page.locator('#content pre code.hljs .hljs-keyword').count()) > 0);
  ok('语言标签存在', (await page.locator('#content pre .lang-tag').count()) >= 3);
  ok('表格已包裹', (await page.locator('#content .table-wrap table').count()) === 1);
  ok('任务列表渲染', (await page.locator('#content li.task input[type=checkbox]').count()) === 4);
  ok('引用块存在', (await page.locator('#content blockquote').count()) >= 1);
  ok('标题锚点存在', (await page.locator('#content h2 .anchor').count()) > 0);

  console.log('\n[4] 大纲与状态栏');
  const olCount = await page.locator('#outline-list .ol-item').count();
  ok('大纲条目 >= 8', olCount >= 8, '实际 ' + olCount);
  const chars = await page.locator('#stat-chars').innerText();
  ok('字数统计非空', chars !== '—' && chars.length > 0, chars);
  ok('状态栏显示路径', (await page.locator('#stat-path').innerText()).includes('.md'));

  console.log('\n[5] 正文搜索');
  const baseMarks = await page.locator('#content mark').count(); // 文档本身可能含 <mark>
  await page.fill('#search', '富营养化');
  await page.waitForTimeout(400);
  const marks = await page.locator('#content mark').count();
  ok('命中并高亮', marks > baseMarks, `marks=${marks} base=${baseMarks}`);
  ok('计数显示', (await page.locator('#search-count').innerText()).includes('/'));
  await page.fill('#search', '');
  await page.waitForTimeout(400);
  const afterMarks = await page.locator('#content mark').count();
  ok('清除搜索后回到基线', afterMarks === baseMarks, `after=${afterMarks} base=${baseMarks}`);

  console.log('\n[6] 文档内链接跳转');
  const internal = page.locator('#content a.internal').first();
  ok('内部链接被识别', (await internal.count()) === 1);
  await internal.click();
  await page.waitForTimeout(400);
  const t2 = await page.locator('#content .md h1').first().innerText();
  ok('跳转到另一篇文档', t2.includes('另一篇文档'), t2);

  console.log('\n[7] 本地图片解析（模拟拖入整个文件夹）');
  const svgText = fs.readFileSync(path.join(ROOT, 'test/fixtures/assets/cover.svg'), 'utf8');
  await page.evaluate((svg) => {
    const f = new File([svg], 'cover.svg', { type: 'image/svg+xml' });
    window.MDReader._test.addEntries([
      { path: 'assets/cover.svg', name: 'cover.svg', blob: f, size: svg.length },
    ]);
  }, svgText);
  await page.evaluate(() => window.MDReader.openFile(window.MDReader.state.files[0].id));
  await page.waitForTimeout(500);
  const imgSrc = await page.locator('#content img').first().getAttribute('src');
  ok('相对路径图片解析为 blob', /^blob:/.test(imgSrc || ''), String(imgSrc).slice(0, 40));
  ok('缺失图片被标记', (await page.locator('#content img.broken').count()) === 1);

  console.log('\n[8] 主题与布局');
  await page.click('#btn-theme');
  await page.waitForTimeout(200);
  ok('切换到深色', (await page.getAttribute('html', 'data-theme')) === 'dark');
  await page.click('#btn-sidebar');
  await page.waitForTimeout(250);
  ok('侧栏可折叠', await page.locator('#app').evaluate((el) => el.classList.contains('sidebar-hidden')));
  await page.click('#btn-sidebar');
  await page.click('#btn-outline');
  await page.waitForTimeout(250);
  ok('大纲可折叠', await page.locator('#app').evaluate((el) => el.classList.contains('outline-hidden')));
  await page.click('#btn-outline');
  await page.click('#btn-theme');
  await page.waitForTimeout(150);

  console.log('\n[9] 命令面板');
  await page.keyboard.press('Control+k');
  await page.waitForTimeout(250);
  ok('面板打开', await page.locator('#palette').isVisible());
  await page.fill('#palette-input', 'other');
  await page.waitForTimeout(250);
  const items = await page.locator('#palette-list .item').count();
  ok('模糊搜索有结果', items > 0, 'items=' + items);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(400);
  ok('回车打开文档', !(await page.locator('#palette').isVisible()));

  console.log('\n[10] 剪贴板 / 偏好持久化');
  const lsOk = await page.evaluate(() => {
    try { localStorage.setItem('__t', '1'); localStorage.removeItem('__t'); return true; }
    catch (e) { return false; }
  });
  ok('localStorage 可用（偏好可持久化）', lsOk);
  ok('运行期无 JS 报错', errors.length === 0, errors.join(' | '));

  console.log('\n[11] 交互细节（复制 / 图片 / 导出）');
  await page.evaluate(() => window.MDReader.openFile(window.MDReader.state.files[0].id));
  await page.waitForTimeout(500);
  const cbtn = page.locator('#content pre .copy-btn').first();
  await cbtn.click({ force: true });
  await page.waitForTimeout(300);
  const cbtnText = await cbtn.innerText();
  ok('代码复制有反馈', ['已复制', '失败'].includes(cbtnText), cbtnText);

  await page.locator('#content img').first().click();
  await page.waitForTimeout(300);
  ok('图片可放大查看', await page.locator('#lightbox').isVisible());
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  ok('Esc 关闭大图', !(await page.locator('#lightbox').isVisible()));

  console.log('\n[12] 导出 HTML / Word / TXT');
  const outDir = path.join(ROOT, 'test/results');
  fs.mkdirSync(outDir, { recursive: true });

  await page.click('#btn-export');
  await page.waitForTimeout(200);
  ok('导出菜单可打开', await page.locator('#export-menu').isVisible());

  const [dl] = await Promise.all([
    page.waitForEvent('download', { timeout: 15000 }),
    page.click('#export-menu .menu-item[data-fmt="html"]'),
  ]);
  ok('导出 HTML 文件名正确', /\.html$/.test(dl.suggestedFilename()), dl.suggestedFilename());
  const htmlPath = path.join(outDir, 'export-check.html');
  await dl.saveAs(htmlPath);
  const dlHtml = fs.readFileSync(htmlPath, 'utf8');
  ok('HTML 含正文', dlHtml.includes('MD Reader 功能演示'));
  ok('HTML 图片已内联为 data URL', /src="data:image/.test(dlHtml));
  ok('HTML 无残留 blob 引用', !/src="blob:/.test(dlHtml));

  const [dlDocx] = await Promise.all([
    page.waitForEvent('download', { timeout: 20000 }),
    (async () => { await page.click('#btn-export'); await page.waitForTimeout(150); await page.click('#export-menu .menu-item[data-fmt="docx"]'); })(),
  ]);
  ok('导出 Word 文件名正确', /\.docx$/.test(dlDocx.suggestedFilename()), dlDocx.suggestedFilename());
  const docxPath = path.join(outDir, 'export-check.docx');
  await dlDocx.saveAs(docxPath);
  const docxBuf = fs.readFileSync(docxPath);
  ok('docx 是合法 zip（PK 头）', docxBuf[0] === 0x50 && docxBuf[1] === 0x4b, 'sig=' + docxBuf.slice(0, 2).toString('hex'));
  const docxText = docxBuf.toString('latin1');
  ok('docx 含 document.xml', docxText.includes('word/document.xml'));
  ok('docx 含 styles.xml', docxText.includes('word/styles.xml'));
  ok('docx 含图片条目', docxText.includes('word/media/image1'));
  ok('docx 末尾有 EOCD', docxText.slice(-22).includes('PK\u0005\u0006'));
  ok('docx 体积合理', docxBuf.length > 8000, docxBuf.length + ' bytes');

  const [dlTxt] = await Promise.all([
    page.waitForEvent('download', { timeout: 15000 }),
    (async () => { await page.click('#btn-export'); await page.waitForTimeout(150); await page.click('#export-menu .menu-item[data-fmt="txt"]'); })(),
  ]);
  ok('导出 TXT 文件名正确', /\.txt$/.test(dlTxt.suggestedFilename()), dlTxt.suggestedFilename());
  const txtPath = path.join(outDir, 'export-check.txt');
  await dlTxt.saveAs(txtPath);
  const txt = fs.readFileSync(txtPath, 'utf8');
  ok('TXT 含正文', txt.includes('MD Reader 功能演示'));
  ok('TXT 已去掉 markdown 标记', !/^#{1,6}\s/m.test(txt.split('\n').slice(0, 12).join('\n')));
  ok('TXT 保留列表符号', /^[-*]\s|^\d+\.\s/m.test(txt));

  console.log('\n[13] 编辑模式');
  await page.evaluate(() => window.MDReader.openFile(window.MDReader.state.files[0].id));
  await page.waitForTimeout(300);
  await page.click('#btn-edit');
  await page.waitForTimeout(400);
  ok('编辑面板可见', await page.locator('#editor-pane').isVisible());
  ok('编辑器载入了原文', (await page.inputValue('#editor')).includes('MD Reader 功能演示'));

  // 工具栏：加粗
  await page.fill('#editor', 'hello world');
  await page.evaluate(() => {
    const ta = document.getElementById('editor');
    ta.focus(); ta.setSelectionRange(0, 5);
  });
  await page.click('#editor-toolbar .ebtn[data-md="bold"]');
  await page.waitForTimeout(400);
  ok('工具栏加粗生效', (await page.inputValue('#editor')).indexOf('**hello**') === 0,
    (await page.inputValue('#editor')).slice(0, 24));

  // 实时预览
  await page.fill('#editor', '# 编辑测试标题\n\n正文段落');
  await page.waitForTimeout(600);
  ok('实时预览已更新',
    (await page.locator('#content h1').first().innerText()).includes('编辑测试标题'));
  ok('脏标记出现', await page.locator('#statusbar').evaluate((el) => el.classList.contains('dirty')));

  // 保存 -> 触发下载
  const [dlSave] = await Promise.all([
    page.waitForEvent('download', { timeout: 15000 }),
    page.click('#editor-save'),
  ]);
  ok('保存触发另存下载', /\.md$/.test(dlSave.suggestedFilename()), dlSave.suggestedFilename());
  await page.waitForTimeout(300);
  ok('保存后脏标记消失', !(await page.locator('#statusbar').evaluate((el) => el.classList.contains('dirty'))));

  await page.click('#editor-close');
  await page.waitForTimeout(300);
  ok('可退出编辑模式', !(await page.locator('#editor-pane').isVisible()));

  console.log('\n[14] 多格式支持');
  const multiDir = path.join(ROOT, 'test/fixtures/multi');
  fs.mkdirSync(multiDir, { recursive: true });
  fs.writeFileSync(path.join(multiDir, 'data.csv'), 'name,value\nalpha,1\nbeta,2\n', 'utf8');
  fs.writeFileSync(path.join(multiDir, 'conf.json'), '{"a":1,"b":[1,2,3]}', 'utf8');
  fs.writeFileSync(path.join(multiDir, 'script.py'), 'def f(x):\n    return x + 1\n', 'utf8');
  fs.writeFileSync(path.join(multiDir, 'page.html'), '<h1>HTML 标题</h1><p>段落</p>', 'utf8');
  fs.writeFileSync(path.join(multiDir, 'notes.txt'), '纯文本内容\n第二行\n', 'utf8');
  await page.setInputFiles('#file-input', [
    path.join(multiDir, 'data.csv'), path.join(multiDir, 'conf.json'),
    path.join(multiDir, 'script.py'), path.join(multiDir, 'page.html'),
    path.join(multiDir, 'notes.txt'),
  ]);
  await page.waitForTimeout(800);
  ok('非 md 文件也进入列表', (await page.locator('#filetree .tree-item').count()) >= 5);

  const openByName = async (name) => {
    await page.evaluate((n) => {
      const f = window.MDReader.state.files.find((x) => x.name === n);
      if (f) window.MDReader.openFile(f.id);
    }, name);
    await page.waitForTimeout(400);
  };

  await openByName('data.csv');
  ok('CSV 渲染成表格', (await page.locator('#content table').count()) === 1 &&
    (await page.locator('#content th').first().innerText()).includes('name'));
  ok('状态栏显示格式', (await page.locator('#stat-kind').innerText()).includes('表格'));

  await openByName('conf.json');
  ok('JSON 被格式化', (await page.locator('#content pre code').innerText()).includes('"a": 1'));

  await openByName('script.py');
  ok('代码文件高亮', (await page.locator('#content pre code.hljs .hljs-keyword').count()) > 0);

  await openByName('page.html');
  ok('HTML 直接渲染', (await page.locator('#content h1').first().innerText()).includes('HTML 标题'));

  await openByName('notes.txt');
  ok('纯文本原样显示', (await page.locator('#content pre.plain').count()) === 1);

  console.log('\n[15] 拖拽导入（含导致旧版本静默失败的场景）');
  const pd = await ctx.newPage();
  const pdErrs = [];
  pd.on('pageerror', (e) => pdErrs.push(e.message));
  await pd.goto(PAGE);
  await pd.waitForTimeout(400);

  // A. 普通拖入单个 md
  await pd.evaluate(() => {
    const dt = new DataTransfer();
    dt.items.add(new File(['# 拖入的文档 A'], 'drag-a.md', { type: 'text/markdown' }));
    document.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
  });
  await pd.waitForTimeout(600);
  ok('拖入单个 md 成功', (await pd.locator('#filetree .tree-item').count()) === 1);
  ok('拖入后自动打开', (await pd.locator('#content h1').first().innerText()).includes('拖入的文档 A'));

  // B. items[0] 是字符串条目（旧版只看 items[0] 会整条失败）
  await pd.evaluate(() => {
    const dt = new DataTransfer();
    dt.setData('text/plain', '一些文本');
    dt.items.add(new File(['# 字符串在前'], 'drag-b.md', { type: 'text/markdown' }));
    document.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
  });
  await pd.waitForTimeout(600);
  const nB = await pd.locator('#filetree .tree-item').count();
  ok('items 混有字符串条目时仍能导入', nB === 2, '文件数=' + nB);

  // C. 拖入非 md 的文本格式（现在应该支持）
  await pd.evaluate(() => {
    const dt = new DataTransfer();
    dt.items.add(new File(['key=value\n'], 'drag-c.ini', { type: 'text/plain' }));
    document.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
  });
  await pd.waitForTimeout(600);
  ok('拖入 .ini 也能导入', (await pd.locator('#filetree .tree-item').count()) === 3);

  // D. 拖入文件夹（递归）
  await pd.evaluate(() => {
    const mkFile = (name, text) => ({ name, isFile: true, isDirectory: false, file(cb) { cb(new File([text], name, { type: 'text/markdown' })); } });
    const mkDir = (name, kids) => ({ name, isFile: false, isDirectory: true, createReader() { let done = false; return { readEntries(cb) { if (done) return cb([]); done = true; cb(kids); } }; } });
    window.__entry = mkDir('notes', [mkFile('m1.md', '# 夹内文档'), mkDir('sub', [mkFile('m2.md', '# 子目录文档')])]);
    const orig = DataTransferItem.prototype.webkitGetAsEntry;
    DataTransferItem.prototype.webkitGetAsEntry = function () { return window.__entry; };
    const dt = new DataTransfer();
    dt.items.add(new File(['x'], 'dummy.md', { type: 'text/markdown' }));
    document.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
    DataTransferItem.prototype.webkitGetAsEntry = orig;
  });
  await pd.waitForTimeout(1200);
  const paths = await pd.evaluate(() => window.MDReader.state.files.map((f) => f.path));
  ok('拖入文件夹被递归展开', paths.includes('m1.md') && paths.includes('sub/m2.md'), paths.join(','));

  // E. 拖入二进制 -> 跳过并给出提示
  await pd.evaluate(() => {
    const dt = new DataTransfer();
    dt.items.add(new File([new Uint8Array([1, 2, 3])], 'archive.zip', { type: 'application/zip' }));
    document.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
  });
  await pd.waitForTimeout(600);
  const toastMsg = await pd.locator('#toast').innerText();
  ok('二进制文件被跳过并提示', /跳过/.test(toastMsg), toastMsg);

  // F. 拖拽遮罩
  await pd.evaluate(() => document.dispatchEvent(new DragEvent('dragenter', { bubbles: true, cancelable: true })));
  await pd.waitForTimeout(200);
  ok('拖入时显示遮罩', await pd.locator('#dropzone').evaluate((el) => el.classList.contains('show')));
  await pd.evaluate(() => document.dispatchEvent(new DragEvent('dragleave', { bubbles: true, cancelable: true })));
  await pd.waitForTimeout(300);
  ok('离开窗口后遮罩收起', !(await pd.locator('#dropzone').evaluate((el) => el.classList.contains('show'))));
  ok('拖拽过程无 JS 报错', pdErrs.length === 0, pdErrs.join(' | '));

  console.log('\n[16] 双击 .md 打开（open-md.bat 场景模拟）');
  const argFile = path.join(ROOT, '_last_open.txt');
  fs.writeFileSync(argFile, path.join(ROOT, 'test/fixtures/demo.md'), 'utf8');
  const b2 = await chromium.launch({
    executablePath: CHROME,
    headless: true,
    args: ['--allow-file-access-from-files'],
  });
  const p2 = await b2.newPage({ viewport: { width: 1280, height: 800 } });
  const p2errs = [];
  p2.on('pageerror', (e) => p2errs.push(e.message));
  await p2.goto(PAGE + '?autofile=1');
  await p2.waitForTimeout(1200);
  const autoH1 = await p2.locator('#content h1').count();
  ok('自动加载 _last_open.txt 指向的文档', autoH1 > 0);
  if (autoH1) {
    ok('内容正确', (await p2.locator('#content h1').first().innerText()).includes('MD Reader 功能演示'));
    ok('文件进入侧栏', (await p2.locator('#filetree .tree-item').count()) === 1);
  }
  ok('无 JS 报错', p2errs.length === 0, p2errs.join(' | '));

  // 中文 + 空格路径（Windows 用户最常见的情况）
  const cnPath = path.join(ROOT, 'test/fixtures/中文 文档 测试.md');
  fs.writeFileSync(cnPath, '# 中文路径测试\n\n带空格和中文的文件名应该能正常打开。\n', 'utf8');
  fs.writeFileSync(argFile, cnPath, 'utf8');
  const p3 = await b2.newPage();
  await p3.goto(PAGE + '?autofile=1');
  await p3.waitForTimeout(1200);
  const cnH1 = await p3.locator('#content h1').count();
  ok('中文 / 空格路径可打开', cnH1 > 0 &&
    (await p3.locator('#content h1').first().innerText()).includes('中文路径测试'));
  try { fs.unlinkSync(cnPath); } catch (e) { /* ignore */ }

  await b2.close();
  try { fs.unlinkSync(argFile); } catch (e) { /* ignore */ }

  await browser.close();
  console.log(`\n结果：${pass} 通过 / ${fail} 失败\n`);
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error('测试异常：', e);
  process.exit(1);
});
