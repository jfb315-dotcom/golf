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
  const msgs = []; page.on('dialog', d => { msgs.push(d.message()); d.accept(); });
  await page.route('**/*', r => { const u = r.request().url();
    if (u.includes('gstatic')) return r.fulfill({ contentType: 'text/javascript', body: u.includes('app-compat') ? stub : '' });
    if (u.startsWith('http://app.test/')) return r.fulfill({ contentType: 'text/html', body: html });
    return r.abort(); });
  await page.addInitScript(() => { if (!window.__docsInit) window.__docsInit = {}; });
  await page.goto('http://app.test/'); await page.waitForTimeout(500); await page.evaluate(() => { if (document.getElementById('step-home')?.classList.contains('active')) showScreen('step-1'); });
  const pin = async () => { await page.waitForSelector('#pin-modal.active, #pin-modal[style*="flex"]', { state: 'attached' }).catch(() => {}); await page.waitForTimeout(150); for (const d of '1234') await page.click(`.pin-pad button:text-is("${d}")`); await page.waitForTimeout(300); };
  await page.selectOption('#course-selector', 'cleveland_cc');
  await page.evaluate(() => { document.getElementById('group-count').value = 3; document.getElementById('players-per-group').value = 2; document.getElementById('fmt-3').checked = false; });
  await page.click('#step-1 .bar-primary[onclick="goToStep2()"]');
  ok(JSON.stringify(await page.$$eval('[id$="-time"]', e => e.filter(x => /^g\d-time$/.test(x.id)).map(x => x.value))) === '["08:00","08:10","08:20"]', 'tee times default 10 minutes apart');
  await page.fill('#g2-time', '09:05'); await page.dispatchEvent('#g2-time', 'change');
  ok(await page.inputValue('#g3-time') === '09:15' && await page.inputValue('#g1-time') === '08:00', 'changing team 2 moves team 3 only');
  const names = ['Al A','Bo B','Cy C','Di D','Ed E','Fy F'];
  for (let i = 0; i < 6; i++) await page.fill(`#g${1 + Math.floor(i/2)}-p${1 + i%2}-name`, names[i]);
  await page.evaluate(() => saveRosterCache());
  await page.click('#btn-step2-next'); await page.waitForTimeout(500);
  // scores: everyone pars every hole
  await page.evaluate(() => { roundData.groups.forEach(g => g.players.forEach(p => roundData.course.pars.forEach((par, i) => { scoresDb[g.id][p.id] = scoresDb[g.id][p.id] || {}; scoresDb[g.id][p.id][i+1] = par; }))); 
    const all = roundData.groups.flatMap(g => g.players.map(p => [g.id, p.id])); for (let h = 1; h <= 18; h++) saveScoresToCloud(all, h); });
  await page.waitForTimeout(300);
  ok(Object.keys(await page.evaluate(() => window.__doc.pace?.['1'] || {})).length === 18, 'pace recorded for every hole of cart 1');
  // change Al's 3rd hole
  await page.evaluate(() => { let g = roundData.groups[0], p = g.players[0]; scoresDb[g.id][p.id][3] = 7; saveScoresToCloud([[g.id, p.id]], 3); });
  await page.waitForTimeout(300);
  const log = Object.values(await page.evaluate(() => window.__doc.scoreLog || {}));
  ok(log.length === 1 && log[0].to === 7 && log[0].by === 'Admin' && log[0].hole === 3, 'score change logged: ' + JSON.stringify(log));
  // pace: pretend cart 2 teed off at 09:05 and finished 6 holes 84 minutes later
  await page.evaluate(() => { const d = new Date(); d.setHours(9, 5, 0, 0); const t = d.getTime(); const pace = {}; for (let h = 1; h <= 6; h++) pace[h] = t + h * 14 * 60000;
    window.__externalUpdate(['pace'], { 2: pace }); window.__externalUpdate(['roundData', 'carts'], window.__doc.roundData.carts.map(c => c.id === 2 ? { ...c, time: '09:05' } : c));
    const g = window.__doc.scoresDb['2']; Object.keys(g).forEach(p => { for (let h = 7; h <= 18; h++) delete g[p][h]; }); window.__externalUpdate(['scoresDb', '2'], g); });
  await page.waitForTimeout(300);
  await page.evaluate(() => viewDashboard()); await page.waitForTimeout(300);
  const pace = await page.$$eval('.dash-pace', e => e.map(x => x.textContent));
  console.log(pace);
  ok(pace.some(t => t.startsWith('14 min/hole · on pace for 4h 12m · done ~')), 'cart 2 pace: 14 min/hole, 4h 12m, finish time');
  ok((await page.textContent('#dashboard-changes')).includes('See score changes (1)'), 'standings lists score changes');
  await page.click('details[data-fold="live-changes"] > summary');
  await page.screenshot({ path: __dirname + '/shots/pace-changes.png', fullPage: false });
  await page.evaluate(() => document.querySelector('#dashboard-cart-progress').scrollIntoView());
  await page.screenshot({ path: __dirname + '/shots/pace.png' });
  // finalize (everyone finished)
  await page.evaluate(() => { roundData.groups.forEach(g => g.players.forEach(p => roundData.course.pars.forEach((par, i) => { scoresDb[g.id][p.id][i+1] = scoresDb[g.id][p.id][i+1] || par; }))); });
  page.evaluate(() => validateAndFinalize()); await pin(); await page.waitForTimeout(400);
  await page.evaluate(() => document.querySelectorAll('.modal-overlay.active').forEach(m => m.classList.remove('active')));
  const docs = await page.evaluate(() => window.__docs);
  const id = Object.keys(docs.archive_index?.rounds || {})[0];
  ok(id && docs['archive_' + id]?.scoresDb && docs['archive_' + id].scoreLog, 'finalized round backed up to Firebase (index + full round)');
  const money = docs.player_history.rounds[id]?.money;
  ok(money && Object.keys(money).length === 6, 'money saved for the ledger: ' + JSON.stringify(money));
  // reopen
  await page.click('.home-tile:has-text("Past rounds")'); await page.waitForTimeout(300); await page.click('.archive-item button'); await page.waitForTimeout(300);
  ok(await page.isVisible('#reopen-archived'), 'Reopen offered on the last round in Past rounds');
  await page.screenshot({ path: __dirname + '/shots/reopen.png' });
  page.click('#reopen-archived'); await pin(); await page.waitForTimeout(500);
  ok(await page.evaluate(() => window.__doc.isArchived === false) && await page.isVisible('#step-3'), 'round reopened and back on scoring');
  ok(!(await page.evaluate(() => reopenable)), 'nothing to reopen while live');
  // finalize again → same archive id, not doubled
  page.evaluate(() => validateAndFinalize()); await pin(); await page.waitForTimeout(400);
  await page.evaluate(() => document.querySelectorAll('.modal-overlay.active').forEach(m => m.classList.remove('active')));
  ok(Object.keys(await page.evaluate(() => window.__docs.archive_index.rounds)).length === 1 && await page.evaluate(() => JSON.parse(localStorage.getItem('tournamentArchive')).length) === 1, 're-finalize replaces the round, no duplicate');
  // money screen
  await page.evaluate(() => showScreen('step-home')); await page.click('.home-tile:has-text("Money")'); await page.waitForTimeout(200);
  const rows = await page.$$eval('.money-row', e => e.map(x => x.querySelector('.dash-row-line').textContent.replace(/\s+/g, ' ').trim()));
  console.log(rows);
  ok(rows.length === 6, 'money ledger lists 6 players');
  await page.click('.money-row'); await page.screenshot({ path: __dirname + '/shots/money.png' });
  page.click('#money-settle'); await pin(); await page.waitForTimeout(300);
  ok((await page.$$('.money-row')).length === 0 && await page.evaluate(() => window.__docs.ledger.settledAt > 0), 'settle up clears the season');
  await page.click('#money-range button[data-range="all"]');
  ok((await page.$$('.money-row')).length === 6, 'all time still has them');
  // archive from cloud only (wipe local) and delete
  await page.evaluate(() => { localStorage.removeItem('tournamentArchive'); localStorage.removeItem('archiveIndex'); showScreen('step-home'); });
  await page.click('#btn-archive'); await page.waitForTimeout(300);
  ok((await page.$$('.archive-item')).length === 1, 'archive list loads from Firebase with phone copy gone');
  await page.click('.archive-item button'); await page.waitForTimeout(400);
  ok(await page.isVisible('#step-9') && (await page.textContent('#step-9')).includes('Al'), 'archived round opens from Firebase');
  await page.click('#step-9 .btn-secondary'); 
  await page.check('.archive-checkbox'); page.click('#bulk-delete-btn'); await pin(); await page.waitForTimeout(300);
  ok(!(await page.evaluate(() => Object.keys(window.__docs).some(k => k.startsWith('archive_') && k !== 'archive_index'))) && Object.keys(await page.evaluate(() => window.__docs.archive_index.rounds)).length === 0, 'delete removes it from Firebase');
  await browser.close();
  console.log(fails ? `${fails} FAILED` : 'ALL PASS'); process.exit(fails ? 1 : 0);
})();
