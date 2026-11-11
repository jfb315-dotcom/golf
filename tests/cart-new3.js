const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs = require('fs');
const stub = fs.readFileSync(__dirname + '/stub.js', 'utf8');
const html = fs.readFileSync(__dirname + '/../index.html', 'utf8');
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const pars = [5,4,4,4,4,3,5,4,3,5,4,4,3,5,4,4,3,4];
const doc = { isArchived: false, clipboards: {}, scoresDb: { 1: { 1: {}, 2: {} }, 3: { 1: {}, 2: {}, 3: {}, 4: {} } },
  roundData: { course: { name: 'Cleveland CC', pars }, playMode: '18', startType: 'front', startHole: 1, endHole: 18, nineHoleType: 'nassau', roundId: 7, date: '2026-10-31',
    formats: [2], birdieRules: { 2: true }, betAmount: 20, skinsAmount: 10, isScrambled: false, currentHoles: { admin: 1, 3: 1 }, currentHole: 1,
    groups: [{ id: 3, captain: 'Jordia', color: '#ccff00', players: ['Jordia','Bart','Jeff','Billy'].map((n, i) => ({ id: i+1, name: n, strokeHoles: [] })) }],
    carts: [{ id: 3, time: '08:00', players: [1,2,3,4].map(p => ({ g: 3, p })) }] } };
(async () => {
  if (typeof doc !== 'undefined' && doc.roundData && !doc.roundData.roundId) doc.roundData.roundId = 4242;
  const RID = (typeof doc !== 'undefined' && doc.roundData) ? doc.roundData.roundId : '';
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  for (const [h, name] of [[844, 'normal'], [660, 'short']]) {
    const page = await browser.newPage({ viewport: { width: 390, height: h }, deviceScaleFactor: 2 });
    page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
    await page.route('**/*', r => { const u = r.request().url();
      if (u.includes('gstatic')) return r.fulfill({ contentType: 'text/javascript', body: u.includes('app-compat') ? stub : '' });
      if (u.startsWith('http://app.test/')) return r.fulfill({ contentType: 'text/html', body: html });
      return r.abort(); });
    await page.addInitScript(d => { window.__docsInit = { active_round: JSON.parse(d) };
      const sub = { endpoint: 'x', toJSON: () => ({ endpoint: 'x', keys: { p256dh: 'a', auth: 'b' } }) };
      const reg = { pushManager: { getSubscription: async () => sub } };
      window.PushManager = function () {}; window.Notification = { permission: 'granted', requestPermission: async () => 'granted' };
      Object.defineProperty(navigator, 'serviceWorker', { value: { register: async () => reg, getRegistration: async () => reg, ready: Promise.resolve(reg), addEventListener: () => {} } });
    }, JSON.stringify(doc));
    await page.goto('http://app.test/?cart=3&r=' + RID); await page.waitForTimeout(700);
    await page.evaluate(() => changeTheme('augusta')); await page.waitForTimeout(600);
    const st = {};
    ok(await page.isVisible('#cart-scorecard-list'), `${name}: opens on the All scores list`);
    await page.click('.hole-list-row >> nth=0'); await page.waitForTimeout(300);
    Object.assign(st, await page.evaluate(() => { const rows = document.querySelectorAll('.score-row'); return { hole: document.querySelector('.cart-band-hole')?.innerText, back: document.querySelector('.back-link')?.innerText, bell: !!document.querySelector('.band-bell'), chipShown: [...document.querySelectorAll('#step-3 .alerts-banner')].some(e => e.offsetParent && e.innerText.trim()), lastRowBottom: Math.round(rows[rows.length - 1].getBoundingClientRect().bottom), keypadTop: Math.round(document.querySelector('.score-keypad').getBoundingClientRect().top), strip: !!document.querySelector('#cart-hole-header .hole-strip') }; }));
    ok(st.hole === 'Hole 1' && st.back === '‹ All holes / scores' && !st.strip, `${name}: hole 1 opens with ‹ All holes / scores and no strip`);
    const line = await page.evaluate(() => { const a = document.querySelector('.hole-top-row .back-link').getBoundingClientRect(), b = document.querySelector('.hole-top-row .alerts-banner .ab-chip'); const r = b && b.getBoundingClientRect(); return { same: !!r && Math.abs((a.top + a.bottom) / 2 - (r.top + r.bottom) / 2) < 6, extra: [...document.querySelectorAll('#step-3 > .alerts-banner')].some(e => e.offsetParent) }; });
    ok(line.same && !line.extra, `${name}: All holes / scores and Alerts on share one line ` + JSON.stringify(line));
    const navTxt = await page.$$eval('.key-nav button', b => b.map(x => x.textContent.trim() + (x.disabled ? '(off)' : '')));
    ok(JSON.stringify(navTxt) === JSON.stringify(['‹(off)', '↶(off)', 'Hole 2 ›']), `${name}: under the keypad: ` + navTxt.join(' | '));
    ok(st.lastRowBottom <= st.keypadTop, `${name}: all 4 players above the keypad ${st.lastRowBottom}/${st.keypadTop}`);
    await page.screenshot({ path: __dirname + `/shots/cart-new-${name}.png` });
    await page.click('.key-nav button:has-text("Hole 2")'); await page.waitForTimeout(300);
    ok(await page.innerText('.cart-band-hole') === 'Hole 2' && (await page.$$eval('.key-nav button', b => b.map(x => x.textContent.trim()))).join('|') === '‹ Hole 1|↶|Hole 3 ›', `${name}: Hole 2 › moves to hole 2`);
    await page.click('.key-nav button:has-text("Hole 1")'); await page.waitForTimeout(300);
    ok(await page.innerText('.cart-band-hole') === 'Hole 1', `${name}: ‹ Hole 1 goes back`);
    if (name === 'normal') { await page.click('text=‹ All holes / scores'); await page.waitForTimeout(300); await page.screenshot({ path: __dirname + '/shots/cart-list.png' }); }
    await page.close();
  }
  await browser.close();
  console.log(fails ? `${fails} FAILED` : 'ALL PASS'); process.exit(fails ? 1 : 0);
})();
