// Our Match: a press made by mistake can be undone (live only), and a press from the second side's link lands on the right side
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs = require('fs');
const stub = fs.readFileSync(__dirname + '/stub.js', 'utf8');
const html = fs.readFileSync(__dirname + '/../index.html', 'utf8');
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const mk = async (docs, url) => { const p = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 }); p.setDefaultTimeout(5000);
    p.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; }); p.on('dialog', d => d.accept());
    await p.route('**/*', r => { const u = r.request().url();
      if (u.includes('gstatic')) return r.fulfill({ contentType: 'text/javascript', body: u.includes('app-compat') ? stub : '' });
      if (u.startsWith('http://app.test/')) return r.fulfill({ contentType: 'text/html', body: html });
      return r.abort(); });
    await p.addInitScript(d => { window.__docsInit = d; }, docs); await p.goto(url); await p.waitForTimeout(500); return p; };
  const page = await mk({}, 'http://app.test/?beta=0');
  await page.evaluate(() => { showScreen('step-1'); document.getElementById('group-count').value = 2; document.getElementById('players-per-group').value = 2; });
  await page.evaluate(() => startNewRound('om'));
  await page.click('#step-1 .bar-primary[onclick="goToStep2()"]');
  for (const [id, n] of [['g1-p1','Brent'],['g1-p2','John'],['g2-p1','Jordia'],['g2-p2','Mike']]) await page.fill(`#${id}-name`, n);
  await page.evaluate(() => saveRosterCache());
  await page.click('#btn-step2-next'); await page.waitForTimeout(300);
  // Jordia & Mike (side B) are 1 down on the front after 3 holes
  await page.evaluate(() => { for (let h = 1; h <= 3; h++) [[1,1],[1,2],[2,1],[2,2]].forEach(([g, p], i) => { scoresDb[g][p][h] = roundData.course.pars[h - 1] + (h === 2 && i >= 2 ? 1 : 0); }); for (let h = 1; h <= 3; h++) saveScoresToCloud([[1,1],[1,2],[2,1],[2,2]], h); viewDashboard(); });
  await page.waitForTimeout(200);
  const pressBtn = 'button.om-press:has-text("PRESS FRONT 9 · Jordia & Mike")';
  ok(await page.isVisible(pressBtn), 'side B can press the front');
  await page.click(pressBtn); await page.waitForTimeout(200);
  ok(await page.evaluate(() => matchPresses.front?.B === 3 && window.__docs.active_round.matchPresses?.front?.B === 3), 'press saved (after hole 3)');
  ok(await page.isVisible('.om-press-made .om-unpress'), 'pressed: Undo shows beside it');
  await page.screenshot({ path: __dirname + '/shots/unpress.png' });
  await page.click('.om-press-made .om-unpress'); await page.waitForTimeout(200);
  ok(await page.evaluate(() => matchPresses.front?.B == null && window.__docs.active_round.matchPresses?.front?.B == null), 'Undo removes the press here and in the cloud');
  console.log(await page.evaluate(() => JSON.stringify({ mp: matchPresses, can: calculateOurMatch(roundData, scoresDb, matchPresses).nassau.front.canPress, btns: [...document.querySelectorAll('.om-press')].map(b => b.textContent), screen: document.querySelector('.screen.active').id })));
  ok(!(await page.isVisible('.om-press-made')) && await page.isVisible(pressBtn), 'press gone from the list; side B can press again');
  // the second side's link (om=2) shows their side first; pressing there is side B's press
  const docs = await page.evaluate(() => JSON.parse(JSON.stringify(window.__docs)));
  const rid = docs.active_round.roundData.roundId;
  const b = await mk(docs, `http://app.test/?spectator=true&om=2&beta=0`);
  await b.close();
  await page.evaluate(() => history.replaceState(null, '', location.pathname + '?beta=0&om=2'));
  await page.evaluate(() => viewDashboard()); await page.waitForTimeout(200);
  const flippedBtn = 'button.om-press:has-text("PRESS FRONT 9 · Jordia & Mike")';
  ok(await page.isVisible(flippedBtn), 'their link: their own press button shows');
  await page.click(flippedBtn); await page.waitForTimeout(200);
  ok(await page.evaluate(() => matchPresses.front?.B === 3 && matchPresses.front?.A == null), 'their link: the press is recorded for Jordia & Mike, not the other side');
  await page.click('.om-press-made .om-unpress'); await page.waitForTimeout(200);
  ok(await page.evaluate(() => matchPresses.front?.B == null), 'their link: Undo removes their press');
  // final results: no Undo
  await page.evaluate(() => { history.replaceState(null, '', location.pathname + '?beta=0'); matchPresses = { front: { B: 3 } }; showingFinalResults = true; viewDashboard(); });
  await page.waitForTimeout(200);
  ok(!(await page.isVisible('.om-unpress')), 'final results: press listed, no Undo');
  await browser.close();
  console.log(fails ? `${fails} FAILED` : 'ALL PASS'); process.exit(fails ? 1 : 0);
})();
