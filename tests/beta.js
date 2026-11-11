// Test copy: ?beta=1 has the new scoring look, keeps its rounds and phone storage apart, no alerts; ?beta=0 leaves
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs = require('fs');
const stub = fs.readFileSync(__dirname + '/stub.js', 'utf8');
const html = fs.readFileSync(__dirname + '/../index.html', 'utf8');
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage(); page.setDefaultTimeout(6000);
  page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; }); page.on('dialog', d => d.accept());
  await page.route('**/*', r => { const u = r.request().url();
    if (u.includes('gstatic')) return r.fulfill({ contentType: 'text/javascript', body: u.includes('app-compat') ? stub : '' });
    if (u.startsWith('http://app.test/')) return r.fulfill({ contentType: 'text/html', body: html });
    return r.abort(); });
  await page.addInitScript(() => { if (!window.__docsInit) window.__docsInit = { saved_players: { players: { 'al adams': { name: 'Al Adams', first: 'Al', last: 'Adams' } } }, active_round: { roundData: { roundId: 111, course: { name: 'Real', pars: Array(18).fill(4) }, groups: [], carts: [], formats: [] }, scoresDb: {}, isArchived: true, archivedAt: 1 } }; });
  // real app first: a real roster draft on this phone
  await page.goto('http://app.test/'); await page.waitForTimeout(400);
  ok(!(await page.isVisible('.beta-banner')) && !(await page.evaluate(() => document.documentElement.classList.contains('revamp'))), 'real app: no test banner, old look');
  await page.evaluate(() => localStorage.setItem('jbGolfRosterCache', JSON.stringify({ 'g1-p1-name': 'REAL DRAFT' })));
  // test copy
  await page.goto('http://app.test/?beta=1'); await page.waitForTimeout(500);
  ok(await page.isVisible('.beta-banner') && (await page.innerText('.beta-banner')).includes('TEST COPY'), 'test copy: banner shows');
  ok(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--bg-dark').trim()) === '#0d211a', 'test copy: fairway colours');
  ok(await page.evaluate(() => ALERTS_URL === ''), 'test copy: alerts off');
  ok(await page.evaluate(() => !localStorage.getItem('jbGolfRosterCache')), 'test copy does not see the real roster draft');
  await page.evaluate(() => { showScreen('step-1'); document.getElementById('group-count').value = 2; document.getElementById('players-per-group').value = 2; });
  await page.click('text=Next: games & money'); await page.click('text=Next: players & teams');
  for (const [id, n] of [['g1-p1','Al Adams'],['g1-p2','Bo Brown'],['g2-p1','Ed Eads'],['g2-p2','Fy Fox']]) await page.fill(`#${id}-name`, n);
  await page.evaluate(() => saveRosterCache());
  await page.click('text=Next: extras & review'); await page.click('#btn-step2-next'); await page.waitForTimeout(400);
  const docs = await page.evaluate(() => ({ beta: !!window.__docs.beta_active_round?.roundData?.groups?.length, real: window.__docs.active_round.roundData.roundId }));
  ok(docs.beta && docs.real === 111, 'test round saved as beta_active_round; the real round is untouched');
  // new scoring look
  ok(await page.isVisible('#rv-bar') && await page.isVisible('#admin-hole-strip') && await page.isVisible('.rv-avatar'), 'scoring: bottom bar, hole strip, player initials');
  ok(!(await page.isVisible('#admin-share-btn-container')), 'scoring: old menu list moved into the round menu');
  ok(await page.evaluate(() => document.getElementById('rv-undo').disabled), 'undo greyed out before any score');
  await page.click('.score-keypad button:text-is("4")'); await page.waitForTimeout(100);
  await page.click('.score-keypad button:text-is("5")'); await page.waitForTimeout(100);
  await page.screenshot({ path: __dirname + '/shots/beta-scoring.png' });
  ok(await page.evaluate(() => !document.getElementById('rv-undo').disabled), 'undo ready after a score');
  const h = await page.evaluate(() => roundData.currentHole);
  await page.click('.rv-bar-main'); await page.waitForTimeout(200);
  ok(await page.evaluate(() => roundData.currentHole) === h + 1, 'Next hole moves on');
  await page.click('#rv-menu-btn'); await page.waitForTimeout(150);
  const menu = await page.innerText('#rv-menu');
  ok(/Standings/.test(menu) && /Share & message/.test(menu) && /Add side bet/.test(menu) && /Edit setup/.test(menu) && /Finalize round/.test(menu), 'round menu has standings, share, side bet, edit, finalize');
  await page.screenshot({ path: __dirname + '/shots/beta-menu.png' });
  await page.click('#rv-menu >> text=Standings'); await page.waitForTimeout(200);
  ok(await page.isVisible('#step-dashboard') && !(await page.isVisible('#rv-bar')), 'Standings opens; the bar is only on scoring');
  ok(await page.evaluate(() => /beta=1/.test(shareUrl('live.html', 'spectator=true'))), 'links made in the test copy open the test copy');
  // phone storage kept apart
  ok(await page.evaluate(() => { let raw = Object.keys(window.localStorage); return raw.some(k => k.startsWith('beta:')) && JSON.parse(Storage.prototype.getItem.call(localStorage, 'jbGolfRosterCache') || 'null') !== null; }), 'test copy saves under beta: names');
  // leave
  await page.click('.beta-banner button'); await page.waitForTimeout(600);
  ok(!(await page.isVisible('.beta-banner')) && await page.evaluate(() => JSON.parse(localStorage.getItem('jbGolfRosterCache'))['g1-p1-name']) === 'REAL DRAFT', 'Leave: back to the real app, real draft intact');
  await browser.close();
  console.log(fails ? `${fails} FAILED` : 'ALL PASS'); process.exit(fails ? 1 : 0);
})();
