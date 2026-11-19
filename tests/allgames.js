// 3-Ball with 2-man teams can't be picked (and old rounds that had it balance); Standings/results: no who pays who anywhere,
// purse → leaderboard → team bets won → skins, then three buttons (See all the math / Scorecards / Rules) that open one at a time
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs = require('fs');
const stub = fs.readFileSync(__dirname + '/stub.js', 'utf8');
const html = fs.readFileSync(process.argv[2] || __dirname + '/../index.html', 'utf8');
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
  await page.evaluate(() => showScreen('step-1'));
  // ---- 3-Ball needs 3 a team ----
  await page.evaluate(() => { document.getElementById('fmt-3').checked = true; document.getElementById('players-per-group').value = 4; calculateLiveBuyIn(); });
  const fee4 = await page.innerText('#live-buyin-display');
  await page.click('[aria-label="Fewer players"], #players-per-group ~ button, .stepper button[aria-label*="ewer"]').catch(() => {});
  await page.evaluate(() => { let el = document.getElementById('players-per-group'); el.value = 2; el.dispatchEvent(new Event('change')); });
  const st = await page.evaluate(() => ({ dis: document.getElementById('fmt-3').disabled, chk: document.getElementById('fmt-3').checked, note: document.querySelector('#fmt-3').closest('.format-row').innerText, fee: document.getElementById('live-buyin-display').innerText }));
  ok(st.dis && !st.chk && st.note.includes('needs 3 a team'), '2-man teams: 3-Ball greyed out and unchecked: ' + JSON.stringify(st));
  ok(st.fee !== fee4, 'entry fee drops the 3-Ball bets: ' + fee4 + ' -> ' + st.fee);
  await page.evaluate(() => { let el = document.getElementById('players-per-group'); el.value = 3; el.dispatchEvent(new Event('change')); });
  ok(await page.evaluate(() => !document.getElementById('fmt-3').disabled && !document.querySelector('#fmt-3').closest('.format-row').querySelector('.fmt-note')), '3-man teams: 3-Ball available again');
  // an old round that had 3-Ball with 2-man teams now balances
  const bal = await page.evaluate(() => {
    let rd = { course: { name: 'X', pars: Array(18).fill(4) }, playMode: '18', startType: 'front', startHole: 1, endHole: 18, formats: [2, 3], birdieRules: {}, betAmount: 10, skinsAmount: 0,
      groups: [1, 2].map(g => ({ id: g, captain: 'C' + g, players: [1, 2].map(p => ({ id: p, name: `P${g}${p} L` })) })), carts: [] };
    let sDb = { 1: { 1: {}, 2: {} }, 2: { 1: {}, 2: {} } };
    for (let h = 1; h <= 18; h++) { sDb[1][1][h] = 4; sDb[1][2][h] = 5; sDb[2][1][h] = 4 + (h === 3 ? 1 : 0); sDb[2][2][h] = 5; }
    let pay = calculatePayouts(rd, sDb);
    return { net: pay.players.reduce((a, x) => a + x.netCents, 0), bets: pay.totalBets, buyIn: pay.players[0].buyInCents };
  });
  ok(bal.net === 0 && bal.bets === 3 && bal.buyIn === 3000, 'old 2-man round with 3-Ball: only the 2-Ball bets count, money balances: ' + JSON.stringify(bal));

  // ---- Standings: no who pays who; purse, leaderboard, team bets won, skins; then three buttons ----
  await page.evaluate(() => { document.getElementById('group-count').value = 2; let el = document.getElementById('players-per-group'); el.value = 4; el.dispatchEvent(new Event('change'));
    document.getElementById('fmt-2').checked = true; document.getElementById('bet-amount').value = 10; document.getElementById('skins-amount').value = 5;
    let e = document.getElementById('om-enabled'); e.checked = true; toggleOurMatchOptions(); });
  await page.click('#step-1 .bar-primary[onclick="goToStep2()"]');
  const names = ['Al Adams','Bo Brown','Cy Cole','Di Dunn','Ed Eads','Fy Fox','Gus Gray','Hal Hart'];
  for (let i = 0; i < 8; i++) await page.fill(`#g${Math.floor(i / 4) + 1}-p${i % 4 + 1}-name`, names[i]);
  await page.evaluate(() => { saveRosterCache(); tempRosterCache.sideBets = [{ a1: '1-3', a2: '2-3', b1: '1-4', b2: '2-4', amount: 10, allBirdies: false }]; renderSideBets(); });
  await page.click('#btn-step2-next'); await page.waitForTimeout(400);
  await page.evaluate(() => { let pars = roundData.course.pars; for (let h = 1; h <= 18; h++) { let who = []; roundData.groups.forEach(g => g.players.forEach(p => { scoresDb[g.id][p.id] = scoresDb[g.id][p.id] || {}; scoresDb[g.id][p.id][h] = pars[h - 1] + ((g.id * 3 + p.id * 5 + h) % 4 === 0 ? -1 : (g.id + p.id * h) % 3); who.push([g.id, p.id]); })); saveScoresToCloud(who, h); } viewDashboard(); });
  await page.waitForTimeout(200);
  // the order, the buttons, and no "pays" anywhere on the page
  const layout = async (p, scr, tabs) => p.evaluate(([scr, tabs]) => {
    let sc = document.getElementById(scr), t = sc.innerText;
    let at = re => { let m = t.search(re); return m < 0 ? 1e9 : m; };
    let btns = document.getElementById(tabs);
    return { pays: (t.match(/.{0,60}\bpays\b.{0,30}/gi) || []).join(' | '), allGames: !!sc.querySelector('.all-games'),
      order: [at(/Purse/i), at(/Purse/i) + t.slice(at(/Purse/i)).search(/Leaderboard/i), at(/Team bets won/i), at(/Skins ·/i), btns ? t.indexOf(btns.innerText.trim().split('\n')[0]) : -1],
      buttons: btns ? [...btns.querySelectorAll('button')].map(b => b.id) : [],
      cardsUp: [...sc.querySelectorAll('.team-scorecard, details[data-fold$="cards"]')].filter(e => e.offsetParent && !e.closest('.view-pane')).length,
      rulesUp: !!sc.querySelector('details[data-fold="live-rules"]') };
  }, [scr, tabs]);
  const inOrder = o => o.every((v, i) => v >= 0 && v < 1e9 && (i === 0 || v > o[i - 1]));
  let L = await layout(page, 'step-dashboard', 'live-tabs');
  console.log(JSON.stringify(L));
  ok(!L.pays && !L.allGames, 'standings: no who pays who anywhere (tournament + Our Match + side bets)');
  ok(inOrder(L.order), 'standings: purse, leaderboard, team bets won, skins, then the buttons: ' + L.order);
  ok(L.buttons.join() === 'live-tabs-math,live-tabs-cards,live-tabs-rules', 'three buttons across: See all the math, Scorecards, Rules');
  ok(L.cardsUp === 0 && !L.rulesUp, 'no scorecards at the top and no rules dropdown');
  const panes = () => page.evaluate(() => [...document.querySelectorAll('.view-pane[data-view="live-tabs"]')].filter(p => !p.hidden).map(p => p.dataset.tab).join());
  ok(await panes() === '', 'all three closed to start');
  await page.click('#live-tabs-cards'); ok(await panes() === 'cards' && await page.evaluate(() => !!document.querySelector('.view-pane[data-tab="cards"] .team-scorecard, .view-pane[data-tab="cards"] table')), 'Scorecards opens the team scorecards');
  await page.click('#live-tabs-rules'); ok(await panes() === 'rules' && /Buy-in per player/.test(await page.innerText('.view-pane[data-tab="rules"]')), 'Rules opens the rules (one view at a time)');
  // a new score coming in keeps it open
  await page.evaluate(() => viewDashboard()); ok(await panes() === 'rules', 'a refresh leaves Rules open');
  await page.click('#live-tabs-math'); ok(await panes() === 'math' && /Each team bet/i.test(await page.innerText('.view-pane[data-tab="math"]')), 'See all the math opens the bets grid');
  ok(await page.evaluate(() => !document.getElementById('om-tabs') || [...document.querySelectorAll('.om-tab-pane:not(.view-pane)')].every(p => p.hidden)), 'Our Match views stay as they were');
  await page.click('#live-tabs-math'); ok(await panes() === '', 'tap again to close');
  await page.click('#live-tabs-cards');
  await page.evaluate(() => { document.querySelector('.back-to-scoring').style.visibility = 'hidden'; document.getElementById('dashboard-payouts').scrollIntoView(); });
  await page.screenshot({ path: __dirname + '/shots/standings-top.png' });
  await page.evaluate(() => { document.getElementById('live-tabs').scrollIntoView(); window.scrollBy(0, -20); });
  await page.screenshot({ path: __dirname + '/shots/standings-buttons.png' });
  // spectator: same, no cards at the top
  const docs = await page.evaluate(() => window.__docs);
  const sp = await mk(docs); await sp.goto('http://app.test/?spectator=true'); await sp.waitForTimeout(1200); await sp.evaluate(() => viewDashboard());
  let S = await layout(sp, 'step-dashboard', 'live-tabs');
  ok(!S.pays && inOrder(S.order) && S.cardsUp === 0 && S.buttons.length === 3, 'spectator: same layout, no who pays who, no cards at the top: ' + JSON.stringify(S));
  // Our Match line says who won, not who pays
  ok(await page.evaluate(() => { let m = calculateOurMatch(roundData, scoresDb, matchPresses); return !/pays/.test(matchSettleLine(m, m.totalMoney)) && /win \$\d+ per person|All square/.test(matchSettleLine(m, m.totalMoney)); }), 'Our Match line says which pair won and how much');
  // shared results text has no who pays who
  // results page (Past rounds): same
  await page.evaluate(() => { liveRoundInCloud = true; });
  page.evaluate(() => validateAndFinalize()); await page.waitForTimeout(200); for (const d of '1234') await page.click(`.pin-pad button:text-is("${d}")`); await page.waitForTimeout(500);
  await page.evaluate(() => { document.getElementById('text-modal').classList.remove('active'); document.querySelectorAll('.modal-overlay.active').forEach(m => m.classList.remove('active')); let a = JSON.parse(localStorage.getItem('tournamentArchive')).slice(-1)[0]; renderArchivedRound(a); switchScreen('step-8', 'step-9'); });
  await page.waitForTimeout(200);
  let A = await layout(page, 'step-9', 'arc-tabs');
  ok(!A.pays && !A.allGames && inOrder(A.order) && A.buttons.join() === 'arc-tabs-math,arc-tabs-cards,arc-tabs-rules' && A.cardsUp === 0, 'Past rounds: same order and buttons, no who pays who: ' + JSON.stringify(A));
  await page.click('#arc-tabs-rules'); ok(/Buy-in per player/.test(await page.innerText('.view-pane[data-view="arc-tabs"][data-tab="rules"]')), 'Past rounds: Rules button works');
  await page.evaluate(() => openResultsShareModal());
  ok(!/pays/i.test(await page.inputValue('#share-text-content')), 'shared results text: no who pays who');
  await browser.close();
  console.log(fails ? `${fails} FAILED` : 'ALL PASS'); process.exit(fails ? 1 : 0);
})();
