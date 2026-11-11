// Alerts screen: who has alerts on and the test alert; spectator links on iPhone Safari: how to get alerts
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs = require('fs');
const stub = fs.readFileSync(__dirname + '/stub.js', 'utf8');
const html = fs.readFileSync(__dirname + '/../index.html', 'utf8');
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  let posted = [], dialogs = [];
  const mk = async (ua) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, ...(ua ? { userAgent: ua } : {}) });
    const p = await ctx.newPage(); p.setDefaultTimeout(5000);
    p.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
    p.on('dialog', d => { dialogs.push(d.message()); d.accept(); });
    await p.route('**/*', r => { const u = r.request().url();
      if (u.includes('gstatic')) return r.fulfill({ contentType: 'text/javascript', body: u.includes('app-compat') ? stub : '' });
      if (u.includes('jbgolf-alerts')) { if (r.request().method() === 'POST') posted.push(JSON.parse(r.request().postData())); return r.fulfill({ contentType: 'application/json', body: '{"sent":2,"removed":0}', headers: { 'Access-Control-Allow-Origin': '*' } }); }
      if (u.startsWith('http://app.test/')) return r.fulfill({ contentType: 'text/html', body: html });
      return r.abort(); });
    return p;
  };

  // Organizer phone: a round of Our Match, then the Alerts screen
  const page = await mk();
  const now = Date.now();
  await page.addInitScript(t => { localStorage.setItem('jbGolfAlertsId', 'dme');
    window.__docsInit = { push_subs: { subs: {
      dme: { endpoint: 'https://web.push.apple.com/a', p256dh: 'x', auth: 'y', cart: 'admin', url: 'http://app.test/', at: t - 60000 },
      dcart1: { endpoint: 'https://web.push.apple.com/b', p256dh: 'x', auth: 'y', cart: '1', url: 'http://app.test/?cart=1', at: t - 3 * 86400000 },
      dnow: { endpoint: 'https://web.push.apple.com/d', p256dh: 'x', auth: 'y', cart: '2', url: 'http://app.test/', at: t + 600000 },
      dspec: { endpoint: 'https://web.push.apple.com/c', p256dh: 'x', auth: 'y', cart: '', url: 'http://app.test/?spectator=true&om=2', at: t - 120000 } } } }; }, now);
  await page.goto('http://app.test/'); await page.waitForTimeout(400);
  await page.evaluate(() => { if (document.getElementById('step-home')?.classList.contains('active')) showScreen('step-1'); });
  await page.evaluate(() => { document.getElementById('group-count').value = 2; document.getElementById('players-per-group').value = 2; });
  await page.evaluate(() => startNewRound('om'));
  await page.click('#step-1 .bar-primary[onclick="goToStep2()"]');
  for (const [id, n] of [['g1-p1','Brent'],['g1-p2','John'],['g2-p1','Jordia'],['g2-p2','Mike']]) await page.fill(`#${id}-name`, n);
  await page.evaluate(() => saveRosterCache());
  await page.click('#btn-step2-next'); await page.waitForTimeout(300);
  await page.evaluate(() => { [[1,1,4],[1,2,5],[2,1,5],[2,2,5]].forEach(([g,p,v]) => { scoresDb[g][p][1] = v; }); saveScoresToCloud([[1,1],[1,2],[2,1],[2,2]], 1); });
  await page.waitForTimeout(200);
  // Starting the round left only the admin phone on the list
  ok(await page.evaluate(() => Object.keys(window.__docs.push_subs.subs).join()) === 'dme', 'new round: only admin phones keep getting alerts: ' + await page.evaluate(() => Object.keys(window.__docs.push_subs.subs).join()));
  // ...then phones come back as they open this round's links
  await page.evaluate(t => { let s = window.__docs.push_subs.subs; let rid = String(roundData.roundId);
    s.dcart1 = { endpoint: 'https://web.push.apple.com/b', p256dh: 'x', auth: 'y', cart: '1', url: 'http://app.test/?cart=1', at: t - 3 * 86400000 };
    s.dnow = { endpoint: 'https://web.push.apple.com/d', p256dh: 'x', auth: 'y', cart: '2', url: `http://app.test/?cart=2&r=${rid}`, at: t + 600000 };
    s.dspec = { endpoint: 'https://web.push.apple.com/c', p256dh: 'x', auth: 'y', cart: '', url: 'http://app.test/?spectator=true&om=2', at: t - 120000 }; }, now);
  await page.evaluate(() => openAlertsScreen('step-home')); await page.waitForTimeout(300);
  const rows = await page.$$eval('#alerts-phones .alerts-phone', r => r.map(x => x.innerText.replace(/\s+/g, ' ').trim()));
  console.log(rows);
  ok(rows.length === 4 && rows[0].startsWith('Cart 2 · Jordia, Mike'), 'a cart phone from this round shows its players: ' + rows[0]);
  rows.shift();
  ok(rows[0].startsWith('This phone (admin)') && rows[0].includes('last opened today'), 'this phone listed, as admin, opened today');
  ok(rows[1].startsWith("Spectator · other pair's view"), "spectator on the other side's link listed");
  ok(rows[2].startsWith('Cart 1 · earlier round') && !rows[2].includes('today'), 'a cart phone from an earlier round says so, with its date');
  await page.evaluate(() => document.getElementById('alerts-test').scrollIntoView({ block: 'center' }));
  await page.screenshot({ path: __dirname + '/shots/alerts-phones.png' });
  posted = []; dialogs = [];
  await page.click('#alerts-test'); await page.waitForTimeout(300);
  ok(posted.length === 1 && posted[0].self === true && posted[0].cart === 'admin' && posted[0].from === 'dme', 'test alert goes to the admin phones, this one included: ' + JSON.stringify(posted[0]));
  ok(dialogs.some(d => d.startsWith('Sent to 2 phones')), 'says how many phones it went to: ' + dialogs.join(' | '));
  const docs = await page.evaluate(() => window.__docs);

  // Spectator in Safari on an iPhone: the how-to shows once per round
  const sp = await mk(IPHONE);
  await sp.addInitScript(d => { window.__docsInit = d; }, docs);
  await sp.goto('http://app.test/?spectator=true&om=2'); await sp.waitForTimeout(1500);
  ok(await sp.isVisible('#spec-hs-modal'), 'spectator link on iPhone Safari: how to get alerts');
  ok((await sp.innerText('#spec-hs-modal')).includes('Delete it first'), 'tells them to replace an old Home Screen app');
  await sp.screenshot({ path: __dirname + '/shots/spec-hs.png' });
  await sp.click('#spec-hs-modal >> text=Got it');
  await sp.reload(); await sp.waitForTimeout(1500);
  ok(!(await sp.isVisible('#spec-hs-modal')), 'only once per round');
  // A cart link that hasn't picked its cart for this round isn't an admin phone
  const cp = await mk();
  await cp.addInitScript(d => { window.__docsInit = d; }, docs);
  await cp.goto('http://app.test/?cart=3&r=123'); await cp.waitForTimeout(1200);
  ok(await cp.isVisible('#step-cartpick'), 'old cart link (last round) asks which cart today');
  // Not on a desktop browser
  const dt = await mk();
  await dt.addInitScript(d => { window.__docsInit = d; }, docs);
  await dt.goto('http://app.test/?spectator=true&om=1'); await dt.waitForTimeout(1500);
  ok(!(await dt.isVisible('#spec-hs-modal')), 'not shown off iPhone');
  await browser.close();
  console.log(fails ? `${fails} FAILED` : 'ALL PASS'); process.exit(fails ? 1 : 0);
})();
