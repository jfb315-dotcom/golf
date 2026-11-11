const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs = require('fs');
const stub = fs.readFileSync(__dirname + '/stub.js', 'utf8');
const html = fs.readFileSync(__dirname + '/../index.html', 'utf8').replace(/const ALERTS_URL = (BETA \? '' : )?'[^']*';/, "const ALERTS_URL = 'https://alerts.test/';");
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
  page.on('dialog', d => d.accept());
  const sent = [];
  await page.route('**/*', r => { const u = r.request().url();
    if (u.startsWith('https://alerts.test/')) { if (r.request().method() === 'POST') sent.push(JSON.parse(r.request().postData())); return r.fulfill({ status: 200, body: '{}', headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type' } }); }
    if (u.includes('gstatic')) return r.fulfill({ contentType: 'text/javascript', body: u.includes('app-compat') ? stub : '' });
    if (u.startsWith('http://app.test/')) return r.fulfill({ contentType: 'text/html', body: html });
    return r.abort(); });
  await page.addInitScript(() => {
    window.__docsInit = {};
    // Fake push support (headless Chrome has no push service)
    let sub = null, perm = 'default';
    const fakeSub = { endpoint: 'https://push.example.com/abc', toJSON: () => ({ endpoint: 'https://push.example.com/abc', keys: { p256dh: 'PK', auth: 'AU' } }), unsubscribe: async () => { sub = null; return true; } };
    const reg = { pushManager: { getSubscription: async () => sub, subscribe: async () => (sub = fakeSub) } };
    window.PushManager = function () {};
    window.Notification = { get permission() { return perm; }, requestPermission: async () => (perm = 'granted') };
    Object.defineProperty(navigator, 'serviceWorker', { value: { register: async () => reg, getRegistration: async () => reg, ready: Promise.resolve(reg), addEventListener: () => {} } });
  });
  await page.goto('http://app.test/'); await page.waitForTimeout(300); await page.evaluate(() => { if (document.getElementById('step-home')?.classList.contains('active')) showScreen('step-1'); });
  ok(await page.isVisible('#alerts-row'), 'setup shows a Phone alerts row');
  await page.evaluate(() => { document.getElementById('group-count').value = 2; document.getElementById('players-per-group').value = 2; });
  await page.evaluate(() => { startNewRound('tournament'); document.getElementById('group-count').value = 2; document.getElementById('players-per-group').value = 2; let e = document.getElementById('om-enabled'); e.checked = true; toggleOurMatchOptions(); }); // Our Match inside a tournament (an Our Match-only round has no alerts)
  await page.screenshot({ path: __dirname + '/shots/alerts-setup.png', fullPage: true });
  await page.click('#step-1 .bar-primary[onclick="goToStep2()"]');
  for (const [id, n] of [['g1-p1','Brent'],['g1-p2','John'],['g2-p1','Jordia'],['g2-p2','Mike']]) await page.fill(`#${id}-name`, n);
  await page.evaluate(() => saveRosterCache());
  await page.click('#btn-step2-next'); await page.waitForTimeout(300);
  const saved = await page.evaluate(() => window.__doc.roundData.alerts);
  ok(Object.keys(saved).length === 13 && Object.values(saved).every(v => v === true), 'all 13 alert choices saved with the round: ' + Object.keys(saved).join(','));

  const btn = '#step-3 .alerts-banner .ab-btn';
  ok(await page.isVisible(btn) && (await page.innerText(btn)) === 'Turn on alerts', 'big Turn on alerts card at the top of scoring');
  const top = await page.evaluate(() => document.querySelector('#step-3 .alerts-banner').getBoundingClientRect().top);
  ok(top < 300, 'card is near the top of the screen: ' + Math.round(top));
  await page.screenshot({ path: __dirname + '/shots/alerts-card.png' });
  // Not now -> small chip, can still turn on
  await page.click('#step-3 .ab-later'); await page.waitForTimeout(200);
  ok((await page.innerText('#step-3 .alerts-banner')).includes('Alerts off · turn on') && !(await page.isVisible('#step-3 .ab-big')), 'Not now shrinks it to a small chip');
  await page.click('#step-3 .ab-chip button'); await page.waitForTimeout(300);
  const subs = await page.evaluate(() => window.__docs.push_subs);
  const ids = Object.keys(subs?.subs || {});
  ok(ids.length === 1 && subs.subs[ids[0]].endpoint === 'https://push.example.com/abc' && subs.subs[ids[0]].p256dh === 'PK', 'phone saved for alerts: ' + JSON.stringify(subs));
  ok((await page.innerText('#step-3 .alerts-banner')).includes('Alerts on') && !(await page.isVisible('#step-3 .ab-big')), 'after turning on: small Alerts on tag');
  await page.screenshot({ path: __dirname + '/shots/alerts-on.png' });

  // Birdie: Brent 4 on par 5 hole 1, others par
  await page.evaluate(() => { [[1,1,4],[1,2,5],[2,1,5],[2,2,3]].forEach(([g,p,v]) => { scoresDb[g][p][1] = v; }); saveScoresToCloud([[1,1],[1,2],[2,1],[2,2]], 1); });
  await page.waitForTimeout(300);
  ok(sent.some(a => a.title === '🐦 Brent birdie on 1' && a.body.startsWith('4 on a par 5') && a.view === 'standings' && a.from === ids[0]), 'birdie alert sent: ' + JSON.stringify(sent.map(a => a.title)));
  ok(sent.some(a => a.title === '🦅 Mike eagle on 1'), 'eagle alert sent');
  const n1 = sent.length;
  await page.evaluate(() => saveScoresToCloud([[1,1],[1,2],[2,1],[2,2]], 1)); await page.waitForTimeout(200);
  ok(sent.length === n1, 'saving the same scores again sends nothing new');

  // Press
  await page.evaluate(() => { scoresDb[1][1][2] = 5; scoresDb[1][2][2] = 5; scoresDb[2][1][2] = 4; scoresDb[2][2][2] = 4; saveScoresToCloud([[1,1],[1,2],[2,1],[2,2]], 2); });
  await page.click('text=View standings'); await page.waitForTimeout(200);
  const pressBtn = page.locator('.om-press').first();
  const pressText = await pressBtn.innerText();
  await pressBtn.click(); await page.waitForTimeout(300);
  ok(sent.some(a => a.title.startsWith('⤴ ') && a.title.includes('pressed the') && a.view === 'our-match'), 'press alert sent (' + pressText + '): ' + sent.map(a => a.title).join(' | '));
  ok(await page.isVisible('#step-dashboard .alerts-banner .ab-chip'), 'standings shows the alerts tag too');

  // Turn birdies off mid-round: no more birdie alerts
  await page.click('text=BACK TO SCORING');
  await page.click('text=Edit setup / rosters'); await page.waitForTimeout(150);
  ok(await page.isChecked('#alert-birdies'), 'edit: switches restored');
  await page.click('#alerts-row'); await page.uncheck('#alert-birdies'); await page.click('#step-alerts .back-link-top');
  await page.click('#step-1 .bar-primary[onclick="goToStep2()"]'); await page.click('#btn-step2-next'); await page.waitForTimeout(300);
  const n2 = sent.length;
  await page.evaluate(() => { scoresDb[1][1][3] = 3; saveScoresToCloud([[1,1]], 3); }); await page.waitForTimeout(200);
  ok(sent.length === n2, 'birdie alerts off: nothing sent');

  // Tapped alert while app is open -> standings
  await page.evaluate(() => openAlertView('our-match')); await page.waitForTimeout(200);
  ok(await page.evaluate(() => document.querySelector('.screen.active').id) === 'step-dashboard', 'tapping an alert opens the standings');

  // Finalize -> final results alert
  await page.click('text=BACK TO SCORING');
  await page.evaluate(() => { for (let h = 1; h <= 18; h++) [[1,1],[1,2],[2,1],[2,2]].forEach(([g,p]) => { if (!scoresDb[g][p][h]) scoresDb[g][p][h] = 5; }); });
  await page.click('#step-3 button:has-text("Finalize / Archive Round")');
  for (const d of '1234') await page.click(`.pin-pad button:text-is("${d}")`);
  await page.waitForTimeout(500);
  ok(sent.some(a => a.title === '🏆 Final results are in' && a.view === 'standings'), 'final results alert sent: ' + sent.map(a => a.title).slice(-1));

  // Turn alerts off
  await page.evaluate(() => { closeShareModal(); document.getElementById('text-modal').classList.remove('active'); document.getElementById('match-send-modal')?.classList.remove('active'); document.querySelectorAll('.screen').forEach(s => s.classList.remove('active')); document.getElementById('step-3').classList.add('active'); });
  await page.click('#step-3 .ab-chip button'); await page.waitForTimeout(300);
  ok(Object.keys((await page.evaluate(() => window.__docs.push_subs)).subs || {}).length === 0, 'turning alerts off (after confirming) removes the phone');
  ok((await page.innerText('#step-3 .alerts-banner')).includes('turn on'), 'tag goes back to off');

  // Opened from an alert (app was closed): #view=standings goes straight to standings
  const p2 = await browser.newPage({ viewport: { width: 390, height: 844 } });
  p2.on('pageerror', e => { console.log('P2 ERROR', e.message); fails++; });
  await p2.route('**/*', r => { const u = r.request().url();
    if (u.includes('gstatic')) return r.fulfill({ contentType: 'text/javascript', body: u.includes('app-compat') ? stub : '' });
    if (u.startsWith('http://app.test/')) return r.fulfill({ contentType: 'text/html', body: html });
    return r.abort(); });
  const live = await page.evaluate(() => { const d = JSON.parse(JSON.stringify(window.__doc)); d.isArchived = false; return JSON.stringify(d); });
  await p2.addInitScript(d => { window.__docsInit = { active_round: JSON.parse(d) }; }, live);
  await p2.goto('http://app.test/?cart=1&r=' + JSON.parse(live).roundData.roundId + '#view=standings'); await p2.waitForTimeout(500);
  ok(await p2.evaluate(() => document.querySelector('.screen.active').id === 'step-dashboard' && !location.hash), 'opening from an alert lands on the standings');

  // No URL set: nothing shows, nothing sent
  const p3 = await browser.newPage();
  await p3.route('**/*', r => { const u = r.request().url();
    if (u.includes('gstatic')) return r.fulfill({ contentType: 'text/javascript', body: u.includes('app-compat') ? stub : '' });
    if (u.startsWith('http://app.test/')) return r.fulfill({ contentType: 'text/html', body: fs.readFileSync(__dirname + '/../index.html', 'utf8').replace(/const ALERTS_URL = (BETA \? '' : )?'[^']*';/, "const ALERTS_URL = '';") });
    return r.abort(); });
  await p3.addInitScript(() => { window.__docsInit = {}; });
  await p3.goto('http://app.test/'); await p3.waitForTimeout(300); await p3.evaluate(() => { if (document.getElementById('step-home')?.classList.contains('active')) showScreen('step-1'); });
  ok(!(await p3.isVisible('#alerts-setup')) && !(await p3.isVisible('.alerts-banner')), 'with no Cloudflare address yet, alerts stay hidden');
  await browser.close();
  console.log(fails ? `${fails} FAILED` : 'ALL PASS'); process.exit(fails ? 1 : 0);
})();
