const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs = require('fs');
const stub = fs.readFileSync(__dirname + '/stub.js', 'utf8');
const html = fs.readFileSync(__dirname + '/../index.html', 'utf8');
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
  page.on('dialog', d => { console.log('  dialog', d.message().slice(0,50)); d.accept(); });
  await page.route('**/*', r => { const u = r.request().url();
    if (u.includes('gstatic')) return r.fulfill({ contentType: 'text/javascript', body: u.includes('app-compat') ? stub : '' });
    if (u.startsWith('http://app.test/')) return r.fulfill({ contentType: 'text/html', body: html });
    return r.abort(); });
  await page.addInitScript(() => { window.__docsInit = {}; });
  await page.goto('http://app.test/'); await page.waitForTimeout(300); await page.evaluate(() => { if (document.getElementById('step-home')?.classList.contains('active')) showScreen('step-1'); });
  await page.evaluate(() => { document.getElementById('group-count').value = 2; document.getElementById('players-per-group').value = 2; });
  await page.evaluate(() => startNewRound('om'));
  ok(await page.inputValue('#bet-amount') === '0' && await page.inputValue('#skins-amount') === '0', 'Only Our Match sets tournament bets to $0');
  await page.screenshot({ path: __dirname + '/shots/om-only-setup.png', fullPage: true });
  await page.click('#step-1 .bar-primary[onclick="goToStep2()"]');
  for (const [id, n] of [['g1-p1','Brent'],['g1-p2','John'],['g2-p1','Jordia'],['g2-p2','Mike']]) await page.fill(`#${id}-name`, n);
  await page.evaluate(() => saveRosterCache());
  await page.click('#btn-step2-next'); await page.waitForTimeout(300);
  // Brent birdies hole 1 (par 5)
  await page.evaluate(() => { [[1,1,4],[1,2,5],[2,1,5],[2,2,5]].forEach(([g,p,v]) => { scoresDb[g][p][1] = v; }); saveScoresToCloud([[1,1],[1,2],[2,1],[2,2]], 1); });
  ok(!(await page.isVisible('#pill-nav-container')), 'no ADMIN / CART tabs');
  ok(!(await page.isVisible('#cart-links-row')), 'no "Text live links to carts"');
  ok((await page.innerText('#current-par-display-top')).toUpperCase().startsWith('OUR MATCH'), 'header says Our Match');
  ok(await page.isVisible('#admin-hole-strip'), 'hole strip shows');
  ok(await page.$$eval('#admin-hole-strip .strip-hole', b => b.length) === 18, '18 holes in the strip');
  await page.click('#admin-hole-strip .strip-hole:nth-child(7)'); await page.waitForTimeout(200);
  ok((await page.innerText('#current-hole-display-top')) === '7', 'tap 7 jumps to hole 7');
  ok(await page.$eval('#admin-hole-strip .strip-hole:nth-child(7)', b => b.classList.contains('current')), 'hole 7 highlighted');
  ok(await page.$eval('#admin-hole-strip .strip-hole', b => b.classList.contains('done')), 'hole 1 marked done (all four scored)');
  await page.screenshot({ path: __dirname + '/shots/om-only-strip.png' });
  await page.click('#admin-hole-strip .strip-hole:nth-child(1)'); await page.waitForTimeout(200);
  ok((await page.innerText('#current-hole-display-top')) === '1', 'tap 1 jumps back');
  await page.screenshot({ path: __dirname + '/shots/om-only-scoring.png' });
  await page.click('text=View standings'); await page.waitForTimeout(200);
  ok((await page.innerText('#dashboard-payouts')) === '', 'no purse / payouts on standings');
  const dashTxt = await page.innerText('#step-dashboard');
  ok(!dashTxt.includes('LEADERBOARD') && !dashTxt.includes('BETS WON') && !dashTxt.includes('CART PROGRESS') && !dashTxt.includes('2-Ball'), 'no tournament leaderboard, bets won, cart progress or ball rows');
  ok(await page.evaluate(() => { const o = document.getElementById('dashboard-our-match'), b = document.querySelector('.om-final-banner');
    return !!(b.compareDocumentPosition(o) & Node.DOCUMENT_POSITION_FOLLOWING) && !document.querySelector('details[data-fold="live-cards"]'); }), 'summary on top, then Our Match (no separate scorecards dropdown)');
  ok(await page.$$eval('.om-tab-pane[data-tab="cards"] table', t => t.length) === 2, 'both scorecards under the Scorecards button');
  await page.screenshot({ path: __dirname + '/shots/om-only-dash.png', fullPage: true });
  ok(!(await page.$('details[data-fold="live-rules"]')), 'no rules dropdown on an Our Match round (it is in How it works)');
  await page.evaluate(() => document.querySelectorAll('.om-tab-pane').forEach(x => x.hidden = false)); const t = await page.innerText('#dashboard-our-match');
  ok(t.includes('1 – 0 · net 1 × $25') && t.includes('BREN 1'), 'birdie listed by player and counted');
  await page.evaluate(() => { document.querySelectorAll('.om-tab-pane').forEach(x => x.hidden = true); omTab = null; }); await page.waitForTimeout(50);
  ok((await page.innerText('.om-final-banner')).includes('Brent & John currently up $50 per person') && (await page.innerText('.om-grid-sum')).includes('+$50'), 'per person: 1 bet $25 + 1 birdie $25 = $50 each, in the money table and the top box');
  // Edit round keeps Only Our Match on
  await page.click('text=BACK TO SCORING'); await page.click('text=Edit setup / rosters'); await page.waitForTimeout(150);
  ok(await page.isChecked('#om-only'), 'edit: Only Our Match still on');
  // Share results goes to Our Match text
  await page.click('text=Cancel edit').catch(() => {}); await page.waitForTimeout(150);
  await page.evaluate(() => viewDashboard()); await page.click('#step-dashboard .dash-actions .text-link:has-text("Share as text")'); await page.waitForTimeout(100);
  const share = await page.inputValue('#share-text-content');
  ok(share.startsWith('JB Golf · Our Match') && share.includes('per person'), 'Share as text sends Our Match text');
  await page.evaluate(() => closeShareModal());
  await page.evaluate(() => { window.__shared = null; navigator.share = d => { window.__shared = d; return Promise.resolve(); }; shareStandingsLink(); });
  ok(await page.isVisible('#match-send-modal') && (await page.$$('.match-send-row')).length === 4, 'Share results link (Our Match): the send screen lists the four players');
  await page.screenshot({ path: __dirname + '/shots/om-view-ask.png' });
  const brentLink = await page.evaluate(() => matchLinkFor(matchSend.rd, matchSend.final, matchSendPlayers(matchSend.rd)[0].name));
  ok(/match\.html\?spectator=true&me=/.test(brentLink), 'each player gets his own live link: ' + brentLink);
  await page.evaluate(() => document.getElementById('match-send-modal').classList.remove('active'));
  await page.evaluate(() => document.getElementById('text-modal').classList.remove('active'));
  ok(await page.evaluate(() => { let m = calculateOurMatch(roundData, scoresDb, { front: { A: 5, B: 2 }, back: { A: 11, B: 13 } });
    return m.nassau.front.bets.map(b => b.from).join() === ',2,5' && m.nassau.back.bets.map(b => b.from).join() === ',11,13'; }), 'presses listed in the order they start, whoever made them');
  // Strokes on the Nassau: hole 1 is Brent 4, John 5 vs Jordia 5, Mike 5; Jordia gets a stroke there
  ok(await page.evaluate(() => {
    let rd = JSON.parse(JSON.stringify(roundData)); rd.groups[1].players[0].strokeHoles = [1];
    let gross = calculateOurMatch(rd, scoresDb, {});
    rd.ourMatch.nassauNet = true;
    let net = calculateOurMatch(rd, scoresDb, {});
    return gross.nassau.front.bets[0].diff === -1 && net.nassau.front.bets[0].diff === 0
      && net.nines[0].birdies.join() === gross.nines[0].birdies.join() && net.nines[0].birdies[1] === 0;
  }), 'net Nassau uses strokes (Jordia\'s stroke ties hole 1); birdies stay gross');
  ok(await page.evaluate(() => { let rd = JSON.parse(JSON.stringify(roundData)); rd.ourMatch.nassauNet = true; return generateOurMatchHTML(rd, scoresDb, {}, false).includes('Low ball net (strokes count)'); }), 'Nassau view says net when strokes count');
  ok(await page.evaluate(() => roundData.ourMatch.nassauNet === false), 'new matches default to a gross Nassau');
  ok(!(await page.evaluate(() => document.querySelector('#step-dashboard').textContent.includes('Share Our Match'))), '"Share Our Match" button is gone');
  ok(await page.evaluate(() => { let t = document.querySelector('.om-grid-wrap'), tabs = document.getElementById('om-tabs'); return t && tabs && !!(t.compareDocumentPosition(tabs) & 4); }), 'the buttons sit under the money table');
  ok(await page.evaluate(() => [...document.querySelectorAll('#om-tabs button span')].map(b => b.textContent).join('|')) === '1st ball → 2nd|Nassau|Scorecards', 'buttons: 1st ball → 2nd, Nassau, Scorecards');
  ok(!(await page.$('details[data-fold="om-balls"]')) && !(await page.$('details[data-fold="om-nassau-bets"]')) && !(await page.$('details[data-fold="om-nassau-holes"]')), 'the old dropdowns are gone');
  ok(await page.evaluate(() => [...document.querySelectorAll('.om-head b')].map(b => b.textContent).join('|')).then(t => t.includes('Nassau · Front 9') && t.includes('1st ball goes to 2nd ball · Front 9') && t.includes('Team Birdies · Front 9')), 'bold headers for Nassau, 1st ball goes to 2nd ball, Team Birdies');
  // a spectator opening that link sees Our Match, without press buttons
  const docs = await page.evaluate(() => window.__docs);
  const sp = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  sp.on('pageerror', e => { console.log('SP ERROR', e.message); fails++; });
  await sp.route('**/*', r => { const u = r.request().url();
    if (u.includes('gstatic')) return r.fulfill({ contentType: 'text/javascript', body: u.includes('app-compat') ? stub : '' });
    if (u.startsWith('http://app.test/')) return r.fulfill({ contentType: 'text/html', body: html });
    return r.abort(); });
  await sp.addInitScript(d => { window.__docsInit = d; }, docs);
  await sp.goto('http://app.test/?spectator=true&om=1'); await sp.waitForTimeout(600);
  ok(await sp.isVisible('#our-match') && !(await sp.$('.om-press')), 'spectator link shows Our Match, no press buttons');
  ok(await sp.evaluate(() => !!document.getElementById('om-tabs') && [...document.querySelectorAll('.om-tab-pane')].every(p => p.hidden) && !document.querySelector('details[data-fold="om-presses"]')), 'Our Match link: same buttons as the organizer, nothing open, no Presses made / Undo');
  await page.evaluate(() => shareSpectatorLink()); await page.waitForTimeout(100);
  ok(await page.isVisible('#match-send-modal') && (await page.textContent('#match-send-title')) === 'Send the match', 'Send the match to the other players: the per-person send screen');
  const mikeText = await page.evaluate(() => matchTextFor(roundData, false, 'Mike Jones'));
  ok(mikeText.includes('match.html?spectator=true&me=mike%20jones') && mikeText.includes('tap to follow along from your side'), "Mike's text has his own link: " + JSON.stringify(mikeText));
  await page.evaluate(() => document.getElementById('match-send-modal').classList.remove('active'));
  // the other cart's view: their names first, + = them, the money the other way round
  await sp.goto('http://app.test/?spectator=true&om=2'); await sp.waitForTimeout(600);
  ok(await sp.evaluate(() => document.querySelector('#our-match .om-side.a').textContent === 'Jordia & Mike' && document.querySelector('#our-match .om-sum-head').textContent.includes('+ = Jordia & Mike')), 'om=2: Jordia & Mike first, + = Jordia & Mike');
  ok((await sp.innerText('.om-grid-sum')).includes('−$50'), 'om=2: total shows −$50 for them (Brent & John see +$50)');
  ok((await sp.innerText('.om-final-banner')).includes('Trending Brent & John') && (await sp.innerText('.om-final-banner')).includes('Jordia & Mike currently down $50'), 'om=2: top box from their side (they are down)');
  { const hh = await sp.evaluate(() => document.body.scrollHeight); await sp.setViewportSize({ width: 390, height: Math.min(hh, 2400) }); await sp.screenshot({ path: __dirname + '/shots/om-view-b.png' }); await sp.setViewportSize({ width: 390, height: 844 }); }
  await sp.goto('http://app.test/?spectator=true&om=1'); await sp.waitForTimeout(600);
  ok((await sp.innerText('.om-grid-sum')).includes('+$50') && await sp.evaluate(() => document.querySelector('#our-match .om-side.a').textContent === 'Brent & John'), 'om=1: Brent & John\'s view, +$50');
  { const hh = await sp.evaluate(() => document.body.scrollHeight); await sp.setViewportSize({ width: 390, height: Math.min(hh, 4000) }); await sp.screenshot({ path: __dirname + '/shots/om-spectator.png' }); await sp.setViewportSize({ width: 390, height: 844 }); }
  await sp.goto('http://app.test/?spectator=true'); await sp.waitForTimeout(600);
  ok(!(await sp.$('#our-match')), 'plain spectator link still hides Our Match');
  { await page.evaluate(() => { switchScreen('step-dashboard', 'step-3'); document.body.style.minHeight = '3000px'; window.scrollTo(0, 99999); });
    let before = await page.evaluate(() => window.scrollY);
    await page.click('#step-3 button:has-text("View standings")'); await page.waitForTimeout(150);
    ok(before > 100 && await page.evaluate(() => window.scrollY) === 0, 'View standings opens at the very top (was scrolled ' + before + ')');
    await page.evaluate(() => { window.scrollTo(0, 400); viewDashboard(); });
    ok(await page.evaluate(() => window.scrollY) === 400, 'live refresh keeps your place');
    await page.evaluate(() => { document.body.style.minHeight = ''; window.scrollTo(0, 0); }); }
  ok(await page.evaluate(() => { let b = document.querySelector('#step-dashboard .om-final-banner.pending'); return b && b.textContent.includes('Final results · pending') && b.textContent.includes('Trending Brent & John') && b.textContent.includes('Brent & John currently up $50 per person'); }), 'live: pending banner trending toward the side that is up');
  { await page.setViewportSize({ width: 390, height: 900 }); await page.evaluate(() => scrollTo(0,0)); await page.screenshot({ path: __dirname + '/shots/om-pending.png' }); await page.setViewportSize({ width: 390, height: 844 }); }
  await page.evaluate(() => { showingFinalResults = true; viewDashboard(); });
  ok(await page.evaluate(() => { let b = document.querySelector('#step-dashboard .om-final-banner'), m = document.getElementById('our-match');
    return b && !b.classList.contains('pending') && /pays/.test(b.textContent) && b.textContent.includes('See the breakdowns below') && (b.compareDocumentPosition(m) & 4); }), 'final: one-line who pays who at the top, then Our Match');
  ok(await page.evaluate(() => { renderArchivedRound({ roundData: JSON.parse(JSON.stringify(roundData)), scoresDb }); let el = document.getElementById('archived-card-container'); return el.firstElementChild.classList.contains('om-final-banner') && !el.querySelector('details') && document.querySelectorAll('#archived-our-match-container .om-tab-pane[data-tab="cards"] table').length === 2; }), 'results page: same final line on top, scorecards under the Scorecards button');
  { const hh = await page.evaluate(() => document.body.scrollHeight); await page.setViewportSize({ width: 390, height: 1100 }); await page.evaluate(() => scrollTo(0,0)); await page.screenshot({ path: __dirname + '/shots/om-final-top.png' }); }
  await page.evaluate(() => { showingFinalResults = false; viewDashboard(); });
  await page.evaluate(() => document.querySelector('.back-to-scoring').style.visibility = 'hidden');
  await page.evaluate(() => showOmTab('nassau'));
  const h = await page.evaluate(() => document.body.scrollHeight);
  await page.setViewportSize({ width: 390, height: Math.min(h, 6000) });
  await page.screenshot({ path: __dirname + '/shots/om-new.png', fullPage: true });
  await browser.close();
  console.log(fails ? `${fails} FAILED` : 'ALL PASS'); process.exit(fails ? 1 : 0);
})();
