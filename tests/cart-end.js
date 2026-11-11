let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs = require('fs');
const stub = fs.readFileSync(__dirname + '/stub.js', 'utf8');
const html = fs.readFileSync(__dirname + '/../index.html', 'utf8');
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const pars = [5,4,4,4,4,3,5,4,3,5,4,4,3,5,4,4,3,4];
  const sc = {}; for (let h = 1; h <= 17; h++) sc[h] = 4;
  const doc = { isArchived: false, clipboards: {}, scoresDb: { 1: { 1: { ...sc }, 2: { ...sc } }, 2: { 1: { ...sc, 18: 4 }, 2: { ...sc, 18: 4 } } },
    roundData: { course: { name: 'Cleveland CC', pars }, playMode: '18', startType: 'front', startHole: 1, endHole: 18, nineHoleType: 'nassau', roundId: 1, date: '2026-10-31',
      formats: [2], birdieRules: { 2: true }, betAmount: 20, skinsAmount: 10, isScrambled: false, currentHoles: { admin: 18, 1: 18, 2: 18 }, currentHole: 18,
      groups: [1, 2].map(g => ({ id: g, captain: 'P' + g, color: '#fff', players: [{ id: 1, name: 'A' + g, strokeHoles: [] }, { id: 2, name: 'B' + g, strokeHoles: [] }] })),
      carts: [1, 2].map(g => ({ id: g, time: '08:00', players: [{ g, p: 1 }, { g, p: 2 }] })) } };
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.on('pageerror', e => console.log('PAGE ERROR', e.message));
  page.on('dialog', d => { console.log('dialog:', d.message()); d.accept(); });
  await page.route('**/*', r => { const u = r.request().url();
    if (u.includes('gstatic')) return r.fulfill({ contentType: 'text/javascript', body: u.includes('app-compat') ? stub : '' });
    if (u.startsWith('http://app.test/')) return r.fulfill({ contentType: 'text/html', body: html });
    return r.abort(); });
  await page.addInitScript(d => { window.__docsInit = { active_round: JSON.parse(d) }; }, JSON.stringify(doc));
  if (!doc.roundData.roundId) doc.roundData.roundId = 4242;
  await page.addInitScript(d => { window.__docsInit = { active_round: JSON.parse(d) }; }, JSON.stringify(doc));
  await page.goto('http://app.test/?cart=1&r=' + doc.roundData.roundId); await page.waitForTimeout(400);
  console.log('screen', await page.evaluate(() => document.querySelector('.screen.active').id));
  await page.click('.hole-row:last-child, [onclick="openHoleForScoring(18)"]').catch(e => console.log('no 18 row', e.message.slice(0,80)));
  await page.waitForTimeout(200);
  for (let i = 0; i < 2; i++) { await page.click('.score-keypad button:text-is("4")'); await page.waitForTimeout(150); }
  await page.waitForTimeout(500);
  console.log('after 18 screen:', await page.evaluate(() => document.querySelector('.screen.active').id));
  console.log('title:', await page.innerText('#dashboard-title').catch(() => ''));
  await page.click('text=BACK TO SCORING'); await page.waitForTimeout(200);
  console.log('back:', await page.evaluate(() => document.querySelector('.screen.active').id));
  // Admin finalizes
  await page.evaluate(() => window.__externalUpdate(['isArchived'], true));
  await page.evaluate(() => window.__externalUpdate(['archivedAt'], Date.now()));
  await page.waitForTimeout(300);
  ok(await page.evaluate(() => document.querySelector('.screen.active').id) === 'step-dashboard', 'after finalize the cart sees the results');
  ok((await page.innerText('#dashboard-title')) === 'Final results', 'title says Final results');
  ok(!(await page.isVisible('.back-to-scoring')) && !(await page.isVisible('text=Share results')), 'no scoring / share buttons');
  ok((await page.textContent('#dashboard-more')).includes('A1'), 'scorecards shown');
  await page.screenshot({ path: __dirname + '/shots/cart-after-final.png' });
  // After 48 hours
  await page.evaluate(() => window.__externalUpdate(['archivedAt'], Date.now() - 49 * 3600 * 1000)); await page.waitForTimeout(300);
  ok(await page.evaluate(() => document.querySelector('.screen.active').id) === 'step-dead-link', 'after 48 hours: round complete page');
  // Admin starts a new round: cart gets scoring back with buttons
  await page.evaluate(() => window.__externalUpdate(['isArchived'], false)); await page.waitForTimeout(300);
  ok(await page.evaluate(() => document.querySelector('.screen.active').id) === 'step-3', 'new round: back to scoring');
  await page.evaluate(() => viewDashboard()); await page.waitForTimeout(100);
  ok(await page.isVisible('.back-to-scoring'), 'buttons are back on standings');
  ok((await page.innerText('#dashboard-title')) === 'Standings', 'title back to Standings');
  await browser.close();
  console.log(fails ? `${fails} FAILED` : 'ALL PASS'); process.exit(fails ? 1 : 0);
})();
