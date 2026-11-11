// 3-Ball with 2-man teams can't be picked (and old rounds that had it balance); one who-pays-who for every game
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

  // ---- one who-pays-who for everything ----
  await page.evaluate(() => { document.getElementById('group-count').value = 2; let el = document.getElementById('players-per-group'); el.value = 4; el.dispatchEvent(new Event('change'));
    document.getElementById('fmt-2').checked = true; document.getElementById('bet-amount').value = 10; document.getElementById('skins-amount').value = 0;
    let e = document.getElementById('om-enabled'); e.checked = true; toggleOurMatchOptions(); });
  await page.click('#step-1 .bar-primary[onclick="goToStep2()"]');
  const names = ['Al Adams','Bo Brown','Cy Cole','Di Dunn','Ed Eads','Fy Fox','Gus Gray','Hal Hart'];
  for (let i = 0; i < 8; i++) await page.fill(`#g${Math.floor(i / 4) + 1}-p${i % 4 + 1}-name`, names[i]);
  await page.evaluate(() => { saveRosterCache(); tempRosterCache.sideBets = [{ a1: '1-3', a2: '2-3', b1: '1-4', b2: '2-4', amount: 10, allBirdies: false }]; renderSideBets(); });
  await page.click('#btn-step2-next'); await page.waitForTimeout(400);
  await page.evaluate(() => { let pars = roundData.course.pars; for (let h = 1; h <= 18; h++) { let who = []; roundData.groups.forEach(g => g.players.forEach(p => { scoresDb[g.id][p.id] = scoresDb[g.id][p.id] || {}; scoresDb[g.id][p.id][h] = pars[h - 1] + ((g.id * 3 + p.id * 5 + h) % 4 === 0 ? -1 : (g.id + p.id * h) % 3); who.push([g.id, p.id]); })); saveScoresToCloud(who, h); } viewDashboard(); });
  await page.waitForTimeout(200);
  const box = await page.evaluate(() => { let el = document.querySelector('#step-dashboard .all-games'); return el && { text: el.innerText, top: el.getBoundingClientRect().top < document.querySelector('#dashboard-payouts')?.getBoundingClientRect().top }; });
  ok(box && /team bets \+ Our Match \+ side bets/i.test(box.text) && box.top, 'standings open with "Who pays who · everything" covering team bets + Our Match + side bets');
  const u = await page.evaluate(() => { let u = roundSettleUp(roundData, scoresDb, matchPresses); let net = Object.values(u.nets).reduce((a, c) => a + c, 0);
    let after = { ...u.nets }; u.payments.forEach(pm => { after[pm.from] += pm.cents; after[pm.to] -= pm.cents; });
    return { net, left: Math.max(...Object.values(after).map(Math.abs)), n: u.payments.length, finished: u.finished }; });
  ok(Math.abs(u.net) < 100 && u.left < 100 && u.finished, 'everyone\'s totals add to zero and the payments square everyone: ' + JSON.stringify(u));
  await page.evaluate(() => { document.querySelector('.back-to-scoring').style.visibility = 'hidden'; document.querySelector('.all-games').scrollIntoView(); });
  await (await page.$('.all-games')).screenshot({ path: __dirname + '/shots/all-games.png' });
  // plain spectator: no Our Match money in it
  const docs = await page.evaluate(() => window.__docs);
  const sp = await mk(docs); await sp.goto('http://app.test/?spectator=true'); await sp.waitForTimeout(1200); await sp.evaluate(() => viewDashboard());
  const spText = await sp.evaluate(() => document.querySelector('.all-games')?.innerText || '');
  ok(spText && !/Our Match/i.test(spText) && /team bets \+ side bets/i.test(spText), 'plain spectator: box without Our Match');
  // only one money game: no box
  ok(await page.evaluate(() => { let rd = { ...roundData, ourMatch: null, sideBets: [] }; return /Who pays who · everything/.test(allGamesHTML(rd, scoresDb, {})) && /team bets</.test(allGamesHTML(rd, scoresDb, {})); }), 'team bets only: the box shows too');
  ok(await page.evaluate(() => { let rd = { ...roundData, betAmount: 0, skinsAmount: 0, sideBets: [] }; return allGamesHTML(rd, scoresDb, matchPresses) === ''; }), 'Our Match only: no extra box (its own box already says who pays who)');
  // results page has it too
  await page.evaluate(() => { liveRoundInCloud = true; });
  page.evaluate(() => validateAndFinalize()); await page.waitForTimeout(200); for (const d of '1234') await page.click(`.pin-pad button:text-is("${d}")`); await page.waitForTimeout(500);
  ok(await page.evaluate(() => { document.getElementById('text-modal').classList.remove('active'); let a = JSON.parse(localStorage.getItem('tournamentArchive')).slice(-1)[0]; renderArchivedRound(a); return /Who pays who · everything/i.test(document.getElementById('archived-all-games').innerText); }), 'results page has it too');
  await browser.close();
  console.log(fails ? `${fails} FAILED` : 'ALL PASS'); process.exit(fails ? 1 : 0);
})();
