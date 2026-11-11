// Our Match on Standings: trending + money on top; buttons for 1st ball, Nassau, Scorecards; presses (Undo) folded at the bottom
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs = require('fs');
const stub = fs.readFileSync(__dirname + '/stub.js', 'utf8');
const html = fs.readFileSync(__dirname + '/../index.html', 'utf8');
const tag = process.argv[2] || 'now';
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 }); page.setDefaultTimeout(5000);
  page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; }); page.on('dialog', d => d.accept());
  await page.route('**/*', r => { const u = r.request().url();
    if (u.includes('gstatic')) return r.fulfill({ contentType: 'text/javascript', body: u.includes('app-compat') ? stub : '' });
    if (u.startsWith('http://app.test/')) return r.fulfill({ contentType: 'text/html', body: html });
    return r.abort(); });
  await page.addInitScript(() => { window.__docsInit = {}; });
  await page.goto('http://app.test/?beta=1'); await page.waitForTimeout(400);
  await page.evaluate(() => { changeTheme('fairway'); startNewRound('om'); });
  await page.evaluate(() => goToStep2()); await page.evaluate(() => rvPage('step-2', 3));
  for (const [id, n] of [['g1-p1','John Bischof'],['g1-p2','Brent Copeland'],['g2-p1','Jordia Smith'],['g2-p2','Andy Anderson']]) await page.fill(`#${id}-name`, n);
  await page.evaluate(() => saveRosterCache());
  await page.evaluate(() => rvPage('step-2', 4)); await page.click('#btn-step2-next'); await page.waitForTimeout(300);
  // 12 holes played (over par for John, Brent, Jordia, Andy); John & Brent pressed the back after 11
  await page.evaluate(() => {
    const over = [[0,1,1,0],[1,0,1,1],[-1,1,0,1],[0,0,1,0],[1,1,0,2],[0,1,0,0],[0,0,1,1],[-1,0,0,1],[1,2,0,1],
                  [1,1,0,0],[1,0,0,1],[0,1,-1,1]];
    let who = [[1,1],[1,2],[2,1],[2,2]];
    for (let h = 1; h <= 12; h++) { who.forEach(([g, p], i) => { scoresDb[g][p][h] = roundData.course.pars[h - 1] + over[h - 1][i]; }); saveScoresToCloud(who, h); }
    matchPresses = { back: { A: 11 } }; activeTournamentRef.update({ matchPresses });
    viewDashboard(); window.scrollTo(0, 0);
    let bts = document.querySelector('.back-to-scoring'); if (bts) bts.style.visibility = 'hidden';
  });
  await page.waitForTimeout(300);
  const tabs = await page.$$eval('#om-tabs button span', b => b.map(x => x.textContent));
  ok(JSON.stringify(tabs) === '["1st ball → 2nd","Nassau","Scorecards"]', 'three buttons: ' + tabs.join(' | '));
  ok(await page.evaluate(() => [...document.querySelectorAll('.om-tab-pane')].every(p => p.hidden)), 'nothing open until tapped');
  ok(!(await page.$('details[data-fold="om-nassau-bets"]')) && !(await page.$('details[data-fold="om-nassau-holes"]')) && !(await page.$('details[data-fold="om-balls"]')), 'old Nassau / 1st ball dropdowns gone');
  ok(!(await page.isVisible('details[data-fold="live-rules"]')) && !(await page.isVisible('details[data-fold="live-cards"]')), 'no rules dropdown, no separate scorecards dropdown');
  ok(await page.isVisible('details[data-fold="om-presses"]') && !(await page.isVisible('.om-press-made')), 'presses made: folded at the bottom');
  const shot = async name => { const h = await page.evaluate(() => document.documentElement.scrollHeight); await page.setViewportSize({ width: 390, height: Math.min(h, 6000) }); await page.screenshot({ path: __dirname + `/shots/omtabs-${name}-${tag}.png` }); await page.setViewportSize({ width: 390, height: 844 }); };
  await shot('closed');
  await page.click('#om-tabs button:has-text("1st ball → 2nd")'); await page.waitForTimeout(100);
  const heads = (await page.$$eval('.om-tab-pane[data-tab="balls"] .om-head b', x => x.map(e => e.textContent))).filter(t => t.startsWith('1st'));
  ok(/Back 9/.test(heads[0]) && /Front 9/.test(heads[1]), 'during the back nine, Back 9 comes first: ' + heads.join(' | '));
  ok(await page.isVisible('.om-tab-pane[data-tab="balls"] .om-tab-top') && (await page.textContent('.om-tab-pane[data-tab="balls"] .om-tab-top')) === '↑ Pick another view', 'a Pick another view button at the end');
  ok(await page.evaluate(() => [...document.querySelectorAll('.om-tab-pane[data-tab="balls"] td, .om-tab-pane[data-tab="balls"] td *')].every(e => { let c = getComputedStyle(e).color; return c === getComputedStyle(document.querySelector('.om-tab-pane td')).color; })), 'no colour coding in the charts');
  ok(await page.$$eval('.om-tab-pane[data-tab="balls"] .om-win', x => x.length) > 0, 'winning scores in bold');
  ok(await page.isVisible('.om-tabs-label') && (await page.textContent('.om-tabs-label')) === 'Tap to see the details' && (await page.textContent('#om-tabs button.on i')) === '▴', 'heading over the buttons; the open one shows ▴');
  await page.evaluate(() => { let b = document.querySelector('.back-to-scoring'); if (b) b.style.visibility = ''; window.scrollTo(0, document.body.scrollHeight); });
  await page.waitForTimeout(200);
  await page.click('.om-tab-pane[data-tab="balls"] .om-tab-top'); await page.waitForTimeout(900);
  const pos = await page.evaluate(() => { let t = document.getElementById('om-tabs').getBoundingClientRect(); let pinned = [...document.querySelectorAll('.back-to-scoring, .beta-banner')].map(x => x.getBoundingClientRect()).filter(r => r.height && r.top < 90).reduce((a, r) => Math.max(a, r.bottom), 0); return { top: Math.round(t.top), bottom: Math.round(t.bottom), pinned: Math.round(pinned), h: innerHeight }; });
  ok(pos.top >= pos.pinned && pos.bottom <= pos.h, 'Pick another view: buttons fully in view below the pinned BACK TO SCORING ' + JSON.stringify(pos));
  await page.screenshot({ path: __dirname + '/shots/omtabs-backup-' + tag + '.png' });
  await page.evaluate(() => { let b = document.querySelector('.back-to-scoring'); if (b) b.style.visibility = 'hidden'; window.scrollTo(0, 0); });
  await shot('balls');
  await page.click('#om-tabs button:has-text("Nassau")'); await page.waitForTimeout(100);
  ok(await page.evaluate(() => document.querySelector('.om-tab-pane[data-tab="balls"]').hidden && !document.querySelector('.om-tab-pane[data-tab="nassau"]').hidden), 'one view open at a time');
  const nh = await page.$$eval('.om-tab-pane[data-tab="nassau"] .om-head b', x => x.map(e => e.textContent));
  ok(nh.join('|') === 'Nassau · Back 9|Nassau · Front 9|Nassau · Overall', 'Nassau: Back 9, Front 9, Overall: ' + nh.join(' | '));
  await shot('nassau');
  await page.click('#om-tabs button:has-text("Scorecards")'); await page.waitForTimeout(100);
  ok(await page.isVisible('.om-tab-pane[data-tab="cards"] table'), 'Scorecards button shows the cards');
  await shot('cards');
  await page.click('#om-tabs button:has-text("Scorecards")'); await page.waitForTimeout(100);
  ok(await page.evaluate(() => [...document.querySelectorAll('.om-tab-pane')].every(p => p.hidden)), 'tap again to close');
  // a refresh keeps the open view
  await page.click('#om-tabs button:has-text("Nassau")');
  await page.evaluate(() => viewDashboard());
  ok(await page.evaluate(() => !document.querySelector('.om-tab-pane[data-tab="nassau"]').hidden), 'the open view stays open when scores come in');
  // finished: play order, Front 9 first
  await page.evaluate(() => { let who = [[1,1],[1,2],[2,1],[2,2]]; for (let h = 13; h <= 18; h++) { who.forEach(([g, p]) => { scoresDb[g][p][h] = roundData.course.pars[h - 1]; }); saveScoresToCloud(who, h); } omTab = 'balls'; viewDashboard(); });
  const fh = (await page.$$eval('.om-tab-pane[data-tab="balls"] .om-head b', x => x.map(e => e.textContent))).filter(t => t.startsWith('1st'));
  ok(/Front 9/.test(fh[0]) && /Back 9/.test(fh[1]), 'once the match is over: Front 9 first again: ' + fh.join(' | '));
  await browser.close();
  console.log(fails ? `${fails} FAILED` : 'ALL PASS'); process.exit(fails ? 1 : 0);
})();
