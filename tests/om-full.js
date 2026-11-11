// A full 18-hole Our Match round (strokes on the back, net Nassau, presses), screenshotted live and final
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs = require('fs');
const stub = fs.readFileSync(__dirname + '/stub.js', 'utf8');
const html = fs.readFileSync(__dirname + '/../index.html', 'utf8');
const tag = process.argv[2] || 'now';
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  page.setDefaultTimeout(5000);
  page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
  page.on('dialog', d => d.accept());
  await page.route('**/*', r => { const u = r.request().url();
    if (u.includes('gstatic')) return r.fulfill({ contentType: 'text/javascript', body: u.includes('app-compat') ? stub : '' });
    if (u.startsWith('http://app.test/')) return r.fulfill({ contentType: 'text/html', body: html });
    return r.abort(); });
  await page.addInitScript(() => { window.__docsInit = {}; });
  await page.goto('http://app.test/'); await page.waitForTimeout(300);
  await page.evaluate(() => { if (document.getElementById('step-home')?.classList.contains('active')) showScreen('step-1'); });
  await page.evaluate(() => { document.getElementById('group-count').value = 2; document.getElementById('players-per-group').value = 2; });
  await page.evaluate(() => startNewRound('om')); await page.check('#om-nassau-net');
  await page.click('#step-1 .bar-primary[onclick="goToStep2()"]');
  for (const [id, n] of [['g1-p1','Brent'],['g1-p2','John'],['g2-p1','Jordia'],['g2-p2','Mike']]) await page.fill(`#${id}-name`, n);
  await page.evaluate(() => saveRosterCache());
  await page.click('#btn-step2-next'); await page.waitForTimeout(300);
  await page.evaluate(() => {
    // over par per hole for Brent, John, Jordia, Mike
    const over = [[0,1,1,0],[1,0,1,1],[-1,1,0,1],[0,0,1,0],[1,1,0,2],[0,1,0,0],[0,0,1,1],[-1,0,0,1],[1,2,0,1],
                  [0,1,1,0],[1,0,0,1],[0,1,1,1],[-1,0,1,0],[0,1,0,-1],[1,0,1,1],[0,0,0,1],[1,1,0,0],[0,1,1,1]];
    roundData.groups[1].players[0].strokeHoles = [10, 12, 14, 16, 18];
    let who = [[1,1],[1,2],[2,1],[2,2]];
    for (let h = 1; h <= 18; h++) who.forEach(([g, p], i) => { scoresDb[g][p][h] = roundData.course.pars[h - 1] + over[h - 1][i]; });
    matchPresses = { front: { B: 3 }, back: { B: 12 } };
  });
  await page.evaluate(() => { showingFinalResults = true; viewDashboard(); document.querySelector('.back-to-scoring').style.visibility = 'hidden'; });
  await page.waitForTimeout(200);
  const h = await page.evaluate(() => document.body.scrollHeight);
  await page.setViewportSize({ width: 390, height: Math.min(h, 8000) });
  await page.screenshot({ path: __dirname + `/shots/om-full-${tag}.png` });
  console.log('height', h);
  await browser.close();
  console.log(fails ? `${fails} FAILED` : 'ALL PASS'); process.exit(fails ? 1 : 0);
})();
