const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs = require('fs');
const stub = fs.readFileSync(__dirname + '/stub.js', 'utf8');
const html = fs.readFileSync(__dirname + '/../index.html', 'utf8');
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const mk = async () => { const p = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
    p.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; }); p.on('dialog', d => d.accept());
    await p.route('**/*', r => { const u = r.request().url();
      if (u.includes('gstatic')) return r.fulfill({ contentType: 'text/javascript', body: u.includes('app-compat') ? stub : '' });
      if (u.startsWith('http://app.test/')) return r.fulfill({ contentType: 'text/html', body: html });
      return r.abort(); }); return p; };
  const page = await mk();
  await page.addInitScript(() => { window.__docsInit = {}; });
  await page.goto('http://app.test/'); await page.waitForTimeout(300); await page.evaluate(() => { if (document.getElementById('step-home')?.classList.contains('active')) showScreen('step-1'); });
  await page.evaluate(() => { document.getElementById('group-count').value = 2; document.getElementById('players-per-group').value = 2; });
  await page.evaluate(() => startNewRound('om'));
  await page.click('#step-1 .bar-primary[onclick="goToStep2()"]');
  for (const [id, n] of [['g1-p1','Brent'],['g1-p2','John'],['g2-p1','Jordia'],['g2-p2','Mike']]) await page.fill(`#${id}-name`, n);
  await page.evaluate(() => saveRosterCache());
  await page.click('#btn-step2-next'); await page.waitForTimeout(300);
  await page.evaluate(() => { [[1,1,4],[1,2,5],[2,1,5],[2,2,5]].forEach(([g,p,v]) => { scoresDb[g][p][1] = v; }); saveScoresToCloud([[1,1],[1,2],[2,1],[2,2]], 1); });
  await page.waitForTimeout(200);
  { const live = await page.evaluate(() => JSON.parse(JSON.stringify(window.__docs)));
    const p = await mk(); await p.addInitScript(d => { window.__docsInit = d; }, live);
    await p.goto('http://app.test/?spectator=true&om=1'); await p.waitForTimeout(700);
    ok(!(await p.evaluate(() => [...document.querySelectorAll('#step-dashboard .alerts-banner')].some(e => e.offsetParent))), 'Our Match link: no alerts prompt (they are playing with you)'); }
  { // every hole scored, round not finalized yet
    const done = await page.evaluate(() => { let d = JSON.parse(JSON.stringify(window.__docs)); let a = d.active_round;
      for (let h = 1; h <= 18; h++) [[1,1],[1,2],[2,1],[2,2]].forEach(([g,p]) => { a.scoresDb[g][p][h] = g === 1 ? 4 : 5; }); return d; });
    const p = await mk(); await p.addInitScript(d => { window.__docsInit = d; }, done);
    await p.goto('http://app.test/?spectator=true&om=1'); await p.waitForTimeout(700);
    ok(!(await p.evaluate(() => [...document.querySelectorAll('#step-dashboard .alerts-banner')].some(e => e.offsetParent))), 'match over (not finalized): no alerts card');
    ok((await p.innerText('#dashboard-eyebrow')).toUpperCase() === 'ROUND COMPLETE' && (await p.innerText('#dashboard-title')) === 'Final results', 'match over: says Round complete · Final results');
    await p.screenshot({ path: __dirname + '/shots/ra-match-over.png' }); }
  const docs = await page.evaluate(() => { let d = JSON.parse(JSON.stringify(window.__docs)); let a = d.active_round; a.isArchived = true; a.archivedAt = Date.now();
    d['archive_' + a.roundData.roundId] = { roundData: a.roundData, scoresDb: a.scoresDb }; window.__rid = a.roundData.roundId; return d; });
  const rid = await page.evaluate(() => window.__rid);
  for (const [name, q] of [['live-after-final', '?spectator=true&om=1'], ['results', '?round=' + rid]]) {
    const p = await mk(); await p.addInitScript(d => { window.__docsInit = d; }, docs);
    await p.goto('http://app.test/' + q); await p.waitForTimeout(700);
    const vis = await p.evaluate(() => [...document.querySelectorAll('.alerts-banner, .modal-overlay.active')].filter(e => e.offsetParent).map(e => e.className + ': ' + e.textContent.trim().slice(0, 60)));
    console.log(name, JSON.stringify(vis));
    ok(vis.length === 0, name + ': no alerts prompt on a finished round');
    await p.screenshot({ path: __dirname + `/shots/ra-${name}.png` });
  }
  await browser.close(); console.log(fails ? `${fails} FAILED` : 'ALL PASS'); process.exit(fails ? 1 : 0);
})();
