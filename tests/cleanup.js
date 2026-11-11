// Cleanup: Share & message row, undo last score, side bets heading, Sign-up inside Who's playing, carts share the link only
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs = require('fs');
const stub = fs.readFileSync(__dirname + '/stub.js', 'utf8');
const html = fs.readFileSync(__dirname + '/../index.html', 'utf8');
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const mk = async docs => { const p = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 }); p.setDefaultTimeout(6000);
    p.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; }); p.on('dialog', d => d.accept());
    await p.route('**/*', r => { const u = r.request().url();
      if (u.includes('gstatic')) return r.fulfill({ contentType: 'text/javascript', body: u.includes('app-compat') ? stub : '' });
      if (u.startsWith('http://app.test/')) return r.fulfill({ contentType: 'text/html', body: html });
      return r.abort(); });
    await p.addInitScript(d => { window.__docsInit = d; }, docs || {}); return p; };
  const page = await mk({});
  await page.goto('http://app.test/'); await page.waitForTimeout(400);
  await page.evaluate(() => showScreen('step-home'));
  ok(await page.evaluate(() => ![...document.querySelectorAll('.home-tile b')].some(b => b.textContent === 'Sign-up link')) && (await page.innerText('#tile-whos')).includes('Sign-up link'), 'Home: no Sign-up tile; Who\'s playing says it has the sign-up link');
  await page.screenshot({ path: __dirname + '/shots/cleanup-home.png' });
  await page.evaluate(() => { showScreen('step-1'); document.getElementById('group-count').value = 2; document.getElementById('players-per-group').value = 2; });
  await page.click('#step-1 .bar-primary[onclick="goToStep2()"]');
  for (const [id, n] of [['g1-p1','Al Adams'],['g1-p2','Bo Brown'],['g2-p1','Ed Eads'],['g2-p2','Fy Fox']]) await page.fill(`#${id}-name`, n);
  await page.evaluate(() => saveRosterCache());
  await page.click('#btn-step2-next'); await page.waitForTimeout(400);
  // menu
  ok(await page.isVisible('#share-hub-row') && !(await page.isVisible('#cart-links-row')), 'scoring: one "📣 Share & message" row');
  await page.click('#share-hub-row');
  const hub = await page.innerText('#share-hub-modal');
  ok(/Text live links to carts/.test(hub) && /Share spectator leaderboard/.test(hub), 'it holds cart links and the spectator leaderboard');
  await page.click('#share-hub-modal >> text=Share spectator leaderboard'); await page.waitForTimeout(150);
  ok(!(await page.isVisible('#share-hub-modal')) && await page.isVisible('#text-modal'), 'picking one closes the menu and opens it');
  await page.evaluate(() => document.getElementById('text-modal').classList.remove('active'));
  await page.evaluate(() => { document.getElementById('admin-share-btn-container').scrollIntoView({ block: 'center' }); });
  await page.screenshot({ path: __dirname + '/shots/cleanup-scoring.png' });
  // undo
  ok(!(await page.isVisible('#undo-score')), 'no undo before any score');
  await page.evaluate(() => { scoresDb[1][1][1] = 4; saveScoresToCloud([[1, 1]], 1); });
  await page.evaluate(() => { scoresDb[1][1][1] = 7; saveScoresToCloud([[1, 1]], 1); });
  ok((await page.innerText('#undo-score')) === "↶ Undo Al's 7 on hole 1", 'undo shows the last score: ' + await page.innerText('#undo-score'));
  await page.click('#undo-score'); await page.waitForTimeout(150);
  ok(await page.evaluate(() => scoresDb[1][1][1] === 4 && window.__docs.active_round.scoresDb['1']['1']['1'] === 4), 'undo puts back the 4, in the cloud too');
  ok((await page.innerText('#undo-score')) === "↶ Undo Al's 4 on hole 1", 'and offers the one before it');
  await page.click('#undo-score'); await page.waitForTimeout(150);
  ok(await page.evaluate(() => !scoresDb[1][1][1]) && !(await page.isVisible('#undo-score')), 'undo all the way back to blank, then the button goes away');
  // side bets heading
  await page.evaluate(() => { liveRoundInCloud = true; viewDashboard(); });
  ok((await page.innerText('#dashboard-side-bets')).replace(/\s+/g, ' ').includes('SIDE BETS NONE YET'), 'standings: "Side bets · None yet" heading with the add button');
  // carts: link only
  const docs = await page.evaluate(() => window.__docs);
  const cart = await mk(docs); await cart.goto(`http://app.test/?cart=1&r=${docs.active_round.roundData.roundId}`); await cart.waitForTimeout(1200);
  await cart.evaluate(() => viewDashboard());
  ok(await cart.isVisible('text=Share results link') && !(await cart.isVisible('#share-text-btn')), 'cart phone: Share results link only, no "Share as text instead"');
  ok(!(await cart.isVisible('#dashboard-side-bets .side-bet-add')), 'cart phone: no add side bet');
  await page.evaluate(() => viewDashboard());
  ok(await page.isVisible('#share-text-btn'), 'admin still has Share as text instead');
  await browser.close();
  console.log(fails ? `${fails} FAILED` : 'ALL PASS'); process.exit(fails ? 1 : 0);
})();
