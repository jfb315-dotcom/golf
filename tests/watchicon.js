// Home Screen icons: follow-along links save as "JB Live" (LIVE icon), cart links as "JB Golf" (SCORE icon), the organizer keeps the plain logo
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
  for (const [q, kind] of [['?spectator=true&me=andy%20anderson', 'live'], ['?spectator=true', 'live'], ['?round=123&me=andy%20anderson', 'live'], ['', ''], ['?cart=1&r=5', 'score'], ['?cart=1&r=5&me=andy%20anderson', 'score']]) {
    const r = await look(q);
    const want = kind === 'live' ? ['logo-live.png', 'JB Live', 'manifest-live.json'] : kind === 'score' ? ['logo-score.png', 'JB Golf', 'manifest-score.json'] : ['logo.png', 'JB Golf', 'manifest.json'];
    ok(r.icon === want[0] && r.name === want[1] && r.manifest === want[2], `${q || '(organizer)'} → ${r.name}, ${r.icon}, ${r.manifest}`);
  }
  for (const f of ['logo-live.png', 'logo-live-192.png', 'manifest-live.json', 'logo-score.png', 'logo-score-192.png', 'manifest-score.json']) ok(fs.existsSync(__dirname + '/../' + f) && fs.readFileSync(__dirname + '/../sw.js', 'utf8').includes('./' + f), f + ' exists and is in the offline list');
  ok(JSON.parse(fs.readFileSync(__dirname + '/../manifest-live.json', 'utf8')).short_name === 'JB Live' && JSON.parse(fs.readFileSync(__dirname + '/../manifest-score.json', 'utf8')).short_name === 'JB Golf', 'icon names: JB Live and JB Golf');
  await browser.close();
  console.log(fails ? `${fails} FAILED` : 'ALL PASS'); process.exit(fails ? 1 : 0);
})();
