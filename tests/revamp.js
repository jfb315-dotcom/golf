// Test copy layouts: Home (Today card, last round, tab bar), Setup in 4 steps with a review, Standings tabs
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs = require('fs');
const stub = fs.readFileSync(__dirname + '/stub.js', 'utf8');
const html = fs.readFileSync(__dirname + '/../index.html', 'utf8');
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const vis = (p, sel) => p.isVisible(sel);
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage(); page.setDefaultTimeout(6000);
  page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; }); page.on('dialog', d => d.accept());
  await page.route('**/*', r => { const u = r.request().url();
    if (u.includes('gstatic')) return r.fulfill({ contentType: 'text/javascript', body: u.includes('app-compat') ? stub : '' });
    if (u.startsWith('http://app.test/')) return r.fulfill({ contentType: 'text/html', body: html });
    return r.abort(); });
  await page.addInitScript(() => { if (!window.__docsInit) window.__docsInit = { beta_player_history: { rounds: { r1: { at: 5, date: '2026-11-01', course: 'Pine Hills (Blue)', money: { a: { name: 'John Bischof', games: 4500, om: 1000, side: 0 }, b: { name: 'Mike Jones', games: -4500, om: -1000, side: 0 } } } } } }; });
  // real app: none of it
  await page.goto('http://app.test/'); await page.waitForTimeout(400);
  await page.evaluate(() => showScreen('step-home'));
  ok(!(await vis(page, '#rv-tabbar')) && !(await page.$('#rv-home')) && await vis(page, '.home-new'), 'real app: old Home, no tab bar');
  await page.evaluate(() => showScreen('step-1'));
  ok(await vis(page, 'text=Next: Rosters') && !(await page.$('.rv-steps')), 'real app: old one-page setup');
  // test copy
  await page.goto('http://app.test/?beta=1'); await page.waitForTimeout(500);
  await page.evaluate(() => showScreen('step-home')); await page.waitForTimeout(150);
  ok(await vis(page, '#rv-tabbar') && await vis(page, '.rv-today') && !(await vis(page, '.home-new')), 'Home: Today card + tab bar, old new-round button hidden');
  ok((await page.textContent('.rv-last')).includes('Pine Hills') && (await page.textContent('.rv-last')).includes('John +$55'), 'Home: last round with the top winner');
  await page.screenshot({ path: __dirname + '/shots/rv-home.png' });
  await page.click('#rv-tabbar [data-s="more"]'); await page.waitForTimeout(150);
  ok(await vis(page, '#rv-more .rv-menu-grid'), 'More sheet opens');
  await page.screenshot({ path: __dirname + '/shots/rv-more.png' });
  await page.click('#rv-more .btn-secondary');
  // setup page 1
  await page.click('.rv-fab'); await page.waitForTimeout(150);
  ok(await page.textContent('#step-1 .clean-title') === 'Course & round' && await vis(page, '#course-selector') && !(await vis(page, '#fmt-1')), 'Step 1: course & round only');
  ok(!(await vis(page, '#rv-tabbar')), 'no tab bar during setup');
  await page.evaluate(() => { document.getElementById('group-count').value = 2; document.getElementById('players-per-group').value = 2; });
  await page.screenshot({ path: __dirname + '/shots/rv-s1.png' });
  await page.click('text=Next: games & money'); await page.waitForTimeout(100);
  ok(await page.textContent('#step-1 .clean-title') === 'Games & money' && await page.isVisible('label:has(#fmt-1)') && !(await vis(page, '#course-selector')), 'Step 2: games & money');
  ok(await page.evaluate(() => document.querySelectorAll('#step-1 .rv-steps span.on').length) === 2, 'progress bar: 2 of 4');
  await page.evaluate(() => { document.getElementById('fmt-1').checked = true; document.getElementById('fmt-2').checked = true; document.getElementById('fmt-3').checked = false; let e = document.getElementById('om-enabled'); e.checked = true; toggleOurMatchOptions(); });
  await page.screenshot({ path: __dirname + '/shots/rv-s2.png' });
  await page.click('text=‹ Back'); ok(await page.textContent('#step-1 .clean-title') === 'Course & round', 'Back goes to step 1');
  await page.click('text=Next: games & money');
  await page.click('text=Next: players & teams'); await page.waitForTimeout(200);
  ok(await page.textContent('#step-2 .clean-title') === 'Players & teams' && await vis(page, '#roster-container') && !(await vis(page, '#om-sides')), 'Step 3: players & teams');
  for (const [id, n] of [['g1-p1','John Bischof'],['g1-p2','Brent Copeland'],['g2-p1','Jordia Smith'],['g2-p2','Mike Jones']]) await page.fill(`#${id}-name`, n);
  await page.evaluate(() => saveRosterCache());
  await page.screenshot({ path: __dirname + '/shots/rv-s3.png' });
  await page.click('text=Next: extras & review'); await page.waitForTimeout(150);
  ok(await page.textContent('#step-2 .clean-title') === 'Extras & review' && await vis(page, '#om-sides') && !(await vis(page, '#roster-container')), 'Step 4: extras');
  const review = await page.textContent('#rv-review');
  console.log(review.replace(/\s+/g, ' '));
  ok(/1-Ball, 2-Ball/.test(review) && /Our Match/.test(review) && /2 × 2/.test(review), 'Step 4: review card sums it up');
  await page.screenshot({ path: __dirname + '/shots/rv-s4.png', fullPage: true });
  await page.click('#btn-step2-next'); await page.waitForTimeout(400);
  ok(await page.evaluate(() => !!window.__docs.beta_active_round?.roundData?.groups?.length), 'round starts');
  // standings during play
  await page.evaluate(() => {
    let pars = roundData.course.pars, set = (g, p, h, v) => { scoresDb[g][p] = scoresDb[g][p] || {}; scoresDb[g][p][h] = v; };
    for (let h = 1; h <= 7; h++) { set(1, 1, h, pars[h - 1] - ([2, 4].includes(h) ? 1 : 0)); set(1, 2, h, pars[h - 1]); set(2, 1, h, pars[h - 1] + (h === 3 ? 1 : 0)); set(2, 2, h, pars[h - 1]); }
    liveRoundInCloud = true; viewDashboard();
  });
  await page.waitForTimeout(200);
  const tabs = await page.$$eval('#rv-dtabs-step-dashboard button', b => b.map(x => x.textContent));
  ok(JSON.stringify(tabs) === '["Board","Our Match","Side bets","Cards"]', 'tabs: Board · Our Match · Side bets · Cards: ' + tabs);
  ok(await vis(page, '#step-dashboard .live-progress') && await vis(page, '#dashboard-payouts') && !(await vis(page, '#dashboard-our-match')), 'Board tab: Live card + money; Our Match hidden');
  ok(!(await vis(page, 'details[data-fold="live-cards"]')), 'cards are not repeated in a dropdown');
  await page.evaluate(() => { document.querySelector('.back-to-scoring').style.visibility = 'hidden'; window.scrollTo(0, 0); });
  await page.screenshot({ path: __dirname + '/shots/rv-board.png' });
  await page.click('#rv-dtabs-step-dashboard button:text-is("Our Match")');
  ok(await vis(page, '#dashboard-our-match') && !(await vis(page, '#dashboard-payouts')), 'Our Match tab');
  await page.screenshot({ path: __dirname + '/shots/rv-match.png' });
  await page.click('#rv-dtabs-step-dashboard button:text-is("Cards")');
  ok(await vis(page, '#rv-cards-step-dashboard table') && !(await vis(page, '#dashboard-our-match')), 'Cards tab shows the scorecards');
  await page.screenshot({ path: __dirname + '/shots/rv-cards.png' });
  // a refresh keeps the tab the organizer picked
  await page.evaluate(() => viewDashboard());
  ok(await page.$eval('#rv-dtabs-step-dashboard button.on', b => b.textContent) === 'Cards', 'tab stays picked when the standings refresh');
  // finish: who pays who on top
  await page.evaluate(() => { let pars = roundData.course.pars; for (let h = 1; h <= 18; h++) roundData.groups.forEach(g => g.players.forEach(p => { if (!scoresDb[g.id][p.id][h]) scoresDb[g.id][p.id][h] = pars[h - 1] + (h % 5 === 0 ? 1 : 0); })); rvTab('step-dashboard', 'Board'); viewDashboard(); window.scrollTo(0, 0); });
  await page.waitForTimeout(200);
  ok(await vis(page, '#step-dashboard .all-games'), 'round over: who pays who on top');
  await page.screenshot({ path: __dirname + '/shots/rv-final.png' });
  await browser.close();
  console.log(fails ? `${fails} FAILED` : 'ALL PASS'); process.exit(fails ? 1 : 0);
})();
