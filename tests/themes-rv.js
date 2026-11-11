// Test copy themes: picker in More, four looks, remembered; real app untouched
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
  await page.addInitScript(() => { if (!window.__docsInit) window.__docsInit = {}; });
  const bg = () => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--bg-dark').trim());
  await page.goto('http://app.test/'); await page.waitForTimeout(400);
  await page.evaluate(() => changeTheme('clubhouse'));
  await page.goto('http://app.test/?beta=1'); await page.waitForTimeout(400);
  ok(await bg() === '#0d211a', 'test copy starts on Fairway');
  // build a round so scoring + standings can be shown in each look
  await page.evaluate(() => { showScreen('step-1'); document.getElementById('group-count').value = 2; document.getElementById('players-per-group').value = 2; let e = document.getElementById('om-enabled'); e.checked = true; toggleOurMatchOptions(); });
  await page.click('text=Next: games & money'); await page.click('text=Next: players & teams');
  for (const [id, n] of [['g1-p1','John Bischof'],['g1-p2','Brent Copeland'],['g2-p1','Jordia Smith'],['g2-p2','Mike Jones']]) await page.fill(`#${id}-name`, n);
  await page.evaluate(() => saveRosterCache());
  await page.click('text=Next: extras & review'); await page.click('#btn-step2-next'); await page.waitForTimeout(400);
  await page.evaluate(() => { let pars = roundData.course.pars; for (let h = 1; h <= 5; h++) roundData.groups.forEach(g => g.players.forEach((p, i) => { scoresDb[g.id][p.id] = scoresDb[g.id][p.id] || {}; scoresDb[g.id][p.id][h] = pars[h - 1] + (i && h % 2 ? 1 : 0); })); liveRoundInCloud = true; });
  for (const t of ['fairway', 'augustawhite', 'clubhouse', 'coastal']) {
    await page.evaluate(() => showScreen('step-home')); await page.waitForTimeout(100);
    await page.click('#rv-tabbar [data-s="more"]'); await page.selectOption('#rv-theme', t); await page.waitForTimeout(100);
    await page.click('#rv-more .btn-secondary'); await page.waitForTimeout(300);
    ok(await page.evaluate(() => document.getElementById('step-home').classList.contains('active')), t + ': picking a look keeps you on Home');
    await page.screenshot({ path: __dirname + `/shots/th-${t}-home.png` });
    await page.evaluate(() => { let pars = roundData.course.pars; for (let h = 1; h <= 5; h++) roundData.groups.forEach(g => g.players.forEach((p, i) => { scoresDb[g.id][p.id] = scoresDb[g.id][p.id] || {}; scoresDb[g.id][p.id][h] = pars[h - 1] + (i && h % 2 ? 1 : 0); })); roundData.currentHole = 6; goLiveScoring(); }); await page.waitForTimeout(250);
    await page.screenshot({ path: __dirname + `/shots/th-${t}-score.png` });
    await page.evaluate(() => { viewDashboard(); window.scrollTo(0, 0); }); await page.waitForTimeout(250);
    await page.evaluate(() => { let b = document.querySelector('.back-to-scoring'); if (b) b.style.visibility = 'hidden'; });
    await page.screenshot({ path: __dirname + `/shots/th-${t}-stand.png` });
  }
  ok(await bg() === '#153243', 'Coastal applied');
  await page.reload(); await page.waitForTimeout(400);
  ok(await bg() === '#153243' && await page.inputValue('#rv-theme') === 'coastal', 'pick is remembered in the test copy');
  await page.goto('http://app.test/?beta=0'); await page.waitForTimeout(400);
  ok(await bg() === '#f7f6f1', 'real app keeps its own theme (Clubhouse)');
  await browser.close();
  console.log(fails ? `${fails} FAILED` : 'ALL PASS'); process.exit(fails ? 1 : 0);
})();
