// Per-person cart links: each player gets his own text; a JB Golf icon saved from it finds his cart by name in later rounds
const { chromium, devices } = require('/opt/node22/lib/node_modules/playwright');
const fs = require('fs');
const stub = fs.readFileSync(__dirname + '/stub.js', 'utf8');
const html = fs.readFileSync(__dirname + '/../index.html', 'utf8');
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const route = p => p.route('**/*', r => { const u = r.request().url();
    if (u.includes('gstatic')) return r.fulfill({ contentType: 'text/javascript', body: u.includes('app-compat') ? stub : '' });
    if (u.startsWith('http://app.test/')) return r.fulfill({ contentType: 'text/html', body: html });
    return r.abort(); });
  const players = { saved_players: { players: {
    'brent copeland': { name: 'Brent Copeland', first: 'Brent', last: 'Copeland', phone: '(423) 555-0103' },
    'mike jones': { name: 'Mike Jones', first: 'Mike', last: 'Jones' },
    'john bischof': { name: 'John Bischof', first: 'John', last: 'Bischof', phone: '(423) 555-0102' },
    'chad smith': { name: 'Chad Smith', first: 'Chad', last: 'Smith', phone: '(423) 555-0104' } } } };
  const startRound = async (admin, four) => {
    await admin.evaluate(() => { startNewRound('tournament'); document.getElementById('group-count').value = 2; document.getElementById('players-per-group').value = 2; });
    await admin.click('#step-1 .bar-primary[onclick="goToStep2()"]');
    for (const [id, n] of [['#g1-p1-name', four[0]], ['#g1-p2-name', four[1]], ['#g2-p1-name', four[2]], ['#g2-p2-name', four[3]]]) await admin.fill(id, n);
    await admin.evaluate(() => saveRosterCache());
    await admin.click('#btn-step2-next'); await admin.waitForTimeout(500);
  };
  const admin = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 }); admin.setDefaultTimeout(5000);
  admin.on('dialog', d => d.accept()); admin.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
  await route(admin); await admin.addInitScript(d => { window.__docsInit = d; }, players);
  await admin.goto('http://app.test/?beta=0'); await admin.waitForTimeout(500);
  await admin.evaluate(() => changeTheme('fairway'));
  // week 1: Brent & Mike in Cart 1, John & Chad in Cart 2
  await startRound(admin, ['Brent Copeland', 'Mike Jones', 'John Bischof', 'Chad Smith']);
  await admin.evaluate(() => openShareMenu()); await admin.waitForTimeout(200);
  const rows = await admin.$$eval('#share-buttons-container .match-send-row', r => r.map(x => x.innerText.replace(/\s+/g, ' ')));
  console.log(rows.join(' | '));
  ok(rows.length === 4 && /Brent Copeland.*💬 Text/.test(rows[0]) && /Mike Jones.*Copy link/.test(rows[1]), 'Text live links to carts lists each player (Text, or Copy link with no number)');
  ok(await admin.$$eval('.cart-send-group', b => b.length) === 2, 'each cart still has Share to a group text');
  await admin.screenshot({ path: __dirname + '/shots/cartme-send.png' });
  let sms = '';
  await admin.exposeFunction('__sms', u => { sms = u; });
  await admin.evaluate(() => { window.openSms = u => window.__sms(u); });
  await admin.click('#share-buttons-container .match-send-row >> nth=0 >> .match-send-btn'); await admin.waitForTimeout(200);
  const rid1 = await admin.evaluate(() => String(roundData.roundId));
  ok(/4235550103/.test(sms) && decodeURIComponent(sms).includes(`cart.html?cart=1&r=${rid1}&me=brent%20copeland`), "Text opens a message to Brent only, with his own cart link");
  ok((await admin.innerText('#share-buttons-container .match-send-row >> nth=0')).includes('Texted'), "Brent's row shows ✓ Texted");
  // John saves his own link (Cart 2, week 1) to his Home Screen
  const johnIcon = `?cart=2&r=${rid1}&me=john%20bischof`;
  // week 2: John moves to Cart 1 with Chad; Brent & Mike in Cart 2
  await startRound(admin, ['John Bischof', 'Chad Smith', 'Brent Copeland', 'Mike Jones']);
  const docs = await admin.evaluate(() => JSON.parse(JSON.stringify(window.__docs)));
  const iphone = { ...devices['iPhone 13'], deviceScaleFactor: 2 };
  const open = async q => { const ctx = await browser.newContext(iphone); const p = await ctx.newPage(); p.setDefaultTimeout(5000);
    p.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; }); p.on('dialog', d => d.accept());
    await route(p); await p.addInitScript(d => { window.__docsInit = d; }, docs); await p.goto('http://app.test/' + q); await p.waitForTimeout(900); return p; };
  let p = await open(johnIcon);
  ok(!(await p.isVisible('#step-cartpick')) && await p.evaluate(() => lockedTeamId === 1) && (await p.textContent('#entry-container')).includes('John'), "week 2: John's icon from week 1 goes straight to his new cart (Cart 1), no question");
  await p.screenshot({ path: __dirname + '/shots/cartme-week2.png' });
  await p.context().close();
  // someone not in this round: asked as before
  p = await open(`?cart=1&r=${rid1}&me=gus%20gray`);
  ok(await p.isVisible('#step-cartpick'), 'a player not in this round is asked which cart');
  await p.context().close();
  // an icon from an older one-link-per-cart text (no name): asked as before
  p = await open(`?cart=2&r=${rid1}`);
  ok(await p.isVisible('#step-cartpick'), 'an older cart icon with no name still asks which cart');
  await p.context().close();
  // this round's own link still wins
  const rid2 = await admin.evaluate(() => String(roundData.roundId));
  p = await open(`?cart=2&r=${rid2}&me=john%20bischof`);
  ok(await p.evaluate(() => lockedTeamId === 2), "a link made for this round opens the cart it was made for");
  await p.context().close();
  await browser.close();
  console.log(fails ? `${fails} FAILED` : 'ALL PASS'); process.exit(fails ? 1 : 0);
})();
