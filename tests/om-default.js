// The user's case: 2 teams of 2, Our Match turned on during Edit Setup, never touching the pickers
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs = require('fs');
const stub = fs.readFileSync(__dirname + '/stub.js', 'utf8');
const html = fs.readFileSync(__dirname + '/../index.html', 'utf8');
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
  let dialogs = []; page.on('dialog', d => { dialogs.push(d.message()); d.accept(); });
  await page.route('**/*', r => { const u = r.request().url();
    if (u.includes('gstatic')) return r.fulfill({ contentType: 'text/javascript', body: u.includes('app-compat') ? stub : '' });
    if (u.startsWith('http://app.test/')) return u.includes('logo') ? r.fulfill({ path: __dirname + '/../logo.png' }) : r.fulfill({ contentType: 'text/html', body: html });
    return r.abort(); });
  await page.addInitScript(() => { window.__docsInit = {}; });
  await page.goto('http://app.test/'); await page.waitForTimeout(300); await page.evaluate(() => { if (document.getElementById('step-home')?.classList.contains('active')) showScreen('step-1'); });
  await page.evaluate(() => { document.getElementById('group-count').value = 2; document.getElementById('players-per-group').value = 2; });
  await page.click('#step-1 .bar-primary[onclick="goToStep2()"]');
  for (const [id, n] of [['g1-p1','Brent'],['g1-p2','John'],['g2-p1','Jordia'],['g2-p2','Mike']]) await page.fill(`#${id}-name`, n);
  await page.evaluate(() => saveRosterCache());
  await page.click('#btn-step2-next'); await page.waitForTimeout(300);
  ok(!(await page.evaluate(() => window.__doc.roundData.ourMatch)), 'round started without Our Match');
  // Turn it on mid-round
  await page.click('text=Edit setup / rosters'); await page.waitForTimeout(150);
  await page.check('#om-enabled');
  await page.click('#step-1 .bar-primary[onclick="goToStep2()"]'); await page.waitForTimeout(150);
  await page.screenshot({ path: __dirname + '/shots/om-default.png', fullPage: true });
  await page.click('#btn-step2-next'); await page.waitForTimeout(300);
  ok(dialogs.length === 0, 'no alert: ' + dialogs.join(' | '));
  const om = await page.evaluate(() => window.__doc.roundData.ourMatch);
  ok(om && JSON.stringify([om.sideA, om.sideB]) === JSON.stringify([[{g:1,p:1},{g:1,p:2}],[{g:2,p:1},{g:2,p:2}]]), 'Team 1 vs Team 2: ' + JSON.stringify(om && [om.sideA, om.sideB]));
  ok(await page.isVisible('#step-3'), 'back on the scoring screen');
  await browser.close();
  console.log(fails ? `${fails} FAILED` : 'ALL PASS'); process.exit(fails ? 1 : 0);
})();
