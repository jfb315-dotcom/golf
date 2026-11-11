const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs = require('fs');
const stub = fs.readFileSync(__dirname + '/stub.js', 'utf8');
const html = fs.readFileSync(__dirname + '/../index.html', 'utf8');
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, timezoneId: 'America/New_York' });
  page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
  await page.route('**/*', r => { const u = r.request().url();
    if (u.includes('gstatic')) return r.fulfill({ contentType: 'text/javascript', body: u.includes('app-compat') ? stub : '' });
    if (u.startsWith('http://app.test/')) return u.includes('logo') ? r.fulfill({ path: __dirname + '/../logo.png' }) : r.fulfill({ contentType: 'text/html', body: html });
    return r.abort(); });
  await page.addInitScript(() => { window.__docsInit = {}; });
  await page.goto('http://app.test/'); await page.waitForTimeout(300); await page.evaluate(() => { if (document.getElementById('step-home')?.classList.contains('active')) showScreen('step-1'); });
  await page.click('#step-1 .bar-primary[onclick="goToStep2()"]');
  await page.fill('#round-date', '2026-10-31');
  for (const [id, n] of [['g1-p1','John Smith'],['g1-p2','Billy'],['g1-p3','Brent'],['g1-p4','Joe'],['g2-p1','Jonathan'],['g2-p2','Bart'],['g2-p3','Todd'],['g2-p4','Bobby']]) await page.fill(`#${id}-name`, n);
  await page.fill('#g2-time', '08:10');
  await page.evaluate(() => saveRosterCache());
  await page.click('#btn-step2-text');
  const pre = await page.inputValue('#share-text-content');
  console.log('----- PRE-ROUND -----\n' + pre);
  ok(pre.startsWith('JB Golf · Tournament\nSat, Oct 31 · Cleveland Country Club · 18 holes'), 'pre-round header with correct local date (Oct 31, not Oct 30)');
  ok(/Entry \$130 per player\n• Team bets \$120: 2-Ball and 3-Ball, \$20 each Front \/ Back \/ Total\n• Skins \$10\n• All birdies count in 2-Ball and 3-Ball/.test(pre), 'pre-round money lines');
  ok(/Team 1 · 8:00 AM: John, Billy, Brent, Joe\nTeam 2 · 8:10 AM: Jonathan, Bart, Todd, Bobby/.test(pre), 'pre-round teams');
  ok(!/Fishing|🎣|===/.test(pre) && !pre.includes('PRO TIP') && !pre.includes('http'), 'no fishing or emoji banner; no PRO TIP since there is no link yet');
  await page.evaluate(() => closeShareModal());
  page.on('dialog', d => d.accept());
  await page.click('#btn-step2-next'); await page.waitForTimeout(300);
  await page.evaluate(() => shareSpectatorLink());
  const spec = await page.inputValue('#text-body'); // the organizer sends it from the text screen
  console.log('----- SPECTATOR -----\n' + spec);
  ok(spec === 'JB Golf · Live leaderboard (watch only)\nTap to follow along. Want alerts (birdies, skins)? In Safari tap Share › Add to Home Screen, then open JB Golf from your Home Screen and tap Turn on alerts.\nhttp://app.test/live.html?spectator=true', 'spectator text: short tip, link last');
  await page.evaluate(() => { closeShareModal(); document.getElementById('text-modal').classList.remove('active'); });
  await page.evaluate(() => openShareMenu());
  const sms = await page.evaluate(() => cartTextFor(roundData.carts[0], 'John Bischof'));
  console.log('----- CART LINK -----\n' + sms);
  ok(sms === '⛳ JB Golf · Cart 1 · Sat, Oct 31 · Cleveland Country Club · Tee 8:00 AM\nYour scorecard: tap the link, then Share › Add to Home Screen to keep it. Already have JB Golf on your Home Screen? Just open it.\nhttp://app.test/cart.html?cart=1&r=' + await page.evaluate(() => roundData.roundId) + '&me=john%20bischof', 'cart link text: his own link (with his name), details, Home Screen tip, link last');
  const group = await page.evaluate(() => cartShareMessages[0]);
  ok(/^JB Golf · Cart 1 scorecard \(John, Billy, Brent, Joe\)/.test(group) && /cart\.html\?cart=1&r=\d+$/.test(group), 'the group-text version is still there, without a name in the link');
  const UAS = {
    safari: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
    facebook: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/470.0.0.0]',
    webview: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
    android: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36'
  };
  for (const [name, ua] of Object.entries(UAS)) {
    const ctx = await browser.newContext({ userAgent: ua, viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
    const pg = await ctx.newPage();
    await pg.route('**/*', r => { const u = r.request().url();
      if (u.includes('gstatic')) return r.fulfill({ contentType: 'text/javascript', body: u.includes('app-compat') ? stub : '' });
      if (u.startsWith('http://app.test/')) return u.includes('logo') ? r.fulfill({ path: __dirname + '/../logo.png' }) : r.fulfill({ contentType: 'text/html', body: html });
      return r.abort(); });
    await pg.addInitScript(() => { window.__docsInit = {}; });
    await pg.goto('http://app.test/?cart=1'); await pg.waitForTimeout(300);
    const shown = await pg.isVisible('#open-in-safari');
    ok(shown === (name === 'facebook' || name === 'webview'), `${name}: open-in-Safari banner ${shown ? 'shown' : 'hidden'}`);
    if (name === 'facebook') {
      await pg.screenshot({ path: __dirname + '/shots/safari-banner.png' });
      await pg.click('#open-in-safari button');
      ok(!(await pg.isVisible('#open-in-safari')), 'banner can be dismissed');
      await pg.reload(); await pg.waitForTimeout(300);
      ok(!(await pg.isVisible('#open-in-safari')), 'stays dismissed after reload');
    }
    await ctx.close();
  }
  await browser.close();
  console.log(fails ? `${fails} FAILURE(S)` : 'ALL PASSED'); process.exit(fails ? 1 : 0);
})();
