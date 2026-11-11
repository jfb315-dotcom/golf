// Tapping a hole in "All holes / scores" opens it at the top and nothing slides
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs = require('fs');
const stub = fs.readFileSync(__dirname + '/stub.js', 'utf8');
const html = fs.readFileSync(process.argv[2] || __dirname + '/../index.html', 'utf8');
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  for (const beta of [false, true]) for (const vp of [{ width: 375, height: 812 }, { width: 375, height: 667 }]) {
    const page = await browser.newPage({ viewport: vp, hasTouch: true }); page.setDefaultTimeout(6000);
    page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; }); page.on('dialog', d => d.accept());
    await page.route('**/*', r => { const u = r.request().url();
      if (u.includes('gstatic')) return r.fulfill({ contentType: 'text/javascript', body: u.includes('app-compat') ? stub : '' });
      if (u.startsWith('http://app.test/')) return r.fulfill({ contentType: 'text/html', body: html });
      return r.abort(); });
    await page.addInitScript(() => { window.__docsInit = {}; });
    await page.goto('http://app.test/?beta=' + (beta ? 1 : 0)); await page.waitForTimeout(400);
    const tag = `${beta ? 'test copy' : 'real app'} ${vp.width}x${vp.height}`;
    await page.evaluate(() => { showScreen('step-1'); document.getElementById('group-count').value = 2; document.getElementById('players-per-group').value = 4; });
    if (beta) { await page.click('text=Next: games & money'); await page.click('text=Next: players & teams'); } else await page.click('#step-1 .bar-primary[onclick="goToStep2()"]');
    const names = ['John Bischof','Brent Copeland','Chad Copeland','Bart Hamilton','Ed Eads','Fy Fox','Gus Gray','Hal Hart'];
    for (let i = 0; i < 8; i++) await page.fill(`#g${Math.floor(i / 4) + 1}-p${i % 4 + 1}-name`, names[i]);
    await page.evaluate(() => saveRosterCache());
    if (beta) await page.click('text=Next: extras & review');
    await page.click('#btn-step2-next'); await page.waitForTimeout(400);
    await page.click('#pill-nav-container :text("CART 1")'); await page.waitForTimeout(300);
    await page.evaluate(() => { let pars = roundData.course.pars; for (let h = 1; h <= 4; h++) roundData.groups[0].players.forEach(p => { scoresDb[1][p.id] = scoresDb[1][p.id] || {}; scoresDb[1][p.id][h] = pars[h - 1]; }); showCartHoleList(); });
    await page.waitForTimeout(400);
    console.log(tag, 'list scrolled to', await page.evaluate(() => Math.round(scrollY)));
    const rowSel = await page.evaluate(() => { let r = [...document.querySelectorAll('.hole-list-row')][9]; r.id = r.id || 'hl5'; return '#' + r.id; });
    await page.tap(rowSel);
    let ys = [];
    for (let i = 0; i < 12; i++) { ys.push(await page.evaluate(() => Math.round(scrollY))); await page.waitForTimeout(80); }
    console.log(tag, 'scrollY after tapping hole 10:', ys.join(','));
    ok(ys.every(y => y === 0), tag + ': hole opens at the top and stays');
    await page.close();
  }
  await browser.close();
  console.log(fails ? `${fails} FAILED` : 'ALL PASS'); process.exit(fails ? 1 : 0);
})();
