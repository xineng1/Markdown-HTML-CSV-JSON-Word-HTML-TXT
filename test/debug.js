const path = require('path');
const { chromium } = require(
  'C:/Users/wweiv/.workbuddy/binaries/node/workspace/node_modules/playwright-core'
);
const ROOT = path.resolve(__dirname, '..');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PAGE = 'file:///' + path.join(ROOT, 'index.html').replace(/\\/g, '/');

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('pageerror', (e) => console.log('!! pageerror:', e.message));
  page.on('console', (m) => { if (m.type() === 'error') console.log('!! console:', m.text()); });

  await page.goto(PAGE);
  await page.waitForTimeout(300);
  await page.setInputFiles('#file-input', [
    path.join(ROOT, 'test/fixtures/demo.md'),
    path.join(ROOT, 'test/fixtures/sub/other.md'),
  ]);
  await page.waitForTimeout(500);
  console.log('files:', await page.evaluate(() => window.MDReader.state.files.map(f => f.path)));

  await page.fill('#search', '富营养化');
  await page.waitForTimeout(400);
  console.log('marks after search:', await page.locator('#content mark').count());

  await page.fill('#search', '');
  await page.waitForTimeout(500);
  console.log('marks after clear:', await page.locator('#content mark').count());
  console.log('raw len:', await page.evaluate(() => (window.MDReader.state.search.raw || '').length));
  console.log('content len:', await page.evaluate(() => document.getElementById('content').innerHTML.length));
  console.log('equal:', await page.evaluate(() =>
    window.MDReader.state.search.raw === document.getElementById('content').innerHTML));

  const internal = page.locator('#content a.internal').first();
  console.log('internal href:', await internal.getAttribute('href'));
  await internal.click();
  await page.waitForTimeout(800);
  console.log('content children:', await page.evaluate(() => document.getElementById('content').children.length));
  console.log('currentId:', await page.evaluate(() => window.MDReader.state.currentId));
  console.log('h1 text:', await page.evaluate(() => {
    const h = document.querySelector('#content h1');
    return h ? h.textContent : 'NONE';
  }));
  await browser.close();
})();
