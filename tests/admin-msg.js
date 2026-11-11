const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs = require('fs');
const stub = fs.readFileSync(__dirname + '/stub.js', 'utf8');
const html = fs.readFileSync(__dirname + '/../index.html', 'utf8').replace(/const ALERTS_URL = (BETA \? '' : )?'[^']*';/, "const ALERTS_URL = 'https://alerts.test/';");
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const pars = [5,4,4,4,4,3,5,4,3,5,4,4,3,5,4,4,3,4];
const doc = { isArchived: false, clipboards: {}, scoresDb: { 1: { 1: {}, 2: {} }, 2: { 1: {}, 2: {} } },
  roundData: { course: { name: 'Cleveland CC', pars }, playMode: '18', startType: 'front', startHole: 1, endHole: 18, nineHoleType: 'nassau', roundId: 7, date: '2026-10-31',
    formats: [2], birdieRules: { 2: true }, betAmount: 20, skinsAmount: 10, isScrambled: false, currentHoles: { admin: 1, 1: 1, 2: 1 }, currentHole: 1,
    groups: [[1, 'Brent', 'John', '#00f3ff'], [2, 'Jordia', 'Mike', '#7ced7e']].map(([g, a, b, c]) => ({ id: g, captain: a, color: c, players: [{ id: 1, name: a, strokeHoles: [] }, { id: 2, name: b, strokeHoles: [] }] })),
    carts: [1, 2].map(g => ({ id: g, time: '08:00', players: [{ g, p: 1 }, { g, p: 2 }] })) } };
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
  const dialogs = []; page.on('dialog', d => { dialogs.push(d.message()); d.accept(); });
  const sent = [];
  await page.route('**/*', r => { const u = r.request().url();
    if (u.startsWith('https://alerts.test/')) { if (r.request().method() === 'POST') sent.push(JSON.parse(r.request().postData())); return r.fulfill({ status: 200, body: '{"sent":2,"removed":0}', headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Content-Type': 'application/json' } }); }
    if (u.includes('gstatic')) return r.fulfill({ contentType: 'text/javascript', body: u.includes('app-compat') ? stub : '' });
    if (u.startsWith('http://app.test/')) return r.fulfill({ contentType: 'text/html', body: html });
    return r.abort(); });
  await page.addInitScript(d => { window.__docsInit = { active_round: JSON.parse(d) }; }, JSON.stringify(doc));
  await page.goto('http://app.test/'); await page.waitForTimeout(500); await page.evaluate(() => { if (document.getElementById('step-home')?.classList.contains('active')) showScreen('step-1'); });
  await page.evaluate(() => { document.getElementById('app-theme-selector').value = 'neyland'; changeTheme(); });
  await page.waitForTimeout(600);
  ok(await page.evaluate(() => getComputedStyle(document.body).backgroundColor) === 'rgb(18, 18, 18)', 'Neyland Night theme applies');
  ok(await page.isVisible('#share-hub-row'), 'admin has 📣 Share & message'); await page.click('#share-hub-row'); ok(await page.isVisible('#admin-message-row'), 'with Send a message to carts in it'); await page.evaluate(() => document.getElementById('share-hub-modal').classList.remove('active'));
  ok(await page.isVisible('#pill-nav-container .pill-msg'), '📣 button in the top bar');
  await page.screenshot({ path: __dirname + '/shots/pill-msg.png', clip: { x: 0, y: 0, width: 390, height: 260 } });
  await page.click('#pill-nav-container .pill-msg'); await page.waitForTimeout(150);
  ok(await page.isVisible('#message-modal'), 'top-bar 📣 opens the message box');
  const opts = await page.$$eval('#message-to option', o => o.map(x => x.textContent));
  ok(JSON.stringify(opts) === JSON.stringify(['Everyone', 'Cart 1 · Brent, John', 'Cart 2 · Jordia, Mike']), 'choices: ' + opts.join(' | '));
  await page.fill('#message-text', 'Pace of play, pick it up!');
  await page.screenshot({ path: __dirname + '/shots/admin-message.png' });
  await page.selectOption('#message-to', '2');
  await page.click('#message-modal .btn-primary'); await page.waitForTimeout(300);
  const m = sent[sent.length - 1];
  ok(m && m.title === '📣 Message for Cart 2' && m.body === 'Pace of play, pick it up!' && m.cart === '2', 'message sent to cart 2: ' + JSON.stringify(m));
  ok(dialogs.some(d => d === 'Sent to 2 phones.') && !(await page.isVisible('#message-modal')), 'confirmation and modal closes');
  await page.click('#share-hub-row'); await page.click('#admin-message-row'); await page.fill('#message-text', 'Lunch at the turn'); await page.click('#message-modal .btn-primary'); await page.waitForTimeout(300);
  const m2 = sent[sent.length - 1];
  ok(m2.title === '📣 Message from the admin' && m2.cart === '', 'Everyone message');
  await page.screenshot({ path: __dirname + '/shots/neyland.png' });
  // carts don't see the button
  const p2 = await browser.newPage();
  await p2.route('**/*', r => { const u = r.request().url();
    if (u.includes('gstatic')) return r.fulfill({ contentType: 'text/javascript', body: u.includes('app-compat') ? stub : '' });
    if (u.startsWith('http://app.test/')) return r.fulfill({ contentType: 'text/html', body: html });
    return r.abort(); });
  await p2.addInitScript(d => { window.__docsInit = { active_round: JSON.parse(d) }; }, JSON.stringify(doc));
  await p2.goto('http://app.test/?cart=1'); await p2.waitForTimeout(400);
  ok(!(await p2.isVisible('#admin-message-row')) && !(await p2.isVisible('#share-hub-row')), 'carts do not see the message button');
  await browser.close();
  console.log(fails ? `${fails} FAILED` : 'ALL PASS'); process.exit(fails ? 1 : 0);
})();
