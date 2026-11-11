// Side bets: 2 on 2 across teams, low net ball Nassau, one amount, all birdies count option, 9 holes = first 4 / last 5
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs = require('fs');
const stub = fs.readFileSync(__dirname + '/stub.js', 'utf8');
const html = fs.readFileSync(__dirname + '/../index.html', 'utf8');
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  page.setDefaultTimeout(5000);
  page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
  let dialogs = []; page.on('dialog', d => { dialogs.push(d.message()); d.accept(); });
  await page.route('**/*', r => { const u = r.request().url();
    if (u.includes('gstatic')) return r.fulfill({ contentType: 'text/javascript', body: u.includes('app-compat') ? stub : '' });
    if (u.startsWith('http://app.test/')) return r.fulfill({ contentType: 'text/html', body: html });
    return r.abort(); });
  await page.addInitScript(() => { window.__docsInit = {}; });
  await page.goto('http://app.test/'); await page.waitForTimeout(400);
  await page.evaluate(() => { if (document.getElementById('step-home')?.classList.contains('active')) showScreen('step-1'); });
  await page.evaluate(() => { document.getElementById('group-count').value = 2; document.getElementById('players-per-group').value = 4; });
  await page.click('#step-1 .bar-primary[onclick="goToStep2()"]');
  const names = [['g1-p1','Al Adams'],['g1-p2','Bo Brown'],['g1-p3','Cy Cole'],['g1-p4','Di Dunn'],['g2-p1','Ed Eads'],['g2-p2','Fy Fox'],['g2-p3','Gus Gray'],['g2-p4','Hal Hart']];
  for (const [id, n] of names) await page.fill(`#${id}-name`, n);
  await page.evaluate(() => saveRosterCache());
  ok(await page.isVisible('text=+ Add a side bet'), 'roster has "+ Add a side bet"');
  ok(await page.evaluate(() => !!(document.querySelector('.segmented[data-select="is-scrambled"]').compareDocumentPosition(document.getElementById('side-bets-setup')) & 4)), 'side bets come after Carts');
  await page.click('text=+ Add a side bet'); await page.waitForTimeout(100);
  const sels = await page.$$('#side-bets-list .side-bet-card select');
  ok(sels.length === 4, 'four player pickers');
  // Al (T1) & Ed (T2) vs Bo (T1) & Fy (T2)
  await sels[0].selectOption('1-1'); await sels[1].selectOption('2-1'); await sels[2].selectOption('1-2'); await sels[3].selectOption('2-2');
  await page.fill('#side-bets-list .side-bet-card input[type=number]', '20');
  await page.check('#sb-birdies-0');
  await page.evaluate(() => document.getElementById('side-bets-setup').scrollIntoView({ block: 'center' }));
  await page.screenshot({ path: __dirname + '/shots/sidebet-setup.png' });
  // an unfinished second one blocks the start
  await page.click('text=+ Add a side bet'); await page.waitForTimeout(100);
  dialogs = [];
  await page.click('#btn-step2-next'); await page.waitForTimeout(300);
  ok(dialogs.some(d => d.startsWith('Side bet 2 needs 4 different players')), 'incomplete side bet stops the start: ' + dialogs.join('|'));
  await page.click('#side-bets-list .side-bet-card:nth-child(2) .side-bet-remove'); await page.waitForTimeout(100);
  await page.click('#btn-step2-next'); await page.waitForTimeout(400);
  const sb = await page.evaluate(() => roundData.sideBets);
  ok(sb.length === 1 && JSON.stringify(sb[0].sideA) === '[{"g":1,"p":1},{"g":2,"p":1}]' && JSON.stringify(sb[0].sideB) === '[{"g":1,"p":2},{"g":2,"p":2}]' && sb[0].amount === 20 && sb[0].allBirdies === true, 'saved on the round: ' + JSON.stringify(sb));

  // Scores: everyone pars, except
  //  hole 2: Al birdie, Ed birdie (all birdies count: side 1 is -2 that hole)
  //  hole 5: Bo birdie (side 2 -1)
  //  hole 12: Fy bogey, Bo bogey, side 1 pars (side 1 wins by 1)
  //  hole 14: Bo gets a stroke there and pars it: net birdie for side 2 (-1)
  await page.evaluate(() => {
    let pars = roundData.course.pars;
    roundData.groups[0].players[1].strokeHoles = [14];
    for (let h = 1; h <= 18; h++) roundData.groups.forEach(g => g.players.forEach(p => { scoresDb[g.id][p.id] = scoresDb[g.id][p.id] || {}; scoresDb[g.id][p.id][h] = pars[h - 1]; }));
    scoresDb[1][1][2] = pars[1] - 1; scoresDb[2][1][2] = pars[1] - 1;
    scoresDb[1][2][5] = pars[4] - 1;
    scoresDb[1][2][12] = pars[11] + 1; scoresDb[2][2][12] = pars[11] + 1;
  });
  const m = await page.evaluate(() => { let x = calculateSideBet(roundData, scoresDb, roundData.sideBets[0]); return { segs: x.segs.map(s => [s.label, s.diff, s.money]), total: x.totalMoney, settle: matchSettleLine(x, x.totalMoney) }; });
  console.log(JSON.stringify(m));
  // Front: side1 -2 (h2) vs side2 -1 (h5) -> diff -1 -> side 1 wins +20
  // Back: h12 side1 0 vs side2 +1 -> side1 ahead 1; h14 side2 -1 -> even -> push 0
  // Overall: side1 -2 vs side2 -1 (+1 -1 = 0) ... side1 total -2, side2 total -1 -> side1 +20
  ok(m.segs[0][0] === 'Front 9' && m.segs[0][2] === 20 && m.segs[1][0] === 'Back 9' && m.segs[1][2] === 0 && m.segs[2][0] === 'Overall' && m.segs[2][2] === 20 && m.total === 40, 'front +$20, back push (his stroke counts), overall +$20 = +$40');
  ok(m.settle === 'Bo pays Al $40 · Fy pays Ed $40', 'per person, partner to partner: ' + m.settle);
  const noBirdies = await page.evaluate(() => { let b = { ...roundData.sideBets[0], allBirdies: false }; return calculateSideBet(roundData, scoresDb, b).segs[0].diff; });
  ok(noBirdies === 0, 'without all birdies count, hole 2 counts once: front is even');

  await page.evaluate(() => { viewDashboard(); }); await page.waitForTimeout(200);
  const txt = await page.innerText('#dashboard-side-bets');
  ok(txt.includes('SIDE BETS') && txt.includes('Al & Ed') && txt.includes('Bo & Fy') && txt.includes('Bo pays Al $40'), 'standings show the side bet and who pays who');
  await page.evaluate(() => { document.querySelector('.back-to-scoring').style.visibility = 'hidden'; document.getElementById('dashboard-side-bets').scrollIntoView(); });
  await (await page.$('#dashboard-side-bets')).screenshot({ path: __dirname + '/shots/sidebet-standings.png' });
  ok(await page.evaluate(() => document.querySelector('details[data-fold="live-rules"]').textContent.replace(/\s+/g, ' ').includes('$20 a bet on Front 9, Back 9 and Overall')), 'rules list the side bet');
  // Money ledger and the results text
  ok(await page.evaluate(() => { let mo = roundMoney(roundData, scoresDb); return mo['al adams'].side === 4000 && mo['bo brown'].side === -4000 && mo['ed eads'].side === 4000 && mo['fy fox'].side === -4000 && !('side' in mo['cy cole']); }), 'side bet money goes into the season money');
  await page.evaluate(() => { activeViewRoundData = roundData; activeViewScoresDb = scoresDb; openResultsShareModal(); });
  const share = await page.inputValue('#share-text-content');
  ok(share.includes('Side bets ($ per person)') && share.includes('Al & Ed vs Bo & Fy ($20, all birdies): Front 9 +$20 · Back 9 $0 · Overall +$20') && share.includes('Bo pays Al $40'), 'results text lists the side bet');
  await page.evaluate(() => closeShareModal());
  // Edit setup brings it back onto the roster
  await page.evaluate(() => switchScreen('step-dashboard', 'step-3'));
  const rid = await page.evaluate(() => roundData.roundId);
  await page.click('text=Edit setup / rosters'); await page.waitForTimeout(150);
  await page.click('#step-1 .bar-primary[onclick="goToStep2()"]'); await page.waitForTimeout(150);
  ok(await page.evaluate(() => [...document.querySelectorAll('#side-bets-list select')].map(s => s.value).join()) === '1-1,2-1,1-2,2-2' && await page.isChecked('#sb-birdies-0'), 'edit setup shows the side bet as set');
  await page.click('#btn-step2-next'); await page.waitForTimeout(300);
  ok(await page.evaluate(r => roundData.sideBets.length === 1 && roundData.roundId === r && window.__docs.active_round.roundData.sideBets.length === 1, rid), 'saved again on the same round');

  // Added from the standings once the round is going: Cy & Gus vs Di & Hal, $10
  await page.evaluate(() => { liveRoundInCloud = true; viewDashboard(); });
  await page.click('#dashboard-side-bets >> text=+ Add a side bet'); await page.waitForTimeout(150);
  ok(await page.isVisible('#sb-modal'), 'standings: "+ Add a side bet" opens the form');
  await page.selectOption('#sbl-a1', '1-3'); await page.selectOption('#sbl-a2', '2-3'); await page.selectOption('#sbl-b1', '1-4'); await page.selectOption('#sbl-b2', '2-4');
  await page.fill('#sbl-amount', '10');
  await page.screenshot({ path: __dirname + '/shots/sidebet-live-add.png' });
  await page.click('#sb-modal >> text=Add side bet'); await page.waitForTimeout(200);
  ok(await page.evaluate(() => roundData.sideBets.length === 2 && window.__docs.active_round.roundData.sideBets.length === 2 && roundData.sideBets[1].amount === 10), 'second side bet saved to the round');
  ok((await page.innerText('#dashboard-side-bets')).includes('Cy & Gus'), 'and shows on the standings');
  await page.click('#dashboard-side-bets .side-bet:nth-of-type(2) .side-bet-remove'); await page.waitForTimeout(200);
  ok(await page.evaluate(() => roundData.sideBets.length === 1 && window.__docs.active_round.roundData.sideBets.length === 1), 'removed from the standings');
  // Spectators can't add or remove
  ok(await page.evaluate(() => !sideBetsHTML(roundData, scoresDb, 'x-', false).includes('Add a side bet')), 'no add/remove without the admin view');

  // 9 holes: first 4 / last 5
  const nine = await page.evaluate(() => { let rd = JSON.parse(JSON.stringify(roundData)); rd.playMode = '9'; rd.startHole = 1; rd.endHole = 9; rd.startType = 'front';
    return sideBetNines(rd).map(x => x.label + ':' + x.holes.join('-')).join(' | '); });
  ok(nine === 'First 4:1-2-3-4 | Last 5:5-6-7-8-9', '9 holes: ' + nine);
  await browser.close();
  console.log(fails ? `${fails} FAILED` : 'ALL PASS'); process.exit(fails ? 1 : 0);
})();
