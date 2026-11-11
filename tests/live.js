// Standings during play: Live card on top (team scores, each player's score and thru), no who-pays-who.
// When the round is over: who pays who on top, Live card gone, the math dropdown doesn't repeat the payments.
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs = require('fs');
const stub = fs.readFileSync(__dirname + '/stub.js', 'utf8');
const html = fs.readFileSync(__dirname + '/../index.html', 'utf8');
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 }); page.setDefaultTimeout(6000);
  page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; }); page.on('dialog', d => d.accept());
  await page.route('**/*', r => { const u = r.request().url();
    if (u.includes('gstatic')) return r.fulfill({ contentType: 'text/javascript', body: u.includes('app-compat') ? stub : '' });
    if (u.startsWith('http://app.test/')) return r.fulfill({ contentType: 'text/html', body: html });
    return r.abort(); });
  await page.addInitScript(() => { window.__docsInit = {}; });
  await page.goto('http://app.test/'); await page.waitForTimeout(400);
  await page.evaluate(() => { showScreen('step-1'); document.getElementById('group-count').value = 2; document.getElementById('players-per-group').value = 2;
    document.getElementById('fmt-1').checked = true; document.getElementById('fmt-2').checked = true; document.getElementById('fmt-3').checked = false;
    let e = document.getElementById('om-enabled'); e.checked = true; toggleOurMatchOptions(); });
  await page.click('#step-1 .bar-primary[onclick="goToStep2()"]');
  for (const [id, n] of [['g1-p1','John Bischof'],['g1-p2','Brent Copeland'],['g2-p1','Jordia Smith'],['g2-p2','Mike Jones']]) await page.fill(`#${id}-name`, n);
  await page.evaluate(() => saveRosterCache());
  await page.click('#btn-step2-next'); await page.waitForTimeout(400);
  // Team 1 through 7; Team 2 through 5 (Mike missing 6). John birdies 2 and 4, Jordia bogeys 3.
  await page.evaluate(() => {
    let pars = roundData.course.pars, set = (g, p, h, v) => { scoresDb[g][p] = scoresDb[g][p] || {}; scoresDb[g][p][h] = v; };
    for (let h = 1; h <= 7; h++) { set(1, 1, h, pars[h - 1] - ([2, 4].includes(h) ? 1 : 0)); set(1, 2, h, pars[h - 1]); }
    for (let h = 1; h <= 6; h++) set(2, 1, h, pars[h - 1] + (h === 3 ? 1 : 0));
    for (let h = 1; h <= 5; h++) set(2, 2, h, pars[h - 1]);
    liveRoundInCloud = true; viewDashboard();
  });
  await page.waitForTimeout(200);
  const live = await page.evaluate(() => { let el = document.querySelector('#step-dashboard .live-progress'); return el && { text: el.innerText.replace(/\s+/g, ' '), top: el.getBoundingClientRect().top, cards: document.querySelector('details[data-fold="live-cards"]')?.getBoundingClientRect().top ?? 1e9, purse: document.querySelector('#dashboard-payouts')?.getBoundingClientRect().top ?? 1e9 }; });
  console.log(live && live.text);
  ok(live && live.top < live.purse, 'during play: Live card at the top');
  ok(live && /Team 1 · John thru 7 1-Ball -2 2-Ball -2/.test(live.text), 'team 1 first: 1-Ball −2, 2-Ball −2, thru 7');
  ok(live && /Team 2 · Jordia thru 5/.test(live.text), 'team 2 thru 5 (Mike hasn\'t scored 6)');
  ok(live && /John -2 -2 gross thru 7/.test(live.text) && /Jordia \+1 \+1 gross thru 6/.test(live.text) && /Mike E E gross thru 5/.test(live.text), 'each player: net to par, gross, thru');
  ok(!(await page.$('#step-dashboard .all-games')), 'during play: no who-pays-who box at the top');
  ok(await page.evaluate(() => document.querySelector('details[data-fold="live-math"] summary')?.textContent.includes('See money so far')), 'during play: money so far is in the dropdown');
  await page.evaluate(() => { document.querySelector('.back-to-scoring').style.visibility = 'hidden'; window.scrollTo(0, 0); });
  await page.screenshot({ path: __dirname + '/shots/live-card.png' });
  // finish the round
  await page.evaluate(() => { let pars = roundData.course.pars; for (let h = 1; h <= 18; h++) roundData.groups.forEach(g => g.players.forEach(p => { if (!scoresDb[g.id][p.id][h]) scoresDb[g.id][p.id][h] = pars[h - 1] + (h % 5 === 0 ? 1 : 0); })); viewDashboard(); });
  await page.waitForTimeout(200);
  ok(!(await page.$('#step-dashboard .live-progress')), 'round over: Live card gone');
  ok(await page.isVisible('#step-dashboard .all-games'), 'round over: who pays who at the top');
  const math = await page.evaluate(() => { let d = document.querySelector('details[data-fold="live-math"]'); return d && { title: d.querySelector('summary').textContent, repeats: /pays/.test(d.querySelector('summary').nextSibling ? [...d.children].slice(1).map(x => x.textContent).join(' ') : '') && !!d.querySelector('.settle-row') }; });
  ok(math && math.title.includes('See all the math') && !math.repeats, 'round over: dropdown is "See all the math" without repeating the payments: ' + JSON.stringify(math));
  await browser.close();
  console.log(fails ? `${fails} FAILED` : 'ALL PASS'); process.exit(fails ? 1 : 0);
})();
