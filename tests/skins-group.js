const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs = require('fs');
const stub = fs.readFileSync(__dirname + '/stub.js', 'utf8');
const html = fs.readFileSync(__dirname + '/../index.html', 'utf8');
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const pars = [5,4,4,4,4,3,5,4,3,5,4,4,3,5,4,4,3,4];
const teams = [['John','Joe','Mike','Jeff'], ['Jordia','Bart','Billy','Al']];
const skins = { 1: 'Jordia', 5: 'John', 11: 'Jordia', 13: 'Joe', 14: 'Joe', 15: 'Jordia', 16: 'Mike', 17: 'Billy', 18: 'Bart' };
const sdb = {};
teams.forEach((t, gi) => { sdb[gi+1] = {}; t.forEach((n, pi) => { sdb[gi+1][pi+1] = {}; for (let h = 1; h <= 18; h++) sdb[gi+1][pi+1][h] = pars[h-1] + (skins[h] === n ? -1 : 0); }); });
const doc = { isArchived: false, clipboards: {}, scoresDb: sdb,
  roundData: { course: { name: 'Cleveland CC', pars }, playMode: '18', startType: 'front', startHole: 1, endHole: 18, nineHoleType: 'nassau', roundId: 7, date: '2026-10-31',
    formats: [2], birdieRules: { 2: true }, betAmount: 20, skinsAmount: 15, isScrambled: false, currentHoles: { admin: 18 }, currentHole: 18,
    groups: teams.map((t, gi) => ({ id: gi+1, captain: t[0], color: ['#7ced7e', '#ff007f'][gi], players: t.map((n, pi) => ({ id: pi+1, name: n, strokeHoles: [] })) })),
    carts: teams.map((t, gi) => ({ id: gi+1, time: '08:00', players: t.map((n, pi) => ({ g: gi+1, p: pi+1 })) })) } };
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
  await page.route('**/*', r => { const u = r.request().url();
    if (u.includes('gstatic')) return r.fulfill({ contentType: 'text/javascript', body: u.includes('app-compat') ? stub : '' });
    if (u.startsWith('http://app.test/')) return r.fulfill({ contentType: 'text/html', body: html });
    return r.abort(); });
  await page.addInitScript(d => { window.__docsInit = { active_round: JSON.parse(d) }; }, JSON.stringify(doc));
  await page.goto('http://app.test/'); await page.waitForTimeout(400); await page.evaluate(() => { if (document.getElementById('step-home')?.classList.contains('active')) showScreen('step-1'); });
  await page.evaluate(() => { changeTheme('augusta'); viewDashboard(); }); await page.waitForTimeout(500);
  const rows = await page.$$eval('.skins-player', r => r.map(x => x.innerText.replace(/\s+/g, ' ').trim()));
  console.log(rows.join('\n'));
  ok(rows.length === 6, '6 players, one line each');
  ok(rows[0] === 'Jordia holes 1, 11, 15 3 × $13.33 = $40.00', 'Jordia first: ' + rows[0]);
  const payout = await page.evaluate(() => [...document.querySelectorAll('#step-dashboard .payout-row')].map(r => r.textContent.replace(/\s+/g, ' ')).find(t => t.startsWith('Jordia') && t.includes('skins')));
  ok(payout && payout.includes('skins $40.00'), 'matches Pay out from the pot: ' + payout);
  ok(rows[1] === 'Joe holes 13, 14 2 × $13.33 = $26.67', 'Joe second: ' + rows[1]);
  ok(rows.some(r => r === 'John hole 5 1 × $13.33 = $13.33'), 'single skin says "hole"');
  await page.evaluate(() => { const h = [...document.querySelectorAll('.payout-header')].find(x => x.textContent.startsWith('Skins')); window.scrollTo(0, h.getBoundingClientRect().top + scrollY - 20); });
  await page.waitForTimeout(200);
  await page.screenshot({ path: __dirname + '/shots/skins-grouped.png', clip: { x: 0, y: 0, width: 390, height: 420 } });
  await page.evaluate(() => openResultsShareModal());
  const t = await page.inputValue('#share-text-content');
  const sk = t.split('\nSkins')[1].split('\n\n')[0];
  console.log('TEXT:' + sk);
  ok(sk.includes('Jordia: holes 1, 11, 15 = $40.00') && sk.includes('Mike: hole 16 = $13.33'), 'results text grouped too');
  await browser.close();
  console.log(fails ? `${fails} FAILED` : 'ALL PASS'); process.exit(fails ? 1 : 0);
})();
