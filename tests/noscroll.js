// Scoring a hole must not move the page (the keypad stays put under your thumb)
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs = require('fs');
const stub = fs.readFileSync(__dirname + '/stub.js', 'utf8');
const html = fs.readFileSync(__dirname + '/../index.html', 'utf8');
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  for (const beta of [false, true]) for (const vp of [{ width: 375, height: 812 }, { width: 375, height: 667 }, { width: 430, height: 932 }]) {
    const page = await browser.newPage({ viewport: vp }); page.setDefaultTimeout(6000);
    page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; }); page.on('dialog', d => d.accept());
    await page.route('**/*', r => { const u = r.request().url();
      if (u.includes('gstatic')) return r.fulfill({ contentType: 'text/javascript', body: u.includes('app-compat') ? stub : '' });
      if (u.startsWith('http://app.test/')) return r.fulfill({ contentType: 'text/html', body: html });
      return r.abort(); });
    await page.addInitScript(() => { window.__docsInit = {}; });
    await page.goto('http://app.test/?beta=' + (beta ? 1 : 0)); await page.waitForTimeout(400);
    const tag = `${beta ? 'test copy' : 'real app'} ${vp.width}x${vp.height}`;
    await page.evaluate(() => { changeTheme('fairway'); showScreen('step-1'); document.getElementById('group-count').value = 2; document.getElementById('players-per-group').value = 4; });
    if (beta) { await page.click('text=Next: games & money'); await page.click('text=Next: players & teams'); } else await page.click('#step-1 .bar-primary[onclick="goToStep2()"]');
    const names = ['John Bischof','Brent Copeland','Chad Copeland','Bart Hamilton','Ed Eads','Fy Fox','Gus Gray','Hal Hart'];
    for (let i = 0; i < 8; i++) await page.fill(`#g${Math.floor(i / 4) + 1}-p${i % 4 + 1}-name`, names[i]);
    await page.evaluate(() => saveRosterCache());
    if (beta) await page.click('text=Next: extras & review');
    await page.click('#btn-step2-next'); await page.waitForTimeout(400);
    await page.click('#pill-nav-container :text("CART 1")'); await page.waitForTimeout(300);
    await page.evaluate(() => openHoleForScoring(1)); await page.waitForTimeout(300);
    let ys = [], keyTops = [];
    const snap = async () => { await page.waitForTimeout(700); ys.push(await page.evaluate(() => Math.round(scrollY))); keyTops.push(await page.evaluate(() => Math.round(document.querySelector('.score-keypad').getBoundingClientRect().top))); };
    await snap();
    for (let hole = 0; hole < 2; hole++) {
      for (let i = 0; i < 4; i++) { await page.click('.score-keypad button:text-is("4")'); await snap(); }
      await page.waitForTimeout(2200); await snap();
    }
    if (!beta && vp.height === 812) { await page.click('.score-keypad button:text-is("5")'); await page.waitForTimeout(300); await page.screenshot({ path: __dirname + '/shots/undo-row.png' }); ok(await page.isVisible('#key-undo') && !(await page.isVisible('#undo-score')), 'real app: undo is the ↶ between the hole buttons, no text line'); }
    console.log(tag, 'scroll:', ys.join(','), ' keypad top:', keyTops.join(','));
    ok(new Set(keyTops).size === 1, tag + ': keypad never moves while scoring two holes');
    await page.close();
  }
  await browser.close();
  console.log(fails ? `${fails} FAILED` : 'ALL PASS'); process.exit(fails ? 1 : 0);
})();
