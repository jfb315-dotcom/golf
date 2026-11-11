// Home has New tournament and Our Match. Our Match setup shows only what it uses; Tournament has Add Our Match at the bottom.
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs = require('fs');
const stub = fs.readFileSync(__dirname + '/stub.js', 'utf8');
const html = fs.readFileSync(__dirname + '/../index.html', 'utf8');
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
  await page.goto('http://app.test/?beta=0'); await page.waitForTimeout(400);
  await page.evaluate(() => { changeTheme('fairway'); showScreen('step-home'); });
  const vis = sel => page.isVisible(sel);
  ok(await vis('text=New tournament') && await vis('.home-new.home-om'), 'Home: New tournament and Our Match buttons');
  const sizes = await page.$$eval('.home-new', b => b.map(x => [Math.round(x.getBoundingClientRect().width), Math.round(x.getBoundingClientRect().height)]));
  ok(sizes.length === 2 && sizes[0][0] === sizes[1][0] && sizes[0][1] === sizes[1][1], 'same size: ' + JSON.stringify(sizes));
  await page.screenshot({ path: __dirname + '/shots/split-home.png', clip: { x: 0, y: 0, width: 390, height: 420 } });

  // ---- Our Match ----
  await page.click('.home-new.home-om'); await page.waitForTimeout(200);
  ok((await page.textContent('#step-1 .clean-title')).trim() === 'Our Match setup' || await vis('#step-1 .clean-title .om-mode-only'), 'Our Match: title says Our Match setup');
  ok(await vis('#course-selector') && await vis('#om-nassau') && await vis('#om-ball') && await vis('#om-nassau-net'), 'Our Match: course + Our Match amounts');
  ok(!(await vis('#group-count')) && !(await vis('.whos-btn')) && !(await vis('#fmt-2')) && !(await vis('#bet-amount')) && !(await vis('#skins-amount')) && !(await vis('#live-buyin-display')) && !(await vis('#om-enabled')), 'Our Match: no teams count, who\'s playing, team games, per bet, skins, entry fee or on/off switch');
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: __dirname + '/shots/split-om-setup.png', fullPage: true });
  await page.click('#step-1 .bar-primary[onclick="goToStep2()"]'); await page.waitForTimeout(200);
  ok(await page.$$eval('#roster-container input[id$="-name"]', x => x.length) === 4, 'Our Match: 4 player slots (2 teams of 2)');
  ok(!(await vis('#side-bets-setup')) && !(await vis('.team-tools')) && !(await vis('#om-sides')) && !(await vis('[data-select="is-scrambled"]')) && !(await vis('text=Assign blind draw')), 'Our Match: no side bets, balance, sides pickers, carts or blind draw');
  for (const [id, n] of [['g1-p1','Jordia Smith'],['g1-p2','John Bischof'],['g2-p1','Brent Copeland'],['g2-p2','Andy Anderson']]) await page.fill(`#${id}-name`, n);
  await page.evaluate(() => saveRosterCache());
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: __dirname + '/shots/split-om-players.png' });
  await page.click('#btn-step2-next'); await page.waitForTimeout(400);
  const rd = await page.evaluate(() => window.__docs.active_round.roundData);
  ok(rd.ourMatch && !rd.betAmount && !rd.skinsAmount && !(rd.sideBets || []).length, 'Our Match round saved: Our Match on, no purse, no side bets');
  ok(JSON.stringify(ourSides = rd.ourMatch.sideA) && rd.ourMatch.sideA.every(x => x.g === 1) && rd.ourMatch.sideB.every(x => x.g === 2), 'sides are Team 1 vs Team 2');
  // edit mid-round keeps the Our Match layout
  await page.evaluate(() => editMidRound()); await page.waitForTimeout(300);
  console.log(await page.evaluate(() => JSON.stringify({ only: document.getElementById('om-only').checked, en: document.getElementById('om-enabled').checked, screen: document.querySelector('.screen.active').id, bet: roundData.betAmount, sk: roundData.skinsAmount, om: !!roundData.ourMatch, title: document.querySelector('#step-1 .clean-title').innerHTML, eyebrowDisp: getComputedStyle(document.querySelector('#step-1 .clean-eyebrow')).display })));
  ok(await vis('#step-1 .clean-title .om-mode-only') && !(await vis('#fmt-2')), 'editing an Our Match round shows the Our Match setup');
  await page.evaluate(() => cancelMidRoundEdit()); await page.waitForTimeout(200);

  // ---- Tournament ----
  await page.evaluate(() => showScreen('step-home'));
  await page.click('text=New tournament'); await page.waitForTimeout(200);
  ok(await vis('#step-1 .clean-title .tourn-only') && await vis('#fmt-2') && await vis('#bet-amount') && await vis('#group-count'), 'Tournament: team games, per bet, teams count');
  ok(await page.inputValue('#players-per-group') === '4', 'Tournament after an Our Match: back to 4 a team');
  ok(!(await page.isChecked('#om-enabled')) && !(await vis('#om-options')) && !(await vis('#om-only')), 'Tournament: Our Match off by default, no "Only Our Match" option');
  const order = await page.evaluate(() => { let y = id => document.getElementById(id).getBoundingClientRect().top; return y('om-enabled') > y('bet-amount') && y('om-enabled') > y('fmt-3'); });
  ok(order, 'Tournament: Add Our Match sits below the team games and per bet');
  await page.check('#om-enabled'); await page.waitForTimeout(100);
  ok(await vis('#om-nassau') && await vis('#fmt-2'), 'Tournament + Add Our Match: options open, team games stay');
  await page.evaluate(() => { let el = document.getElementById('om-enabled'); el.scrollIntoView({ block: 'center' }); });
  await page.screenshot({ path: __dirname + '/shots/split-tourn-om.png' });
  await page.click('#step-1 .bar-primary[onclick="goToStep2()"]'); await page.waitForTimeout(200);
  ok(await vis('#side-bets-setup') && await vis('#om-sides') && await vis('[data-select="is-scrambled"]'), 'Tournament rosters: side bets, Our Match sides, carts');
  await browser.close();
  console.log(fails ? `${fails} FAILED` : 'ALL PASS'); process.exit(fails ? 1 : 0);
})();
