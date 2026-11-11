// Undo after the last score of a hole: goes back to that hole, removes that score, selects that player
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs = require('fs');
const stub = fs.readFileSync(__dirname + '/stub.js', 'utf8');
const html = fs.readFileSync(__dirname + '/../index.html', 'utf8');
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  for (const beta of [true, false]) {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } }); page.setDefaultTimeout(6000);
    page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; }); page.on('dialog', d => d.accept());
    await page.route('**/*', r => { const u = r.request().url();
      if (u.includes('gstatic')) return r.fulfill({ contentType: 'text/javascript', body: u.includes('app-compat') ? stub : '' });
      if (u.startsWith('http://app.test/')) return r.fulfill({ contentType: 'text/html', body: html });
      return r.abort(); });
    await page.addInitScript(() => { window.__docsInit = {}; });
    await page.goto('http://app.test/' + (beta ? '?beta=1' : '?beta=0')); await page.waitForTimeout(400);
    const tag = beta ? 'test copy: ' : 'real app: ';
    await page.evaluate(() => { showScreen('step-1'); document.getElementById('group-count').value = 2; document.getElementById('players-per-group').value = 2; });
    if (beta) { await page.click('text=Next: games & money'); await page.click('text=Next: players & teams'); } else await page.click('#step-1 .bar-primary[onclick="goToStep2()"]');
    for (const [id, n] of [['g1-p1','Al Adams'],['g1-p2','Bo Brown'],['g2-p1','Ed Eads'],['g2-p2','Fy Fox']]) await page.fill(`#${id}-name`, n);
    await page.evaluate(() => saveRosterCache());
    if (beta) await page.click('text=Next: extras & review');
    await page.click('#btn-step2-next'); await page.waitForTimeout(400);
    for (let i = 0; i < 4; i++) { await page.click('.score-keypad button:text-is("4")'); await page.waitForTimeout(120); }
    await page.waitForTimeout(2500);
    ok(await page.evaluate(() => roundData.currentHole) === 2, tag + 'moved on to hole 2 after the last score');
    await page.evaluate(() => undoLastScore()); await page.waitForTimeout(200);
    const st = await page.evaluate(() => ({ hole: roundData.currentHole, last: scoresDb[2][2][1], first: scoresDb[1][1][1], active: activeScoreInputId }));
    console.log(JSON.stringify(st));
    ok(st.hole === 1, tag + 'undo goes back to hole 1');
    ok(!st.last && st.first === 4, tag + 'only the last score is removed');
    ok(st.active === 'score-input-2-2', tag + "that player's box is selected, ready for the right score");
    await page.click('.score-keypad button:text-is("5")'); await page.waitForTimeout(150);
    ok(await page.evaluate(() => scoresDb[2][2][1]) === 5, tag + 'typing puts the corrected score in');
    await page.close();
  }
  await browser.close();
  console.log(fails ? `${fails} FAILED` : 'ALL PASS'); process.exit(fails ? 1 : 0);
})();
