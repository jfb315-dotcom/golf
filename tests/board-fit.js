const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs = require('fs');
const stub = fs.readFileSync(__dirname + '/stub.js', 'utf8');
const html = fs.readFileSync(__dirname + '/../index.html', 'utf8');
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  for (const width of [375, 390, 430]) {
    const page = await browser.newPage({ viewport: { width, height: 844 }, deviceScaleFactor: 2 });
    page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
    page.on('dialog', d => d.accept());
    await page.route('**/*', r => { const u = r.request().url();
      if (u.includes('gstatic')) return r.fulfill({ contentType: 'text/javascript', body: u.includes('app-compat') ? stub : '' });
      if (u.startsWith('http://app.test/')) return r.fulfill({ contentType: 'text/html', body: html });
      return r.abort(); });
    await page.goto('http://app.test/'); await page.waitForTimeout(500);
    await page.evaluate(() => { showScreen('step-1'); document.getElementById('group-count').value = 3; document.getElementById('players-per-group').value = 4; document.getElementById('fmt-1').checked = true; document.getElementById('fmt-2').checked = true; document.getElementById('fmt-3').checked = true; });
    await page.click('#step-1 .bar-primary[onclick="goToStep2()"]');
    const names = ['Brent','Eddie','Andy','Chad','John','Joe','Paul','Mike','Jordia','Bart','Jeff','Billy'];
    for (let i = 0; i < 12; i++) await page.fill(`#g${1 + Math.floor(i / 4)}-p${1 + i % 4}-name`, names[i]);
    await page.evaluate(() => saveRosterCache());
    await page.click('#btn-step2-next'); await page.waitForTimeout(500);
    await page.evaluate(() => { let seed = 3; const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
      roundData.groups.forEach(g => g.players.forEach(p => { scoresDb[g.id][p.id] = {}; roundData.course.pars.forEach((par, i) => { let r = rnd(); scoresDb[g.id][p.id][i + 1] = par + (r < 0.15 ? -1 : r < 0.5 ? 0 : r < 0.85 ? 1 : 2); }); }));
      viewDashboard(); document.querySelector('.back-to-scoring').style.visibility = 'hidden'; });
    await page.waitForTimeout(300);
    const fit = await page.evaluate(() => { const t = document.querySelector('.board-table'); const w = t.closest('.table-wrapper'); return { table: t.scrollWidth, box: w.clientWidth, formats: roundData.formats.length }; });
    ok(fit.formats === 3 && fit.table <= fit.box, `${width}px phone: leaderboard ${fit.table}px fits in ${fit.box}px (no sideways scroll)`);
    if (width === 390) { await page.evaluate(() => { const el = document.querySelector('.board-table').closest('section'); scrollTo(0, el.getBoundingClientRect().top + scrollY - 10); }); await page.waitForTimeout(150);
      const h = await page.evaluate(() => document.querySelector('.board-table').closest('section').getBoundingClientRect().height);
      await page.setViewportSize({ width, height: Math.ceil(h) + 20 }); await page.waitForTimeout(150);
      await page.evaluate(() => { const el = document.querySelector('.board-table').closest('section'); scrollTo(0, el.getBoundingClientRect().top + scrollY - 10); });
      console.log(await page.evaluate(() => [...document.querySelectorAll('.board-table th.group-head')].map(t => t.textContent + ':' + JSON.stringify(t.getBoundingClientRect().toJSON()))));
      await page.evaluate(() => document.querySelector('#step-dashboard .top-row').style.display = 'none');
      await page.evaluate(() => { const el = document.querySelector('.board-table').closest('section'); scrollTo(0, el.getBoundingClientRect().top + scrollY - 10); });
      await page.screenshot({ path: __dirname + '/shots/board-fit.png' }); }
    await page.close();
  }
  await browser.close();
  console.log(fails ? `${fails} FAILED` : 'ALL PASS'); process.exit(fails ? 1 : 0);
})();
