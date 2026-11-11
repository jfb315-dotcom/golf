// The top logo sits clear of the iPhone's status-bar area and doesn't overlap anything on any screen
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs = require('fs');
const stub = fs.readFileSync(__dirname + '/stub.js', 'utf8');
const html = fs.readFileSync(process.argv[2] || __dirname + '/../index.html', 'utf8');
const logo = fs.readFileSync(__dirname + '/../logo.png');
const tag = process.argv[3] || 'now';
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 }); page.setDefaultTimeout(5000);
  page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; }); page.on('dialog', d => d.accept());
  await page.route('**/*', r => { const u = r.request().url();
    if (u.includes('gstatic')) return r.fulfill({ contentType: 'text/javascript', body: u.includes('app-compat') ? stub : '' });
    if (u.endsWith('/logo.png')) return r.fulfill({ contentType: 'image/png', body: logo });
    if (u.startsWith('http://app.test/')) return r.fulfill({ contentType: 'text/html', body: html });
    return r.abort(); });
  await page.addInitScript(() => { window.__docsInit = {}; });
  await page.goto('http://app.test/?beta=0'); await page.waitForTimeout(500);
  await page.evaluate(() => changeTheme('fairway'));
  const check = async (name, fn) => {
    await page.evaluate(fn); await page.waitForTimeout(250);
    const r = await page.evaluate(() => {
      window.scrollTo(0, 0);
      let box = document.querySelector('.app-logo').getBoundingClientRect();
      // the drawing inside logo.png (the rest of the image is see-through), plus a 4px gap all round
      let l = { top: box.top + box.height * 0.221 - 4, bottom: box.top + box.height * 0.75 + 4, left: box.left + box.width * 0.103 - 4, right: box.left + box.width * 0.913 + 4 };
      let pad = l; // overlap test with every visible element in the active screen
      let hits = [...document.querySelectorAll('.screen.active *')].filter(e => {
        if (!e.offsetParent || e.closest('.app-logo')) return false;
        let r = e.getBoundingClientRect(); if (!r.width || !r.height) return false;
        if (!['INPUT', 'BUTTON', 'SELECT', 'IMG', 'svg'].includes(e.tagName)) { let g = document.createRange(); g.selectNodeContents(e); r = g.getBoundingClientRect(); if (!r.width) return false; } // the text itself, not the whole row
        if (e.children.length && [...e.children].some(c => c.getBoundingClientRect().height)) return false; // leaf-ish elements only
        let txt = (e.textContent || '').trim() || e.tagName === 'INPUT' || e.tagName === 'BUTTON';
        return txt && r.left < l.right && r.right > l.left && r.top < l.bottom && r.bottom > l.top;
      }).map(e => (e.id || e.className || e.tagName) + ':' + (e.textContent || '').trim().slice(0, 20));
      return { top: Math.round(l.top + 4), bottom: Math.round(l.bottom - 4), hits };
    });
    console.log(name, JSON.stringify(r));
    ok(r.top >= 20 && r.hits.length === 0, `${name}: the logo drawing starts ${r.top}px down and touches nothing`);
    await page.screenshot({ path: __dirname + `/shots/logo-${name}-${tag}.png`, clip: { x: 0, y: 0, width: 390, height: 220 } });
  };
  await check('home', () => showScreen('step-home'));
  await check('setup', () => startNewRound('tournament'));
  await check('rosters', () => goToStep2());
  await check('players', () => openPlayersScreen());
  await check('money', () => openMoneyScreen());
  await check('help', () => showScreen('step-help'));
  await page.evaluate(() => { startNewRound('om'); goToStep2(); });
  for (const [id, n] of [['g1-p1','John Bischof'],['g1-p2','Brent Copeland'],['g2-p1','Jordia Smith'],['g2-p2','Andy Anderson']]) await page.fill(`#${id}-name`, n);
  await page.evaluate(() => saveRosterCache());
  await page.click('#btn-step2-next'); await page.waitForTimeout(400);
  await check('standings', () => viewDashboard());
  await browser.close();
  console.log(fails ? `${fails} FAILED` : 'ALL PASS'); process.exit(fails ? 1 : 0);
})();
