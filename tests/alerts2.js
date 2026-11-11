const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs = require('fs');
const stub = fs.readFileSync(__dirname + '/stub.js', 'utf8');
const html = fs.readFileSync(__dirname + '/../index.html', 'utf8').replace(/const ALERTS_URL = (BETA \? '' : )?'[^']*';/, "const ALERTS_URL = 'https://alerts.test/';");
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const pars = [5,4,4,4,4,3,5,4,3,5,4,4,3,5,4,4,3,4];
async function open(browser, doc, q = '') {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
  page.on('dialog', d => d.accept());
  const sent = [];
  await page.route('**/*', r => { const u = r.request().url();
    if (u.startsWith('https://alerts.test/')) { if (r.request().method() === 'POST') sent.push(JSON.parse(r.request().postData())); return r.fulfill({ status: 200, body: '{}', headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type' } }); }
    if (u.includes('gstatic')) return r.fulfill({ contentType: 'text/javascript', body: u.includes('app-compat') ? stub : '' });
    if (u.startsWith('http://app.test/')) return r.fulfill({ contentType: 'text/html', body: html });
    return r.abort(); });
  await page.addInitScript(d => { window.__docsInit = { active_round: JSON.parse(d) }; }, JSON.stringify(doc));
  await page.goto('http://app.test/' + q); await page.waitForTimeout(400); await page.evaluate(() => { if (document.getElementById('step-home')?.classList.contains('active')) showScreen('step-1'); });
  return { page, sent };
}
const round = (extra = {}) => ({ isArchived: false, clipboards: {}, scoresDb: { 1: { 1: {}, 2: {} }, 2: { 1: {}, 2: {} } },
  roundData: { course: { name: 'Cleveland CC', pars }, playMode: '18', startType: 'front', startHole: 1, endHole: 18, nineHoleType: 'nassau', roundId: 7, date: '2026-10-31',
    formats: [2], birdieRules: { 2: true }, betAmount: 20, skinsAmount: 10, isScrambled: false, currentHoles: { admin: 1, 1: 1, 2: 1 }, currentHole: 1,
    groups: [[1, 'Brent', 'John'], [2, 'Jordia', 'Mike']].map(([g, a, b]) => ({ id: g, captain: a, color: '#fff', players: [{ id: 1, name: a, strokeHoles: [] }, { id: 2, name: b, strokeHoles: [] }] })),
    carts: [1, 2].map(g => ({ id: g, time: '08:00', players: [{ g, p: 1 }, { g, p: 2 }] })), ...extra } });
const set = (page, list) => page.evaluate(list => { list.forEach(([g, p, h, v]) => { scoresDb[g][p][h] = v; saveScoresToCloud([[g, p]], h); }); }, list);
const titles = sent => sent.map(a => a.title);

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  let { page, sent } = await open(browser, round());

  // Hole 1: Brent double (7 on par 5), others par; Team 2 leads after hole 1 (first scores: no lead alert)
  await set(page, [[1,1,1,7],[1,2,1,5],[2,1,1,5],[2,2,1,5]]);
  await page.waitForTimeout(150);
  ok(titles(sent).includes('😩 Brent double bogey on 1'), 'double bogey alert');
  ok(!titles(sent).some(t => t.startsWith('📈')), 'no lead alert on the first scores of the day');
  ok(!titles(sent).some(t => t.startsWith('💰')), 'no skin (par is low)');
  const act = await page.evaluate(() => window.__doc.cartActivity);
  ok(act && act['1'] && act['2'] && act['1'].done === false && act['1'].at > 0, 'cart activity written for the 20-minute check');

  // Hole 2: Team 1 birdies both -> takes the lead (2-Ball net); Brent's birdie is the only birdie -> skin? both Brent and John 3: tie, no skin
  sent.length = 0;
  await set(page, [[1,1,2,3],[1,2,2,3],[2,1,2,4],[2,2,2,4]]);
  await page.waitForTimeout(150);
  ok(!titles(sent).some(t => t.startsWith('📈')), 'hole 2 ties it up: no lead alert');
  ok(!titles(sent).some(t => t.startsWith('💰')), 'tied low score: no skin');
  // Hole 3: Mike outright birdie -> skin once everyone has played the hole
  sent.length = 0;
  await set(page, [[2,2,3,3],[2,1,3,4],[1,1,3,4]]);
  ok(!titles(sent).some(t => t.startsWith('💰')), 'no skin until everyone has played the hole');
  await set(page, [[1,2,3,4]]); await page.waitForTimeout(150);
  ok(titles(sent).includes('💰 Mike wins the skin on 3'), 'skin alert once the hole is complete: ' + titles(sent).join(' | '));
  ok(titles(sent).filter(t => t.startsWith('📈')).length === 1 && titles(sent).includes('📈 Team 2 (Jordia) takes the lead in 2-Ball'), 'lead change once hole 3 is finished by everyone');

  // Missed hole: cart 1 enters hole 5 with hole 4 blank -> to cart 1 only, includes this phone, opens hole 4
  sent.length = 0;
  await set(page, [[1,1,5,4]]); await page.waitForTimeout(150);
  const miss = sent.find(a => a.title.startsWith('⚠️'));
  ok(miss && miss.title === '⚠️ Cart 1: hole 4 is missing a score' && miss.cart === '1' && miss.self === true && miss.view === 'hole-4', 'missed hole alert to cart 1: ' + JSON.stringify(miss));
  // Score changed after moving on
  sent.length = 0;
  await set(page, [[1,1,2,4]]); await page.waitForTimeout(150);
  ok(titles(sent).includes("✏️ Admin changed Brent's 3 to a 4 on 2"), 'score changed alert: ' + titles(sent).join(' | '));
  // Fixing the current hole while still on it is not a "change"
  sent.length = 0;
  await set(page, [[2,1,4,6],[2,1,4,4]]); await page.waitForTimeout(150);
  ok(!titles(sent).some(t => t.startsWith('✏️')), 'correcting a score before moving on does not alert');

  // Fill holes 4-9 par for everyone -> the turn
  sent.length = 0;
  const fill = (from, to) => { let l = []; for (let h = from; h <= to; h++) for (const [g,p] of [[1,1],[1,2],[2,1],[2,2]]) l.push([g,p,h,pars[h-1]]); return l; };
  await set(page, fill(4, 9).filter(([g,p,h]) => !(g === 1 && p === 1 && h === 5)));
  await page.waitForTimeout(200);
  const turn = sent.find(a => a.title.startsWith('🔄'));
  ok(turn && turn.title === "🔄 Everyone's through 9" && /2-Ball (Team \d|tied)/.test(turn.body), 'turn alert: ' + JSON.stringify(turn && [turn.title, turn.body]));
  // Finish -> all carts finished
  sent.length = 0;
  await set(page, fill(10, 18)); await page.waitForTimeout(200);
  ok(titles(sent).includes('✅ All carts finished'), 'all carts finished alert');
  ok(sent.filter(a => a.title.startsWith('🔄')).length === 0, 'turn alert only once');

  // Tapping the missed-hole alert opens that hole
  await page.evaluate(() => openAlertView('hole-4')); await page.waitForTimeout(150);
  ok(await page.evaluate(() => document.querySelector('.screen.active').id === 'step-3' && roundData.currentHole === 4), 'missed-hole alert opens hole 4');
  // Switch off: doubles off -> nothing
  await page.evaluate(() => { roundData.alerts = { doubles: false }; });
  sent.length = 0;
  await page.evaluate(() => { roundData.roundId = 8; }); // new round id so nothing is "already sent"
  await set(page, [[2,2,1,9]]); await page.waitForTimeout(150);
  ok(!titles(sent).some(t => t.includes('made a 9')), 'switched off: no double alert');
  await page.close();

  // Our Match only round: match over alert with money
  const omr = round({ betAmount: 0, skinsAmount: 0, ourMatch: { sideA: [{ g: 1, p: 1 }, { g: 1, p: 2 }], sideB: [{ g: 2, p: 1 }, { g: 2, p: 2 }], nassauBet: 50, ballBet: 25 } });
  ({ page, sent } = await open(browser, omr));
  const all = []; for (let h = 1; h <= 18; h++) for (const [g,p] of [[1,1],[1,2],[2,1],[2,2]]) all.push([g,p,h, g === 1 && p === 1 && h === 1 ? 4 : pars[h-1]]);
  await set(page, all); await page.waitForTimeout(300);
  const over = sent.find(a => a.title.startsWith('🏁 Our Match'));
  ok(over && over.title === '🏁 Our Match: Brent & John +$' + over.title.split('+$')[1] && over.body.includes('Jordia pays Brent') && over.view === 'our-match', 'Our Match over alert: ' + JSON.stringify(over && [over.title, over.body]));
  const turnOM = sent.find(a => a.title.startsWith('🔄'));
  ok(turnOM && turnOM.body.includes('per person'), 'turn in Our Match only: front money: ' + (turnOM && turnOM.body));
  ok(!sent.some(a => a.title.startsWith('💰') || a.title.startsWith('📈')), 'Our Match only: no skins or lead alerts');
  await page.close();

  // Cart phone: subscription remembers its cart
  ({ page, sent } = await open(browser, round(), '?cart=2'));
  await page.evaluate(async () => {
    const fakeSub = { endpoint: 'https://push.example.com/c2', toJSON: () => ({ endpoint: 'https://push.example.com/c2', keys: { p256dh: 'PK', auth: 'AU' } }) };
    await saveAlertSubscription(fakeSub);
  });
  const subs = await page.evaluate(() => window.__docs.push_subs.subs);
  ok(Object.values(subs)[0].cart === '2', 'cart phone saved with cart 2');
  await browser.close();
  console.log(fails ? `${fails} FAILED` : 'ALL PASS'); process.exit(fails ? 1 : 0);
})();
