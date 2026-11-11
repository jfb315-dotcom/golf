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
  await page.addInitScript(() => {
    if (sessionStorage.getItem('seeded')) return; sessionStorage.setItem('seeded', '1');
    const prior = {};
    [[ '2026-09-01', 14.2 ], [ '2026-09-08', 11.0 ], [ '2026-09-15', 16.5 ]].forEach(([d, diff], i) => prior['old' + i] = { date: d, courseKey: 'council_fire', course: 'Council Fire (Chattanooga, TN)', holes: 18, players: { 'brent smith': { name: 'Brent Smith', holes: 18, gross: 85, adjusted: 84, par: 72, tee: 'White', rating: 69.8, slope: 125, diff } } });
    window.__docsInit = { saved_players: { players: {
      'brent smith': { name: 'Brent Smith', first: 'Brent', last: 'Smith', tee: 'white/green' },
      'mike davis': { name: 'Mike Davis', first: 'Mike', last: 'Davis', tee: 'Black' } } },
      player_history: { rounds: prior } };
    // a round archived on this phone before history existed (no tee data)
    const pars = [4,4,4,3,5,4,5,3,4,4,4,3,4,5,4,5,3,4];
    const sc = {}; pars.forEach((p, i) => sc[i + 1] = p + 1);
    localStorage.setItem('tournamentArchive', JSON.stringify([{ date: '2026-08-20', course: { name: 'Tennessee National (Loudon, TN)', pars }, roundData: { roundId: 555, date: '2026-08-20', course: { name: 'Tennessee National (Loudon, TN)', pars }, playMode: '18', groups: [{ id: 1, players: [{ id: 0, name: 'Mike Davis', strokeHoles: [] }] }] }, scoresDb: { 1: { 0: sc } } }]));
  });
  await page.goto('http://app.test/'); await page.waitForTimeout(500); await page.evaluate(() => { if (document.getElementById('step-home')?.classList.contains('active')) showScreen('step-1'); });
  await page.selectOption('#course-selector', 'tennessee_national');
  await page.evaluate(() => { document.getElementById('group-count').value = 2; document.getElementById('players-per-group').value = 2; });
  await page.click('#step-1 .bar-primary[onclick="goToStep2()"]');
  await page.fill('#g1-p1-name', 'Brent Smith'); await page.dispatchEvent('#g1-p1-name', 'change');
  await page.fill('#g1-p2-name', 'Mike Davis'); await page.dispatchEvent('#g1-p2-name', 'change');
  await page.fill('#g2-p1-name', 'Jordia'); await page.fill('#g2-p2-name', 'Joe');
  await page.fill('#g1-p1-strokes', '4');
  await page.evaluate(() => saveRosterCache());
  await page.click('#btn-step2-next'); await page.waitForTimeout(400);
  // Brent: bogey golf, a 10 on hole 4 (par 3, gets a stroke there → capped at 6). Mike: pars. Joe leaves hole 18 blank.
  await page.evaluate(() => { roundData.groups.forEach(g => g.players.forEach(p => { scoresDb[g.id][p.id] = {}; roundData.course.pars.forEach((par, i) => {
      if (p.name === 'Joe' && i === 17) return;
      scoresDb[g.id][p.id][i + 1] = p.name === 'Brent Smith' ? (i === 3 ? 10 : par + 1) : p.name === 'Mike Davis' ? par : par + 2; }); })); });
  page.evaluate(() => validateAndFinalize()); await page.waitForTimeout(200);
  for (const d of '1234') await page.click(`.pin-pad button:text-is("${d}")`);
  await page.waitForTimeout(500);
  const hist = await page.evaluate(() => window.__docs.player_history.rounds);
  const id = Object.keys(hist).find(k => !k.startsWith('old'));
  const r = hist[id];
  ok(r && r.courseKey === 'tennessee_national' && r.holes === 18, 'finalized round saved to history');
  const b = r.players['brent smith'];
  // par 72; gross 72+18+6 = 96 (hole 4 is 10 instead of 4); adjusted caps 10 at 3+2+1 = 6 → 92
  ok(b.gross === 96 && b.adjusted === 92 && b.tee === 'White/Green' && b.rating === 69.9 && b.slope === 128, 'Brent: gross, capped score and tee: ' + JSON.stringify(b));
  ok(b.diff === Math.round(113 / 128 * (92 - 69.9) * 10) / 10, 'Brent differential ' + b.diff);
  ok(!r.players['joe'], 'unfinished player (Joe) left out');
  ok(r.players['jordia'] && r.players['jordia'].rating === 69.0 || r.players['jordia'], 'Jordia saved ' + JSON.stringify(r.players['jordia']));
  // stats: 4 diffs for Brent → lowest 1 minus 1
  await page.evaluate(() => document.querySelectorAll('.modal-overlay.active').forEach(m => m.classList.remove('active')));
  await page.evaluate(() => openPlayersScreen()); await page.waitForTimeout(150);
  const idx = await page.evaluate(() => handicapIndex(playerRounds('brent smith')));
  ok(idx === 10.0, 'Brent index from 4 rounds = lowest(11.0) - 1 = ' + idx);
  ok((await page.textContent('#players-list')).includes('10.0'), 'index shows on the players list');
  // import the old archived round
  await page.click('.older-rounds summary'); await page.click('text=Add older rounds from this phone'); await page.waitForTimeout(200);
  const m = await page.evaluate(() => window.__docs.player_history.rounds['555']?.players['mike davis']);
  ok(m && m.gross === 90 && m.tee === 'Black' && m.rating === 75.8, 'archived round imported using Mike\'s usual tees: ' + JSON.stringify(m));
  await page.click('text=Add older rounds from this phone'); await page.waitForTimeout(100);
  ok(Object.keys(await page.evaluate(() => window.__docs.player_history.rounds)).length === 5, 'import is not doubled');
  await page.click('.player-row:has-text("Brent")'); await page.waitForTimeout(150);
  ok((await page.textContent('#pl-stats')).includes('Rounds') && (await page.$$('.hist-row')).length === 4, 'player card shows stats and 4 rounds');
  await page.screenshot({ path: __dirname + '/shots/player-stats.png' });
  await browser.close();
  console.log(fails ? `${fails} FAILED` : 'ALL PASS'); process.exit(fails ? 1 : 0);
})();
