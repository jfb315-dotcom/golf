const innerH = vp => vp.height;
// Admin phone in the test copy, looking at a cart through the CART tabs: do all 4 players show above the keypad?
// Sizes are Home Screen apps (no Safari bars): iPhone SE, 14/15, 15 Pro Max. Also a real cart phone.
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs = require('fs');
const stub = fs.readFileSync(__dirname + '/stub.js', 'utf8');
const html = fs.readFileSync(__dirname + '/../index.html', 'utf8');
const tag = process.argv[2] || 'now';
let bad = 0;
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const mk = async (docs, vp) => { const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 2 }); const p = await ctx.newPage(); p.setDefaultTimeout(6000);
    p.on('dialog', d => d.accept()); p.on('pageerror', e => console.log('ERR', e.message));
    await p.route('**/*', r => { const u = r.request().url();
      if (u.includes('gstatic')) return r.fulfill({ contentType: 'text/javascript', body: u.includes('app-compat') ? stub : '' });
      if (u.startsWith('http://app.test/')) return r.fulfill({ contentType: 'text/html', body: html });
      return r.abort(); });
    await p.addInitScript(d => { window.__docsInit = d; }, docs); return p; };
  const measure = p => p.evaluate(() => {
    let rows = [...document.querySelectorAll('#entry-container .score-row')];
    window.__below = [...document.querySelectorAll('#step-3 button, #step-3 a')].filter(b => b.offsetParent && b.getBoundingClientRect().top > (document.querySelector('.score-keypad')?.getBoundingClientRect().bottom || 0)).map(b => b.textContent.trim().replace(/\s+/g,' ').slice(0,30) + '@' + Math.round(b.getBoundingClientRect().top) + '-' + Math.round(b.getBoundingClientRect().bottom));
    let last = rows[rows.length - 1].getBoundingClientRect();
    let kp = document.querySelector('.score-keypad').getBoundingClientRect();
    return { lastBottom: Math.round(last.bottom), keypadTop: Math.round(kp.top), keypadBottom: Math.round(kp.bottom), h: innerHeight, strip: getComputedStyle(document.getElementById('admin-hole-strip')).display !== 'none' };
  });
  const sizes = [{ width: 375, height: 647, n: 'iPhone SE' }, { width: 390, height: 797, n: 'iPhone 14/15' }, { width: 430, height: 885, n: 'iPhone Pro Max' }];
  for (const vp of sizes) {
    const a = await mk({}, { width: vp.width, height: vp.height });
    await a.goto('http://app.test/?beta=1'); await a.waitForTimeout(400);
    await a.evaluate(() => { showScreen('step-1'); document.getElementById('group-count').value = 2; document.getElementById('players-per-group').value = 4; });
    await a.click('text=Next: games & money'); await a.click('text=Next: players & teams');
    const names = ['John Bischof','Brent Copeland','Chad Copeland','Bart Hamilton','Ed Eads','Fy Fox','Gus Gray','Hal Hart'];
    for (let i = 0; i < 8; i++) await a.fill(`#g${Math.floor(i / 4) + 1}-p${i % 4 + 1}-name`, names[i]);
    await a.evaluate(() => saveRosterCache());
    await a.click('text=Next: extras & review'); await a.click('#btn-step2-next'); await a.waitForTimeout(400);
    // admin tabs over to Cart 1 and opens hole 1
    await a.click('#pill-nav-container button:has-text("CART 1"), #pill-nav-container :text("CART 1")'); await a.waitForTimeout(300);
    await a.evaluate(() => { if (!document.getElementById('step-3').classList.contains('cart-hole-view')) openHoleForScoring(1); }); await a.waitForTimeout(250);
    let m = await measure(a);
    console.log('  admin below keypad:', JSON.stringify(await a.evaluate(() => window.__below)), 'page height', await a.evaluate(() => document.documentElement.scrollHeight));
    let ok1 = m.lastBottom <= m.keypadTop && m.keypadBottom <= m.h && !m.strip;
    if (!ok1) bad++;
    console.log(`admin→Cart 1 ${vp.n} ${vp.width}x${vp.height}: 4th player ends ${m.lastBottom}, keypad ${m.keypadTop}-${m.keypadBottom} of ${m.h}, strip ${m.strip ? 'SHOWING' : 'hidden'} -> ${ok1 ? 'fits' : 'HIDDEN/SCROLL'}`);
    if (vp.width === 390) await a.screenshot({ path: __dirname + `/shots/fit3-admincart-${tag}.png` });
    // a real cart phone
    const docs = await a.evaluate(() => window.__docs);
    const c = await mk(docs, { width: vp.width, height: vp.height });
    await c.goto(`http://app.test/?cart=1&r=${docs.beta_active_round.roundData.roundId}&beta=1`); await c.waitForTimeout(1300);
    await c.evaluate(() => openHoleForScoring(1)); await c.waitForTimeout(250);
    m = await measure(c);
    console.log('  cart below keypad:', JSON.stringify(await c.evaluate(() => window.__below)), 'page height', await c.evaluate(() => document.documentElement.scrollHeight));
    let pill = await c.evaluate(() => { let b = [document.querySelector('#step-3 > .btn-success'), document.querySelector('.rv-stand-pill')].find(x => x && x.offsetParent); if (!b) return null; let r = b.getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom), right: Math.round(r.right), w: innerWidth }; });
    console.log('  standings pill:', JSON.stringify(pill));
    if (!pill) bad++; console.log('  standings bar ' + (pill && pill.bottom <= innerH(vp) ? 'fully on screen' : 'needs a scroll'));
    if (vp.width === 390) { await c.click('#step-3 > .btn-success:visible, .rv-stand-pill:visible'); await c.waitForTimeout(300); if (!(await c.evaluate(() => document.getElementById('step-dashboard').classList.contains('active')))) { bad++; console.log('  pill did not open standings'); } else console.log('  pill opens standings'); await c.evaluate(() => goLiveScoring && goLiveScoring()); }
    let ok2 = m.lastBottom <= m.keypadTop && m.keypadBottom <= m.h;
    if (!ok2) bad++;
    console.log(`cart phone   ${vp.n} ${vp.width}x${vp.height}: 4th player ends ${m.lastBottom}, keypad ${m.keypadTop}-${m.keypadBottom} of ${m.h} -> ${ok2 ? 'fits' : 'HIDDEN/SCROLL'}`);
    if (vp.width === 390) await c.evaluate(() => openHoleForScoring(1)), await c.waitForTimeout(200), await c.screenshot({ path: __dirname + `/shots/fit3-cart-${tag}.png` });
    await a.context().close(); await c.context().close();
  }
  await browser.close();
  console.log(bad ? `${bad} DON'T FIT` : 'ALL FIT'); process.exit(bad ? 1 : 0);
})();
