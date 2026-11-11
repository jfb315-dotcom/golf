const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs = require('fs');
const stub = fs.readFileSync(__dirname + '/stub.js', 'utf8');
const html = fs.readFileSync(__dirname + '/../index.html', 'utf8');
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
  page.on('dialog', d => d.accept());
  await page.route('**/*', r => { const u = r.request().url();
    if (u.includes('gstatic')) return r.fulfill({ contentType: 'text/javascript', body: u.includes('app-compat') ? stub : '' });
    if (u.startsWith('http://app.test/')) return u.includes('logo') ? r.fulfill({ path: __dirname + '/../logo.png' }) : r.fulfill({ contentType: 'text/html', body: html });
    return r.abort(); });
  await page.addInitScript(() => { window.__docsInit = {}; });
  await page.goto('http://app.test/'); await page.waitForTimeout(300); await page.evaluate(() => { if (document.getElementById('step-home')?.classList.contains('active')) showScreen('step-1'); });
  ok(!(await page.isVisible('.edit-round-banner')), 'no edit banner when setting up a new round');
  await page.evaluate(() => { document.getElementById('group-count').value = 2; document.getElementById('players-per-group').value = 2; });
  await page.click('#step-1 .bar-primary[onclick="goToStep2()"]');
  for (const [id, n] of [['g1-p1','Al'],['g1-p2','Bo'],['g2-p1','Cy'],['g2-p2','Di']]) await page.fill(`#${id}-name`, n);
  await page.evaluate(() => saveRosterCache());
  await page.click('#btn-step2-next'); await page.waitForTimeout(300);
  await page.evaluate(() => { scoresDb[1][1][1] = 4; saveScoresToCloud([[1,1]], 1); });
  await page.waitForTimeout(100);
  const cloudBefore = await page.evaluate(() => JSON.stringify(window.__doc));

  for (const where of ['setup', 'rosters', 'pairings']) {
    await page.click('text=Edit setup / rosters'); await page.waitForTimeout(150);
    ok(await page.isVisible('#step-1 .edit-round-banner'), `${where}: editing banner shows on setup`);
    if (where === 'setup') await page.screenshot({ path: __dirname + '/shots/edit-banner.png' });
    ok(await page.innerText('#step-1 .edit-round-banner button') === 'Cancel edit', `${where}: banner button says Cancel edit`);
    await page.fill('#bet-amount', '99');
    if (where !== 'setup') {
      await page.click('#step-1 .bar-primary[onclick="goToStep2()"]'); await page.waitForTimeout(150);
      await page.fill('#g1-p1-name', 'CHANGED');
      if (where === 'rosters') ok(await page.innerText('#btn-step2-next') === 'Save & return to round', 'roster button says Save & return to round');
      if (where === 'pairings') { await page.click('text=Scramble carts'); await page.click('#btn-step2-next'); await page.waitForTimeout(150);
        ok(await page.innerText('#btn-pairings-start') === 'Save & return to round', 'pairings button says Save & return to round'); }
    }
    const screenId = { setup: 'step-1', rosters: 'step-2', pairings: 'step-2-half' }[where];
    await page.click(`#${screenId} .edit-round-banner button`); await page.waitForTimeout(150);
    ok(await page.isVisible('#step-3'), `${where}: Back to round returns to scoring`);
    ok(await page.evaluate(() => JSON.stringify(window.__doc)) === cloudBefore, `${where}: nothing saved to the cloud`);
    ok(await page.evaluate(() => roundData.betAmount === 20 && roundData.groups[0].players[0].name === 'Al' && !roundData.isScrambled), `${where}: this phone back to the live settings (bet $20, Al, team carts)`);
    ok(await page.evaluate(() => sessionStorage.getItem('isEditingMidRound') === null && !document.body.classList.contains('editing-round')), `${where}: no longer in edit mode`);
  }
  // A real edit still works afterwards
  await page.click('text=Edit setup / rosters'); await page.waitForTimeout(150);
  await page.fill('#bet-amount', '30');
  await page.click('#step-1 .bar-primary[onclick="goToStep2()"]'); await page.waitForTimeout(150);
  ok(await page.inputValue('#g1-p1-name') === 'Al', 'roster shows live names again after a cancelled edit');
  await page.click('#btn-step2-next'); await page.waitForTimeout(300);
  ok(await page.evaluate(() => window.__doc.roundData.betAmount === 30 && window.__doc.scoresDb[1][1][1] === 4), 'a later edit saves normally and keeps scores');
  ok(!(await page.isVisible('.edit-round-banner')), 'banner gone after saving');
  await page.evaluate(() => editMidRound()); await page.evaluate(() => cancelMidRoundEdit());
  await page.evaluate(() => { roundData = { groups: [] }; }); 
  ok(await page.evaluate(() => document.getElementById('btn-pairings-start').innerText === 'Start round'), 'buttons say Start round again when not editing');
  await browser.close();
  console.log(fails ? `${fails} FAILURE(S)` : 'ALL PASSED'); process.exit(fails ? 1 : 0);
})();
