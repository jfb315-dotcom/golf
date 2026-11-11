// Watch-only links save to the Home Screen as "JB Watch" with the WATCH logo; the organizer and cart links stay "JB Golf"
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs = require('fs');
const stub = fs.readFileSync(__dirname + '/stub.js', 'utf8');
const html = fs.readFileSync(__dirname + '/../index.html', 'utf8');
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const look = async q => { const p = await browser.newPage(); p.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
    await p.route('**/*', r => { const u = r.request().url();
      if (u.includes('gstatic')) return r.fulfill({ contentType: 'text/javascript', body: u.includes('app-compat') ? stub : '' });
      if (u.startsWith('http://app.test/')) return r.fulfill({ contentType: 'text/html', body: html });
      return r.abort(); });
    await p.addInitScript(() => { window.__docsInit = {}; });
    await p.goto('http://app.test/' + q); await p.waitForTimeout(300);
    const r = await p.evaluate(() => ({ icon: document.querySelector('link[rel="apple-touch-icon"]').getAttribute('href'), name: document.querySelector('meta[name="apple-mobile-web-app-title"]').content, manifest: document.querySelector('link[rel="manifest"]').getAttribute('href') }));
    await p.close(); return r; };
  for (const [q, watch] of [['?spectator=true&me=andy%20anderson', true], ['?spectator=true', true], ['?round=123&me=andy%20anderson', true], ['', false], ['?cart=1&r=5', false]]) {
    const r = await look(q);
    ok(watch ? r.icon === 'logo-watch.png' && r.name === 'JB Watch' && r.manifest === 'manifest-watch.json' : r.icon === 'logo.png' && r.name === 'JB Golf' && r.manifest === 'manifest.json', `${q || '(organizer)'} → ${r.name}, ${r.icon}, ${r.manifest}`);
  }
  ok(fs.existsSync(__dirname + '/../logo-watch.png') && JSON.parse(fs.readFileSync(__dirname + '/../manifest-watch.json', 'utf8')).short_name === 'JB Watch', 'icon file and manifest exist');
  await browser.close();
  console.log(fails ? `${fails} FAILED` : 'ALL PASS'); process.exit(fails ? 1 : 0);
})();
