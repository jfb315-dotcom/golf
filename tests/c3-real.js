const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs = require('fs');
const stub = fs.readFileSync(__dirname + '/stub.js', 'utf8');
const html = fs.readFileSync(__dirname + '/../index.html', 'utf8');
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const pars = [5,4,4,4,4,3,5,4,3,5,4,4,3,5,4,4,3,4];
const doc = { isArchived: false, clipboards: {}, scoresDb: { 1: { 1: { 1: 5 }, 2: {} }, 2: { 1: {}, 2: {} } },
  roundData: { course: { name: 'Cleveland CC', pars }, playMode: '18', startType: 'front', startHole: 1, endHole: 18, nineHoleType: 'nassau', roundId: 7, date: '2026-10-31',
    formats: [2], birdieRules: { 2: true }, betAmount: 20, skinsAmount: 10, isScrambled: false, currentHoles: { admin: 1, 1: 1, 2: 1 }, currentHole: 1,
    groups: [[1, 'Brent', 'John'], [2, 'Jordia', 'Mike']].map(([g, a, b]) => ({ id: g, captain: a, color: '#fff', players: [{ id: 1, name: a, strokeHoles: [] }, { id: 2, name: b, strokeHoles: [] }] })),
    carts: [1, 2].map(g => ({ id: g, time: '08:00', players: [{ g, p: 1 }, { g, p: 2 }] })) } };
(async () => {
  if (typeof doc !== 'undefined' && doc.roundData && !doc.roundData.roundId) doc.roundData.roundId = 4242;
  const RID = (typeof doc !== 'undefined' && doc.roundData) ? doc.roundData.roundId : '';
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const shots = [];
  for (const [q, name, theme] of [['', 'admin', null], ['?cart=1&r=' + RID, 'cart', null], ['', 'clubhouse', 'clubhouse'], ['', 'augusta', 'augusta']]) {
    const page = await browser.newPage({ viewport: { width: 390, height: 760 }, deviceScaleFactor: 2 });
    page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
    await page.route('**/*', r => { const u = r.request().url();
      if (u.includes('gstatic')) return r.fulfill({ contentType: 'text/javascript', body: u.includes('app-compat') ? stub : '' });
      if (u.startsWith('http://app.test/')) return r.fulfill({ contentType: 'text/html', body: html });
      return r.abort(); });
    await page.addInitScript(d => { window.__docsInit = { active_round: JSON.parse(d) }; }, JSON.stringify(doc));
    await page.goto('http://app.test/' + q); await page.waitForTimeout(500); await page.evaluate(() => { if (document.getElementById('step-home')?.classList.contains('active')) showScreen('step-1'); });
    if (theme) { await page.evaluate(t => { const s = document.getElementById('app-theme-selector'); s.value = t; changeTheme(); }, theme); await page.waitForTimeout(1500); }
    if (name === 'cart') { await page.evaluate(() => openHoleForScoring(1)); await page.waitForTimeout(200); }
    await page.evaluate(() => document.querySelectorAll('.alerts-banner').forEach(e => e.style.display = 'none'));
    const info = await page.evaluate(() => ({ wm: document.querySelector('.hole-watermark')?.innerText.replace(/\n/g, ' '), par: document.querySelector('.score-keypad .par-key')?.textContent,
      fits: (() => { const d = document.querySelector('.hole-detail').getBoundingClientRect(), w = document.querySelector('.hole-watermark').getBoundingClientRect(); return w.top >= d.top - 1 && w.bottom <= d.bottom + 1; })() }));
    const adminTab = name !== 'cart';
    if (adminTab) info.wmHidden = await page.evaluate(() => getComputedStyle(document.querySelector('.hole-watermark')).display === 'none');
    ok(adminTab ? (info.wmHidden && info.par === '5') : (info.wm === 'HOLE 1 PAR 5' && info.par === '5' && info.fits), `${name}: watermark "${info.wm}", par key ${info.par}, fits in box ${info.fits}`);
    await page.screenshot({ path: __dirname + `/looks/real-${name}.png` }); shots.push(name);
    await page.close();
  }
  await browser.close();
  console.log(fails ? `${fails} FAILED` : 'ALL PASS'); process.exit(fails ? 1 : 0);
})();
