const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs = require('fs');
const stub = fs.readFileSync(__dirname + '/stub.js', 'utf8');
const html = fs.readFileSync(__dirname + '/../index.html', 'utf8');
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  async function open(q, docs) {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
    page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
    await page.route('**/*', r => { const u = r.request().url();
      if (u.includes('gstatic')) return r.fulfill({ contentType: 'text/javascript', body: u.includes('app-compat') ? stub : '' });
      if (u.startsWith('http://app.test/')) return u.includes('logo') ? r.fulfill({ path: __dirname + '/../logo.png' }) : r.fulfill({ contentType: 'text/html', body: html });
      return r.abort(); });
    await page.addInitScript(d => { window.__docsInit = d; }, docs);
    await page.goto('http://app.test/' + q); await page.waitForTimeout(300); await page.evaluate(() => { if (document.getElementById('step-home')?.classList.contains('active')) showScreen('step-1'); }); return page;
  }
  const key = (page, d) => page.click(`.score-keypad button:text-is("${d}")`);
  const active = page => page.evaluate(() => activeScoreInputId);
  let page = await open('', {});
  await page.evaluate(() => { document.getElementById('group-count').value = 2; document.getElementById('players-per-group').value = 4; goToStep2(); });
  const names = [['g1-p1','Gary Smith'],['g1-p2','Mike Jones'],['g1-p3','Eddie Ray'],['g1-p4','Paul Kim'],['g2-p1','Al B'],['g2-p2','Bo C'],['g2-p3','Cy D'],['g2-p4','Di E']];
  for (const [id, n] of names) await page.fill(`#${id}-name`, n);
  await page.fill('#g1-p2-strokes', '1');
  await page.evaluate(() => { saveRosterCache(); processStep2(); }); await page.waitForTimeout(300);

  ok(await page.isVisible('.score-keypad'), 'admin screen shows keypad');
  ok(await page.evaluate(() => Array.from(document.querySelectorAll('.score-keypad button')).map(b => b.innerText).join()) === '1,2,3,4,5,6,7,8,Clear', 'keypad is 1-8 plus Clear');
  ok(await page.evaluate(() => Array.from(document.querySelectorAll('.score-input-field')).every(i => i.readOnly && i.inputMode === 'none')), 'score circles never open the phone keyboard');
  ok(await active(page) === 'score-input-1-1', 'first player selected to start');
  ok(await page.isVisible('.stroke-dot'), 'stroke hole shows a dot');
  await key(page, '4');
  ok(await page.evaluate(() => window.__doc.scoresDb[1][1][1]) === 4 && await active(page) === 'score-input-1-2', 'keypad 4 saves and selects next player');
  await key(page, '3'); // par 5 hole 1 at Cleveland CC -> birdie... par is 5, 3 = eagle (under)
  ok(await page.evaluate(() => document.getElementById('score-input-1-2').classList.contains('under')), 'under-par score gets the green ring');
  await page.click('label[for="score-input-1-1"]');
  ok(await active(page) === 'score-input-1-1', 'tapping a row selects that player');
  await key(page, 'Clear');
  ok(await page.evaluate(() => window.__doc.scoresDb[1][1][1]) === undefined, 'Clear removes the score');
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: __dirname + '/admin.png' });
  const fit = await page.evaluate(() => { const rows = document.querySelectorAll('.score-row'); const last = rows[rows.length - 1].getBoundingClientRect(); const pad = document.querySelector('.score-keypad').getBoundingClientRect(); return { lastRowBottom: Math.round(last.bottom), keypadTop: Math.round(pad.top), viewport: innerHeight }; });
  ok(fit.lastRowBottom <= fit.keypadTop, 'admin: all 8 players visible above the keypad without scrolling ' + JSON.stringify(fit));
  // fill rest of hole 1
  await key(page, '5');
  await page.click('label[for="score-input-1-3"]');
  for (const d of ['5','6','4','5','5','6']) await key(page, d);
  ok(await active(page) === null, 'after last player nobody is selected while waiting');
  await key(page, '8');
  ok(await page.evaluate(() => window.__doc.scoresDb[2][4][1]) === 6, 'extra tap during the wait does not overwrite last score');
  await page.waitForTimeout(2500);
  ok(await page.innerText('#current-hole-display-top') === '2', 'moved on to hole 2');
  ok(await active(page) === 'score-input-1-1', 'hole 2 starts on first player');
  ok(await page.isVisible('#admin-share-btn-container'), 'ADMIN tab shows the admin buttons');
  // Admin phone switches to a cart tab, inside a short in-app browser like the screenshot
  await page.setViewportSize({ width: 390, height: 660 });
  await page.click('.pill:text-is("CART 2")');
  ok(!(await page.isVisible('#admin-share-btn-container')), 'admin phone on CART 2 tab: no admin buttons');
  await page.click('.hole-list-row >> nth=0');
  await page.evaluate(() => window.scrollTo(0, 0));
  let f2 = await page.evaluate(() => { const rows = document.querySelectorAll('.score-row'); const last = rows[rows.length - 1].getBoundingClientRect(); return { lastRowBottom: Math.round(last.bottom), keypadTop: Math.round(document.querySelector('.score-keypad').getBoundingClientRect().top), rows: rows.length }; });
  ok(f2.lastRowBottom <= f2.keypadTop, 'cart tab on 390x660: all players visible above keypad ' + JSON.stringify(f2));
  ok(!(await page.isVisible('#admin-share-btn-container')), 'admin phone on cart hole entry: no admin buttons');
  await page.screenshot({ path: __dirname + '/cart-short.png' });
  await page.click('.pill:text-is("ADMIN")');
  ok(await page.isVisible('#admin-share-btn-container'), 'back on ADMIN tab the buttons return');
  await page.setViewportSize({ width: 390, height: 844 });
  const docs = await page.evaluate(() => JSON.parse(JSON.stringify(window.__docs)));

  // Cart view
  const cart = await open('?cart=1&r=' + docs.active_round.roundData.roundId, docs);
  ok(await cart.isVisible('#cart-scorecard-list'), 'cart opens on its All scores list');
  await cart.click('.hole-list-row >> nth=1');
  ok(await cart.isVisible('text=‹ All holes / scores') && !(await cart.isVisible('.hole-strip')), 'hole screen has ‹ All holes / scores and no hole strip');
  const band = await cart.innerText('.cart-band');
  ok(/CART 1/.test(band) && /Hole 2/.test(band) && /Par 4/.test(band) && /Synced/.test(band) && !(await cart.isVisible('.hole-nav')), 'cart hole shows band header: ' + band.replace(/\n/g,' | '));
  ok(!(await cart.isVisible('.app-logo')), 'logo hidden on scoring screen');
  await cart.screenshot({ path: __dirname + '/cart.png' });
  console.log('BAR:', await cart.evaluate(() => { const e = document.elementFromPoint(100, 70); return e.id + ' ' + e.className + ' ' + getComputedStyle(e).display + ' ' + e.outerHTML.slice(0,200); }));
  for (const d of ['4','4','5','3']) await key(cart, d);
  await cart.waitForTimeout(2500);
  ok(await cart.innerText('.cart-band-hole') === 'Hole 3' && await cart.isVisible('.score-keypad'), 'cart moves straight to hole 3 entry');
  await cart.click('text=‹ All holes / scores');
  ok(await cart.isVisible('#cart-scorecard-list'), '‹ All holes / scores goes back to the list');
  await cart.click('.hole-list-row >> nth=1');
  ok(await cart.innerText('.cart-band-hole') === 'Hole 2' && await cart.isVisible('.score-keypad'), 'tapping hole 2 in the list opens it');
  await cart.screenshot({ path: __dirname + '/cart-band.png' });
  ok(await cart.isVisible('#step-3 > .btn-success'), 'green standings button shows on the cart screen');
  ok(await cart.evaluate(() => !document.getElementById('step-3').classList.contains('admin-view')), 'cart keeps the big layout');
  await cart.click('text=‹ All holes / scores'); await cart.click('.hole-list-row >> nth=2');
  ok(!(await cart.isVisible('#admin-share-btn-container')), 'cart link: no admin buttons');
  ok(!(await cart.isVisible('#pill-nav-container')), 'no empty tab bar on cart');
  await browser.close();
  console.log(fails ? `${fails} FAILURE(S)` : 'ALL PASSED'); process.exit(fails ? 1 : 0);
})();
