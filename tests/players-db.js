const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs = require('fs');
const stub = fs.readFileSync(__dirname + '/stub.js', 'utf8');
const html = fs.readFileSync(__dirname + '/../index.html', 'utf8');
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
  page.on('dialog', d => { console.log('  dialog:', d.message()); d.accept(); });
  await page.route('**/*', r => { const u = r.request().url();
    if (u.includes('gstatic')) return r.fulfill({ contentType: 'text/javascript', body: u.includes('app-compat') ? stub : '' });
    if (u.startsWith('http://app.test/')) return r.fulfill({ contentType: 'text/html', body: html });
    return r.abort(); });
  // An existing saved player from before (old format: name + strokes only)
  await page.addInitScript(() => { window.__docsInit = { saved_players: { players: { 'brent': { name: 'Brent', strokes: { cleveland: '4' } } } } }; localStorage.setItem('savedTheme', 'augusta'); });
  await page.goto('http://app.test/'); await page.waitForTimeout(500); await page.evaluate(() => { if (document.getElementById('step-home')?.classList.contains('active')) showScreen('step-1'); });
  await page.evaluate(() => showScreen('step-home')); ok((await page.innerText('#tile-players')) === '1 saved', 'Home shows Players with a count');
  await page.click('button[onclick="openPlayersScreen()"]'); await page.waitForTimeout(200);
  ok((await page.innerText('#players-list')).includes('Brent'), 'old saved player shows up');
  // Edit Brent: add last name and tees
  await page.click('.player-row'); await page.waitForTimeout(100);
  await page.fill('#pl-last', 'Smith'); await page.fill('#pl-tee', 'Blue');
  await page.click('#player-modal .btn-primary'); await page.waitForTimeout(200);
  let db = await page.evaluate(() => window.__docs.saved_players.players);
  ok(!db['brent'] && db['brent smith']?.last === 'Smith' && db['brent smith'].tee === 'Blue' && db['brent smith'].strokes?.cleveland === '4', 'Brent renamed to Brent Smith, Blue tees, strokes kept: ' + JSON.stringify(db));
  // Add new players
  const add = async (f, l, n, t) => { await page.click('.players-add'); await page.fill('#pl-first', f); await page.fill('#pl-last', l); await page.fill('#pl-nick', n); await page.fill('#pl-tee', t); await page.click('#player-modal .btn-primary'); await page.waitForTimeout(100); };
  await add('Jordia', 'Jones', '', 'White'); await add('Mike', 'Brown', 'Bubba', 'Gold'); await add('Mike', 'Davis', '', 'Blue');
  const list = await page.$$eval('.player-row', r => r.map(x => x.innerText.replace(/\s+/g, ' ').trim()));
  ok(list.length === 4 && list[0].startsWith('Mike Brown') && list[1].startsWith('Mike Davis'), 'sorted by last name: ' + list.join(' | '));
  await page.screenshot({ path: __dirname + '/shots/players.png' });
  // duplicate blocked
  await add('Jordia', 'Jones', '', '');
  ok(await page.isVisible('#player-modal'), 'adding a duplicate is refused (editor stays open)');
  await page.click('#player-modal .btn-secondary:text-is("Cancel")');
  // Build a round from the database
  await page.click('#step-players .back-link-top'); await page.click('.home-new');
  await page.evaluate(() => { document.getElementById('group-count').value = 2; document.getElementById('players-per-group').value = 2; });
  await page.click('#step-1 .bar-primary[onclick="goToStep2()"]');
  for (const [id, n] of [['g1-p1','Brent Smith'],['g1-p2','Mike Brown'],['g2-p1','Jordia Jones'],['g2-p2','Mike Davis']]) await page.fill(`#${id}-name`, n);
  await page.evaluate(() => saveRosterCache());
  await page.click('#btn-step2-next'); await page.waitForTimeout(400);
  const players = await page.evaluate(() => window.__doc.roundData.groups.flatMap(g => g.players.map(p => [p.name, p.tee, p.nick])));
  ok(JSON.stringify(players) === JSON.stringify([['Brent Smith','Blue',''],['Mike Brown','Gold','Bubba'],['Jordia Jones','White',''],['Mike Davis','Blue','']]), 'round players carry tees and nicknames: ' + JSON.stringify(players));
  const rows = await page.$$eval('.score-row .player-name', r => r.map(x => x.innerText.replace(/\s+/g, ' ').trim()));
  ok(JSON.stringify(rows) === JSON.stringify(['Brent Blue', 'Bubba Gold', 'Jordia White', 'Mike D. Blue']), 'scoring names: nickname / first / first + initial when shared, with tee tags: ' + rows.join(' | '));
  await page.screenshot({ path: __dirname + '/shots/players-scoring.png' });
  // A brand-new name typed on the roster joins the database
  // (finalize resets; start a fresh round with a new name)
  await browser.close();
  console.log(fails ? `${fails} FAILED` : 'ALL PASS'); process.exit(fails ? 1 : 0);
})();
