// Does a cart's hole entry (4 players + keypad) fit on one screen? Old look vs test copy, on common iPhone sizes.
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs = require('fs');
const stub = fs.readFileSync(__dirname + '/stub.js', 'utf8');
const html = fs.readFileSync(__dirname + '/../index.html', 'utf8');
const shotTag = process.argv[2] || 'now';
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const mk = async (docs, vp) => { const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 2 }); const p = await ctx.newPage(); p.setDefaultTimeout(6000);
    p.on('dialog', d => d.accept()); p.on('pageerror', e => console.log('ERR', e.message));
    await p.route('**/*', r => { const u = r.request().url();
      if (u.includes('gstatic')) return r.fulfill({ contentType: 'text/javascript', body: u.includes('app-compat') ? stub : '' });
      if (u.startsWith('http://app.test/')) return r.fulfill({ contentType: 'text/html', body: html });
      return r.abort(); });
    await p.addInitScript(d => { window.__docsInit = d; }, docs); return p; };
  // build a round (2 teams of 4, ride with team) in each mode
  for (const beta of [false, true]) {
    const a = await mk({}, { width: 390, height: 844 });
    await a.goto('http://app.test/' + (beta ? '?beta=1' : '')); await a.waitForTimeout(400);
    await a.evaluate(() => { showScreen('step-1'); document.getElementById('group-count').value = 2; document.getElementById('players-per-group').value = 4; });
    if (beta) { await a.click('text=Next: games & money'); await a.click('text=Next: players & teams'); } else await a.click('#step-1 .bar-primary[onclick="goToStep2()"]');
    const names = ['Al Adams','Bo Brown','Cy Cole','Di Dunn','Ed Eads','Fy Fox','Gus Gray','Hal Hart'];
    for (let i = 0; i < 8; i++) await a.fill(`#g${Math.floor(i / 4) + 1}-p${i % 4 + 1}-name`, names[i]);
    await a.evaluate(() => saveRosterCache());
    if (beta) await a.click('text=Next: extras & review'); await a.click('#btn-step2-next'); await a.waitForTimeout(400);
    const docs = await a.evaluate(() => window.__docs);
    const key = beta ? 'beta_active_round' : 'active_round';
    const rid = docs[key].roundData.roundId;
    for (const vp of [{ width: 390, height: 664 }, { width: 375, height: 553 }, { width: 430, height: 739 }]) {
      const c = await mk(docs, vp);
      await c.goto(`http://app.test/?cart=1&r=${rid}${beta ? '&beta=1' : ''}`); await c.waitForTimeout(1300);
      await c.evaluate(() => openHoleForScoring(roundData.currentHole || 1)); await c.waitForTimeout(250);
      const m = await c.evaluate(() => {
        let kp = document.querySelector('.score-keypad').getBoundingClientRect();
        let bar = document.getElementById('rv-bar'); let barTop = bar && getComputedStyle(bar).display !== 'none' ? bar.getBoundingClientRect().top : innerHeight;
        return { keypadBottom: Math.round(kp.bottom + scrollY), visible: Math.round(barTop), scrollH: document.documentElement.scrollHeight, h: innerHeight };
      });
      const over = Math.max(0, m.keypadBottom - m.visible);
      console.log(`${beta ? 'TEST COPY' : 'old look '} ${vp.width}x${vp.height}: keypad ends at ${m.keypadBottom}px, room until ${m.visible}px -> ${over ? 'SCROLL ' + over + 'px' : 'fits'}`);
      if (vp.height === 664) await c.screenshot({ path: __dirname + `/shots/fit-${beta ? 'beta' : 'old'}-${shotTag}.png` });
      await c.context().close();
    }
    await a.context().close();
  }
  await browser.close();
})();
