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
  await page.addInitScript(() => { if (sessionStorage.getItem('s')) return; sessionStorage.setItem('s', 1);
    // an empty round finalized with no scores: everyone "lost" their buy-in
    window.__docsInit = { player_history: { rounds: { empty1: { date: '2026-10-28', at: 1, course: 'X', players: {}, money: { 'al': { name: 'Al', games: -12000, om: 0 }, 'bo': { name: 'Bo', games: -12000, om: 0 } } } } } }; });
  const pin = async () => { await page.waitForTimeout(150); for (const d of '1234') await page.click(`.pin-pad button:text-is("${d}")`); await page.waitForTimeout(300); };
  await page.goto('http://app.test/'); await page.waitForTimeout(500);
  // an empty round: finalize with no scores → no money recorded
  await page.click('.home-new');
  await page.evaluate(() => { document.getElementById('group-count').value = 2; document.getElementById('players-per-group').value = 2; document.getElementById('fmt-3').checked = false; });
  await page.click('#step-1 .bar-primary[onclick="goToStep2()"]');
  await page.fill('#g1-p1-name', 'Al'); await page.fill('#g1-p2-name', 'Cy'); await page.fill('#g2-p1-name', 'Bo'); await page.fill('#g2-p2-name', 'Di'); await page.evaluate(() => saveRosterCache());
  await page.click('#btn-step2-next'); await page.waitForTimeout(400);
  page.evaluate(() => validateAndFinalize()); await pin(); await page.evaluate(() => { closeShareModal(); document.getElementById('text-modal').classList.remove('active'); });
  let hist = await page.evaluate(() => window.__docs.player_history.rounds);
  let emptyId = Object.keys(hist).find(k => k !== 'empty1');
  ok(!hist[emptyId] || !Object.keys(hist[emptyId].money || {}).length, 'round with no scores records no money');
  // a real round: Al wins everything
  await page.click('.home-new');
  await page.evaluate(() => { document.getElementById('group-count').value = 2; document.getElementById('players-per-group').value = 2; document.getElementById('fmt-3').checked = false; });
  await page.click('#step-1 .bar-primary[onclick="goToStep2()"]');
  await page.fill('#g1-p1-name', 'Al'); await page.fill('#g1-p2-name', 'Cy'); await page.fill('#g2-p1-name', 'Bo'); await page.fill('#g2-p2-name', 'Di'); await page.evaluate(() => saveRosterCache());
  await page.click('#btn-step2-next'); await page.waitForTimeout(400);
  await page.evaluate(() => { roundData.groups.forEach((g, i) => g.players.forEach(p => roundData.course.pars.forEach((par, h) => { scoresDb[g.id][p.id] = scoresDb[g.id][p.id] || {}; scoresDb[g.id][p.id][h+1] = par + i; }))); });
  page.evaluate(() => validateAndFinalize()); await pin(); await page.evaluate(() => { closeShareModal(); document.getElementById('text-modal').classList.remove('active'); });
  hist = await page.evaluate(() => window.__docs.player_history.rounds);
  const realId = Object.keys(hist).find(k => hist[k].money && hist[k].money.al && hist[k].money.al.games > 0);
  ok(!!realId, 'real round money recorded: ' + JSON.stringify(realId && hist[realId].money));
  // pretend it was finalized before the ledger: drop its money; and the players were later renamed with last names
  await page.evaluate(id => {
    delete roundHistory[id].money; delete window.__docs.player_history.rounds[id].money;
    localStorage.setItem('roundHistory', JSON.stringify(roundHistory));
    delete savedPlayers['al']; delete savedPlayers['bo'];
    savedPlayers['al adams'] = { name: 'Al Adams', first: 'Al', last: 'Adams' }; savedPlayers['bo brown'] = { name: 'Bo Brown', first: 'Bo', last: 'Brown' };
  }, realId);
  await page.click('.home-tile:has-text("Money")'); await page.waitForTimeout(800);
  const rows = await page.$$eval('.money-row .dash-row-line', e => e.map(x => x.textContent.replace(/\s+/g, ' ').trim()));
  console.log(rows);
  ok(rows.length === 4 && rows[0].startsWith('Al Adams') && rows[0].includes('+$') && rows.some(r => r.startsWith('Bo Brown') && r.includes('−$')), 'backfilled from the saved round, matched to full names, empty rounds ignored');
  ok(await page.evaluate(id => !!window.__docs.player_history.rounds[id].money, realId), 'backfilled money saved');
  await page.screenshot({ path: __dirname + '/shots/money-fixed.png' });
  // keep a round but leave it out of the totals
  await page.click('#step-money .back-link-top'); await page.click('.home-tile:has-text("Past rounds")'); await page.waitForTimeout(300);
  const idx = await page.evaluate(id => archiveRows.findIndex(r => r.id === id), realId);
  await page.evaluate(i => showArchivedCard(i), idx); await page.waitForTimeout(300);
  ok(await page.isVisible('#archived-counts') && await page.isChecked('#archived-counts-switch'), 'past round shows "Count in money & stats", on');
  const statsBefore = await page.evaluate(() => playerRounds('al adams').length + playerRounds('al').length);
  await page.click('#archived-counts-switch'); await page.waitForTimeout(150);
  ok(await page.evaluate(id => window.__docs.player_history.rounds[id].excluded === true && !!window.__docs.player_history.rounds[id].players, realId), 'switched off: saved as not counted, round kept');
  ok((await page.innerText('#archived-counts-note')).includes('Not counted'), 'note says not counted');
  await page.evaluate(() => document.getElementById('archived-counts').scrollIntoView({ block: 'center' })); await page.screenshot({ path: __dirname + '/shots/not-counted.png' });
  ok(await page.evaluate(() => playerRounds('al adams').length + playerRounds('al').length) === statsBefore - 1, 'left out of player stats');
  await page.click('#archived-top .back-link-top'); await page.waitForTimeout(200);
  ok((await page.innerText('#archive-list-container')).includes('Not counted'), 'Past rounds list tags it Not counted');
  await page.click('#step-8 button:has-text("Home")'); await page.click('.home-tile:has-text("Money")'); await page.waitForTimeout(300);
  ok((await page.innerText('#money-list')).includes('No money rounds yet'), 'left out of money: ' + (await page.innerText('#money-list')).slice(0, 80));
  await page.click('#step-money .back-link-top'); await page.click('.home-tile:has-text("Past rounds")'); await page.waitForTimeout(300);
  await page.evaluate(i => showArchivedCard(i), idx); await page.waitForTimeout(300);
  await page.click('#archived-counts-switch'); await page.waitForTimeout(150);
  ok(await page.evaluate(id => !('excluded' in window.__docs.player_history.rounds[id]), realId), 'switched back on: counted again');
  await page.click('#archived-top .back-link-top'); await page.click('#step-8 button:has-text("Home")'); await page.click('.home-tile:has-text("Money")'); await page.waitForTimeout(300);
  ok((await page.innerText('#money-list')).includes('Al Adams'), 'back in the money totals');
  // deleting the round removes it from money too
  await page.click('#step-money .back-link-top'); await page.click('.home-tile:has-text("Past rounds")'); await page.waitForTimeout(300);
  const n = (await page.$$('.archive-item')).length;
  await page.check('.archive-item:first-child .archive-checkbox'); page.click('#bulk-delete-btn'); await pin();
  ok(!(await page.evaluate(id => window.__docs.player_history.rounds[id], realId)), 'deleting a past round removes it from history and money');
  await browser.close();
  console.log(fails ? `${fails} FAILED` : 'ALL PASS'); process.exit(fails ? 1 : 0);
})();
