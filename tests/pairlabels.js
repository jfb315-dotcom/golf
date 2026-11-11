// Pair labels: "Pair 1" until both players are picked, then the pair's initials ("JB & AA")
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs = require('fs');
const stub = fs.readFileSync(__dirname + '/stub.js', 'utf8');
const html = fs.readFileSync(__dirname + '/../index.html', 'utf8');
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 }); page.setDefaultTimeout(5000);
  page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; }); page.on('dialog', d => d.accept());
  await page.route('**/*', r => { const u = r.request().url();
    if (u.includes('gstatic')) return r.fulfill({ contentType: 'text/javascript', body: u.includes('app-compat') ? stub : '' });
    if (u.startsWith('http://app.test/')) return r.fulfill({ contentType: 'text/html', body: html });
    return r.abort(); });
  await page.addInitScript(() => { window.__docsInit = {}; });
  await page.goto('http://app.test/?beta=0'); await page.waitForTimeout(400);
  await page.evaluate(() => { changeTheme('fairway'); startNewRound('tournament'); document.getElementById('group-count').value = 2; document.getElementById('players-per-group').value = 4; });
  await page.check('#om-enabled');
  await page.click('#step-1 .bar-primary[onclick="goToStep2()"]');
  const names = ['Jordia Smith','Brent Copeland','Andy Anderson','John Bischof','Ed Eads','Fy Fox','Gus Gray','Hal Hart'];
  for (let i = 0; i < 8; i++) await page.fill(`#g${Math.floor(i / 4) + 1}-p${i % 4 + 1}-name`, names[i]);
  await page.evaluate(() => { saveRosterCache(); renderOurMatchSides(); });
  const omLabels = () => page.$$eval('#om-sides .om-side-name', x => x.map(e => e.textContent));
  console.log('Our Match pairs (defaults):', JSON.stringify(await omLabels()));
  // pick Jordia & John vs Brent & Andy
  await page.selectOption('#om-a1', '1-1'); await page.selectOption('#om-a2', '1-4');
  await page.selectOption('#om-b1', '1-2'); await page.selectOption('#om-b2', '1-3');
  ok(JSON.stringify(await omLabels()) === '["JS & JB","BC & AA"]', 'Our Match pairs: ' + JSON.stringify(await omLabels()));
  await page.selectOption('#om-b2', '');
  ok((await omLabels())[1] === 'Pair 2', 'a pair missing a player says Pair 2');
  await page.selectOption('#om-b2', '1-3');
  await page.evaluate(() => document.getElementById('om-sides').scrollIntoView({ block: 'center' }));
  await page.screenshot({ path: __dirname + '/shots/pairlabels.png' });
  // side bet in setup
  await page.click('text=+ Add a side bet');
  const sb = () => page.$$eval('#side-bets-list .om-side-name', x => x.map(e => e.textContent));
  ok(JSON.stringify(await sb()) === '["Pair 1","Pair 2"]', 'new side bet: Pair 1 / Pair 2 before picking');
  const sels = await page.$$('#side-bets-list select');
  await sels[0].selectOption('2-1'); await sels[1].selectOption('2-2'); await sels[2].selectOption('2-3'); await sels[3].selectOption('2-4');
  ok(JSON.stringify(await sb()) === '["EE & FF","GG & HH"]', 'side bet pairs: ' + JSON.stringify(await sb()));
  // live side bet pop-up
  await page.evaluate(() => { tempRosterCache.sideBets = []; renderSideBets(); });
  await page.click('#btn-step2-next'); await page.waitForTimeout(400);
  await page.evaluate(() => openLiveSideBet());
  await page.selectOption('#sbl-a1', '2-1'); await page.selectOption('#sbl-a2', '2-2');
  ok(await page.textContent('#sb-modal .om-side-name') === 'EE & FF', 'during the round, add a side bet: ' + await page.textContent('#sb-modal .om-side-name'));
  await browser.close();
  console.log(fails ? `${fails} FAILED` : 'ALL PASS'); process.exit(fails ? 1 : 0);
})();
