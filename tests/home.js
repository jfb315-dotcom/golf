const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs = require('fs');
const stub = fs.readFileSync(__dirname + '/stub.js', 'utf8');
const html = fs.readFileSync(__dirname + '/../index.html', 'utf8');
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
  await page.addInitScript(() => { window.__docsInit = { saved_players: { players: { 'al a': { name: 'Al A' }, 'bo b': { name: 'Bo B' } } } }; });
  const pin = async () => { await page.waitForTimeout(150); for (const d of '1234') await page.click(`.pin-pad button:text-is("${d}")`); await page.waitForTimeout(300); };
  await page.goto('http://app.test/'); await page.waitForTimeout(500);
  ok(await page.isVisible('#step-home') && !(await page.isVisible('#home-live')), 'opens on Home with no live round');
  ok((await page.textContent('#tile-players')) === '2 saved', 'players tile count');
  await page.screenshot({ path: __dirname + '/shots/home.png' });
  // Courses & tees from Home: pick another course in the popup
  await page.click('.home-tile:has-text("Courses")'); await page.waitForTimeout(150);
  await page.selectOption('#tees-course-sel', 'ballyhack'); await page.waitForTimeout(150);
  ok((await page.inputValue('#tees-rows .tee-edit-row:first-child .te-name')) === 'Big Lick' && await page.inputValue('#course-selector') === 'ballyhack', 'course picker in Tees & ratings');
  await page.click('#tees-modal .btn-secondary');
  // New round → setup → back home
  await page.click('.home-new'); ok(await page.isVisible('#step-1'), 'New round opens setup');
  await page.click('#step-1 .back-link-top'); ok(await page.isVisible('#step-home'), '‹ Home goes back');
  // play a quick round
  await page.click('.home-new');
  await page.evaluate(() => { document.getElementById('group-count').value = 2; document.getElementById('players-per-group').value = 1; });
  await page.click('#step-1 .bar-primary[onclick="goToStep2()"]');
  await page.fill('#g1-p1-name', 'Al A'); await page.fill('#g2-p1-name', 'Bo B'); await page.evaluate(() => saveRosterCache());
  await page.click('#btn-step2-next'); await page.waitForTimeout(500);
  await page.evaluate(() => { roundData.groups.forEach((g, i) => g.players.forEach(p => roundData.course.pars.forEach((par, h) => { scoresDb[g.id][p.id] = scoresDb[g.id][p.id] || {}; scoresDb[g.id][p.id][h+1] = par + i; }))); });
  // Home from scoring shows the live round
  await page.click('text=Home · players, money, past rounds');
  ok(await page.isVisible('#home-live') && (await page.textContent('#home-live-text')).includes('Ballyhack'), 'Home shows the round in progress');
  await page.screenshot({ path: __dirname + '/shots/home-live.png' });
  await page.click('#home-live button:has-text("Scoring")'); ok(await page.isVisible('#step-3'), 'Scoring button goes back to scoring');
  page.evaluate(() => validateAndFinalize()); await pin();
  await page.evaluate(() => { closeShareModal(); document.getElementById('text-modal').classList.remove('active'); });
  ok(await page.isVisible('#step-home') && !(await page.isVisible('#home-live')), 'after finalize: back on Home');
  await page.screenshot({ path: __dirname + '/shots/home-final.png' });
  // past rounds → view → share
  await page.click('.home-tile:has-text("Past rounds")'); await page.waitForTimeout(300);
  await page.click('.archive-item button'); await page.waitForTimeout(300);
  ok(await page.isVisible('#archived-top .back-link-top') && (await page.textContent('#archived-sub')).includes('Ballyhack'), 'past round has a back link at the top and course/date');
  await page.screenshot({ path: __dirname + '/shots/past-round.png' });
  await page.click('#step-9 >> text=Share as text instead'); await page.waitForTimeout(150);
  const t1 = await page.inputValue('#share-text-content');
  ok(t1.includes('Al') && t1.includes('Bo'), 'share as text still works');
  await page.evaluate(() => closeShareModal());
  await page.click('#archived-actions .bar-primary'); await page.waitForTimeout(150);
  const link = (await page.inputValue('#share-text-content')).match(/http\S+/)[0];
  ok(/\?round=\d+$/.test(link), 'Share this page gives a link: ' + link);
  await page.evaluate(() => closeShareModal());
  // open that link as someone else
  const docs = await page.evaluate(() => window.__docs);
  const p2 = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  p2.on('pageerror', e => { console.log('P2 ERROR', e.message); fails++; });
  await p2.route('**/*', r => { const u = r.request().url();
    if (u.includes('gstatic')) return r.fulfill({ contentType: 'text/javascript', body: u.includes('app-compat') ? stub : '' });
    if (u.startsWith('http://app.test/')) return r.fulfill({ contentType: 'text/html', body: html });
    return r.abort(); });
  await p2.addInitScript(d => { window.__docsInit = d; }, docs);
  await p2.goto(link); await p2.waitForTimeout(600);
  ok(await p2.isVisible('#step-9') && (await p2.textContent('#step-9')).includes('Al') && !(await p2.isVisible('#archived-actions')) && !(await p2.isVisible('#archived-top')), 'link opens the results page, read-only');
  await p2.screenshot({ path: __dirname + '/shots/shared-round.png' });
  // alerts tile
  await page.evaluate(() => showScreen('step-home'));
  ok(await page.isVisible('#tile-alerts-wrap'), 'Alerts tile on Home');
  await page.click('#tile-alerts-wrap'); await page.waitForTimeout(150);
  ok(await page.isVisible('#step-alerts') && await page.isVisible('#alert-birdies'), 'Alerts screen with the switches');
  await page.screenshot({ path: __dirname + '/shots/alerts-page.png', fullPage: true });
  await page.click('#step-alerts .back-link-top'); ok(await page.isVisible('#step-home'), 'back to Home');
  await browser.close();
  console.log(fails ? `${fails} FAILED` : 'ALL PASS'); process.exit(fails ? 1 : 0);
})();
