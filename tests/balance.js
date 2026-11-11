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
  const msgs = [];
  page.on('dialog', d => { msgs.push(d.message()); d.accept(); });
  await page.route('**/*', r => { const u = r.request().url();
    if (u.includes('gstatic')) return r.fulfill({ contentType: 'text/javascript', body: u.includes('app-compat') ? stub : '' });
    if (u.startsWith('http://app.test/')) return r.fulfill({ contentType: 'text/html', body: html });
    return r.abort(); });
  await page.addInitScript(() => {
    // index = the diff (3 identical rounds → lowest 1 minus 2)
    const idx = { 'al a': 2, 'bo b': 6, 'cy c': 10, 'di d': 14, 'ed e': 18, 'fy f': 22, 'gus g': 26 };
    const rounds = {};
    Object.entries(idx).forEach(([k, i]) => [1, 2, 3].forEach(n => { rounds[k + n] = { date: '2026-09-0' + n, courseKey: 'cleveland_cc', course: 'Cleveland Country Club', holes: 18, players: { [k]: { name: k, holes: 18, gross: 90, par: 72, diff: i + 2 } } }; }));
    const players = { 'al a': { name: 'Al A', tee: 'Silver' }, 'bo b': { name: 'Bo B', tee: 'Blue' } };
    Object.keys(idx).forEach(k => players[k] = players[k] || { name: k.replace(/\b\w/g, c => c.toUpperCase()), tee: 'White' });
    players['hal h'] = { name: 'Hal H', tee: 'White' };
    window.__docsInit = { saved_players: { players }, player_history: { rounds } };
  });
  await page.goto('http://app.test/'); await page.waitForTimeout(500); await page.evaluate(() => { if (document.getElementById('step-home')?.classList.contains('active')) showScreen('step-1'); });
  await page.selectOption('#course-selector', 'cleveland_cc');
  await page.evaluate(() => { document.getElementById('group-count').value = 2; document.getElementById('players-per-group').value = 4; });
  await page.click('#step-1 .bar-primary[onclick="goToStep2()"]');
  const names = ['Al A', 'Bo B', 'Cy C', 'Di D', 'Ed E', 'Fy F', 'Gus G', 'Hal H'];
  for (let i = 0; i < 8; i++) { const id = `#g${1 + Math.floor(i / 4)}-p${1 + i % 4}-name`; await page.fill(id, names[i]); await page.dispatchEvent(id, 'change'); }
  ok(await page.inputValue('#g1-p1-tee') === '', 'Al (usual Silver) is left blank on a course without Silver');
  ok(await page.inputValue('#g1-p2-tee') === 'Blue', 'Bo gets Blue');
  // add Silver from the picker
  await page.selectOption('#g1-p1-tee', '__add'); await page.waitForTimeout(200);
  ok(await page.isVisible('#tees-modal'), 'Add a tee opens Tees & ratings');
  const last = '#tees-rows .tee-edit-row:last-child';
  ok(await page.inputValue(`${last} .te-name`) === 'Silver', 'new row named after the player\'s usual tees');
  await page.fill(`${last} .te-yards`, '6000'); await page.fill(`${last} .te-rating`, '68.5'); await page.fill(`${last} .te-slope`, '120');
  await page.click('#tees-modal .btn-primary'); await page.waitForTimeout(200);
  ok(await page.inputValue('#g1-p1-tee') === 'Silver', 'Al now on Silver');
  ok((await page.$$eval('#g2-p1-tee option', o => o.map(x => x.value))).includes('Silver'), 'every picker has Silver now');
  ok(await page.evaluate(() => window.__docs.course_tees.courses.cleveland_cc.some(t => t.name === 'Silver' && t.slope === 120)), 'Silver saved for the course');
  await page.screenshot({ path: __dirname + '/shots/roster-balance-before.png' });
  // balance
  await page.click('text=Balance teams'); await page.waitForTimeout(300);
  ok(msgs.some(m => m.includes('Hal') && m.includes("group's average")), 'tells which players count as average');
  const tot = await page.$$eval('.team-total', e => e.map(x => x.textContent));
  console.log(tot);
  ok(tot[0] === '· ~41.6' && tot[1] === '· 43.6', 'team totals shown, ~ on the team with Hal (no number)');
  const teams = await page.evaluate(() => [1, 2].map(g => [1, 2, 3, 4].map(p => tempRosterCache[`g${g}-p${p}-name`])));
  console.log(JSON.stringify(teams));
  const totals = await page.evaluate(() => (msgs => msgs)(null));
  ok(teams.flat().sort().join() === names.slice().sort().join(), 'everyone still on a team');
  ok(await page.inputValue('#g1-p1-name') === teams[0][0] && await page.isVisible('#step-2'), 'roster redrawn with new teams');
  // tee/strokes travel with the player
  const alSlot = await page.evaluate(() => Object.keys(tempRosterCache).find(k => tempRosterCache[k] === 'Al A'));
  ok(await page.evaluate(k => tempRosterCache[k.replace('-name', '-tee')], alSlot) === 'Silver', 'Al keeps Silver after moving');
  await page.screenshot({ path: __dirname + '/shots/roster-balance-after.png' });
  // start round → tee remembered per course
  await page.click('#btn-step2-next'); await page.waitForTimeout(400);
  ok(await page.evaluate(() => window.__docs.saved_players.players['al a'].tees?.cleveland_cc === 'Silver'), 'Silver remembered for Al at Cleveland CC');
  await browser.close();
  console.log(fails ? `${fails} FAILED` : 'ALL PASS'); process.exit(fails ? 1 : 0);
})();
