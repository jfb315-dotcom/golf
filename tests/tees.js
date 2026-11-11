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
    if (u.startsWith('http://app.test/')) return r.fulfill({ contentType: 'text/html', body: html });
    return r.abort(); });
  await page.addInitScript(() => { window.__docsInit = { saved_players: { players: {
    'brent smith': { name: 'Brent Smith', first: 'Brent', last: 'Smith', tee: 'white/green' },
    'mike davis': { name: 'Mike Davis', first: 'Mike', last: 'Davis', tee: 'Black' } } } }; localStorage.setItem('savedTheme', 'augusta'); });
  await page.goto('http://app.test/'); await page.waitForTimeout(500); await page.evaluate(() => { if (document.getElementById('step-home')?.classList.contains('active')) showScreen('step-1'); });
  await page.selectOption('#course-selector', 'tennessee_national');
  await page.click('text=Tees & ratings'); await page.waitForTimeout(150);
  const rows = await page.$$eval('#tees-rows .tee-edit-row', r => r.map(x => [...x.querySelectorAll('input')].map(i => i.value).join('|')));
  ok(rows.length === 5 && rows[3] === 'White/Green|6235|69.9|128', 'Tennessee National tees loaded incl. White/Green: ' + rows.join(' ; '));
  ok(await page.isVisible('.te-est'), 'White/Green marked as an estimate');
  await page.screenshot({ path: __dirname + '/shots/tees-editor.png' });
  // correct the combo from the scorecard
  await page.fill('#tees-rows .tee-edit-row:nth-child(4) .te-rating', '70.1');
  await page.fill('#tees-rows .tee-edit-row:nth-child(4) .te-slope', '129');
  await page.click('#tees-modal .btn-primary'); await page.waitForTimeout(200);
  const saved = await page.evaluate(() => window.__docs.course_tees.courses.tennessee_national.find(t => t.name === 'White/Green'));
  ok(saved.rating === 70.1 && saved.slope === 129 && !saved.est, 'correction saved to Firebase and no longer an estimate');
  // roster: tee picker defaults to the usual tee matched to this course
  await page.evaluate(() => { document.getElementById('group-count').value = 2; document.getElementById('players-per-group').value = 2; });
  await page.click('#step-1 .bar-primary[onclick="goToStep2()"]');
  await page.fill('#g1-p1-name', 'Brent Smith'); await page.dispatchEvent('#g1-p1-name', 'change');
  await page.fill('#g1-p2-name', 'Mike Davis'); await page.dispatchEvent('#g1-p2-name', 'change');
  await page.fill('#g2-p1-name', 'Jordia'); await page.fill('#g2-p2-name', 'Joe');
  ok(await page.inputValue('#g1-p1-tee') === 'White/Green' && await page.inputValue('#g1-p2-tee') === 'Black', 'roster tees default to each player\'s usual (white/green → White/Green)');
  await page.selectOption('#g2-p1-tee', 'Orange');
  await page.evaluate(() => saveRosterCache());
  const w = await page.evaluate(() => { const r = document.querySelector('#g1-p1-name').closest('.roster-player-block').getBoundingClientRect(); return r.right <= window.innerWidth; });
  ok(w, 'roster row fits the screen with the tee picker');
  await page.screenshot({ path: __dirname + '/shots/roster-tees.png' });
  await page.click('#btn-step2-next'); await page.waitForTimeout(400);
  const ps = await page.evaluate(() => window.__doc.roundData.groups.flatMap(g => g.players.map(p => [p.name, p.tee, p.teeRating, p.teeSlope])));
  ok(JSON.stringify(ps) === JSON.stringify([['Brent Smith','White/Green',70.1,129],['Mike Davis','Black',75.8,140],['Jordia','Orange',73.5,136],['Joe','',null,null]]), 'round keeps each player\'s tee with rating and slope: ' + JSON.stringify(ps));
  await browser.close();
  console.log(fails ? `${fails} FAILED` : 'ALL PASS'); process.exit(fails ? 1 : 0);
})();
