const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs = require('fs');
const stub = fs.readFileSync(__dirname + '/stub.js', 'utf8');
const html = fs.readFileSync(__dirname + '/../index.html', 'utf8');
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
  let dialogs = []; page.on('dialog', d => { dialogs.push(d.message()); d.accept(); });
  await page.route('**/*', r => { const u = r.request().url();
    if (u.includes('gstatic')) return r.fulfill({ contentType: 'text/javascript', body: u.includes('app-compat') ? stub : '' });
    if (u.startsWith('http://app.test/')) return u.includes('logo') ? r.fulfill({ path: __dirname + '/../logo.png' }) : r.fulfill({ contentType: 'text/html', body: html });
    return r.abort(); });
  await page.addInitScript(() => { window.__docsInit = {}; });
  await page.goto('http://app.test/'); await page.waitForTimeout(300); await page.evaluate(() => { if (document.getElementById('step-home')?.classList.contains('active')) showScreen('step-1'); });
  ok(!(await page.isVisible('#om-options')), 'amount fields hidden until Our Match is on');
  await page.evaluate(() => { document.getElementById('group-count').value = 2; document.getElementById('players-per-group').value = 3; });
  await page.check('#om-enabled'); await page.waitForTimeout(50);
  ok(await page.isVisible('#om-options'), 'amount fields show');
  await page.screenshot({ path: __dirname + '/shots/om-setup.png', fullPage: true });
  await page.click('#step-1 .bar-primary[onclick="goToStep2()"]');
  // Team 1 slot 2 left empty, so Ace (slot 3) becomes player id 2
  for (const [id, n] of [['g1-p1','Al'],['g1-p3','Ace'],['g2-p1','Bo'],['g2-p2','Bud'],['g2-p3','Cy']]) await page.fill(`#${id}-name`, n);
  await page.evaluate(() => saveRosterCache());
  ok(await page.isVisible('#om-sides'), 'side pickers show on roster');
  ok(await page.inputValue('#om-a1') === '1-1' && await page.inputValue('#om-a2') === '1-3' && await page.inputValue('#om-b1') === '2-1' && await page.inputValue('#om-b2') === '2-2', 'sides default to Team 1 vs Team 2');
  // Same player twice: blocked
  await page.selectOption('#om-b2', '2-1');
  await page.click('#btn-step2-next'); await page.waitForTimeout(200);
  ok(dialogs.some(d => d.includes('Our Match needs 4')), 'blocked when a player is picked twice');
  await page.selectOption('#om-a1', '1-1'); await page.selectOption('#om-a2', '1-3');
  await page.selectOption('#om-b1', '2-1'); await page.selectOption('#om-b2', '2-2');
  await page.screenshot({ path: __dirname + '/shots/om-roster.png', fullPage: true });
  await page.click('#btn-step2-next'); await page.waitForTimeout(300);
  const om = await page.evaluate(() => window.__doc.roundData.ourMatch);
  ok(JSON.stringify([om.sideA, om.sideB]) === JSON.stringify([[{g:1,p:1},{g:1,p:2}],[{g:2,p:1},{g:2,p:2}]]), 'sides saved by player id: ' + JSON.stringify([om.sideA, om.sideB]));
  ok(om.nassauBet === 50 && om.ballBet === 25, 'amounts saved');

  // Hole 1 (par 5): Al 5 Ace 6 vs Bo 5 Bud 5 -> side B wins first/second ball; nassau low 5 v 5 square
  // Hole 2 (par 4): Al 3 Ace 6 vs Bo 4 Bud 4 -> A wins (birdie beats); A up 1 stroke
  await page.evaluate(() => {
    const s = { 1: [5,6,5,5], 2: [3,6,4,4] };
    for (const h in s) { const [a, b, c, d] = s[h]; scoresDb[1][1][h] = a; scoresDb[1][2][h] = b; scoresDb[2][1][h] = c; scoresDb[2][2][h] = d; scoresDb[2][3][h] = 4;
      saveScoresToCloud([[1,1],[1,2],[2,1],[2,2],[2,3]], +h); }
  });
  await page.waitForTimeout(200);
  ok(await page.isVisible('#om-press-alert'), 'press alert on scoring screen');
  ok((await page.innerText('#om-press-alert')).includes('Bo & Bud'), 'alert names the side that is down');
  await page.screenshot({ path: __dirname + '/shots/om-alert.png' });
  await page.click('text=View standings'); await page.waitForTimeout(200);
  await page.evaluate(() => document.querySelectorAll('#dashboard-our-match details').forEach(x => x.open = true)); const txt = await page.innerText('#dashboard-our-match');
  ok(txt.includes('Al & Ace up 1'), 'nassau front: Al & Ace up 1');
  ok(/−1\s+E/.test(txt) || txt.includes('−1 E'), 'hole 1 chart shows −1 E');
  ok(txt.includes('E +1') || txt.includes('E +1 E'), 'hole 2 chart bets after A wins');
  const pressBtns = await page.$$eval('.om-press', b => b.map(x => x.innerText));
  ok(pressBtns.length === 2 && pressBtns.every(t => t.includes('Bo & Bud')), 'press buttons only for side down: ' + pressBtns.join(' | '));
  await page.screenshot({ path: __dirname + '/shots/om-dash.png', fullPage: true }); await (await page.$('#our-match')).screenshot({ path: __dirname + '/shots/om-section.png' });
  await page.click('text=PRESS FRONT 9 · Bo & Bud'); await page.waitForTimeout(200);
  ok(dialogs.some(d => d.includes('starting on hole 3')), 'confirm says press starts on hole 3');
  const cloud = await page.evaluate(() => window.__doc.matchPresses);
  ok(cloud && cloud.front && cloud.front.B === 2, 'press saved in cloud: ' + JSON.stringify(cloud));
  const btns2 = await page.$$eval('.om-press', b => b.map(x => x.innerText));
  ok(btns2.length === 1 && btns2[0].includes('OVERALL'), 'front press used up, overall still available');
  ok((await page.innerText('#dashboard-our-match')).includes('Press · starts hole 3'), 'press bet listed');
  ok((await page.innerText('#dashboard-our-match')).includes('Bo & Bud · Front 9'), 'press log shows who pressed');
  ok(await page.$$eval('.om-press-mark', r => r.length) === 1 && await page.$eval('.om-press-mark', r => !!r.closest('details[data-fold="om-nassau-holes"]')), 'press marked in the Nassau chart after hole 2');
  ok((await page.innerText('#our-match .om-grid-wrap .om-settle')).includes('pays'), 'settle line partner to partner, under the money table: ' + await page.innerText('#our-match .om-settle'));
  await (await page.$('#our-match')).screenshot({ path: __dirname + '/shots/om-section2.png' });
  await page.click('text=BACK TO SCORING'); await page.waitForTimeout(100);
  const alertTxt = await page.innerText('#om-press-alert');
  ok(alertTxt.includes('Pressed: Bo & Bud · Front 9, starts hole 3'), 'scoring banner shows the press: ' + alertTxt);
  await page.screenshot({ path: __dirname + '/shots/om-alert2.png' });
  await page.click('text=View standings'); await page.waitForTimeout(100);

  // Edit setup mid-round, save, presses and sides survive
  await page.click('text=BACK TO SCORING');
  await page.click('text=Edit setup / rosters'); await page.waitForTimeout(150);
  ok(await page.isChecked('#om-enabled'), 'edit: switch restored');
  await page.click('#step-1 .bar-primary[onclick="goToStep2()"]'); await page.waitForTimeout(150);
  ok(await page.inputValue('#om-a2') === '1-2' && (await page.$eval('#om-a2', s => s.selectedOptions[0].text)).startsWith('Ace'), 'edit: Ace still picked');
  await page.click('#btn-step2-next'); await page.waitForTimeout(300);
  const after = await page.evaluate(() => ({ p: window.__doc.matchPresses, om: window.__doc.roundData.ourMatch, s: window.__doc.scoresDb[1][1] }));
  ok(after.p.front.B === 2, 'presses survive edit');
  ok(JSON.stringify([after.om.sideA, after.om.sideB]) === JSON.stringify([om.sideA, om.sideB]), 'sides survive edit');
  ok(after.s[2] === 3, 'scores survive edit');

  // Cart view for team 2 sees it; spectator does not
  const p2 = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await p2.route('**/*', r => page.route ? (r.request().url().includes('gstatic') ? r.fulfill({ contentType: 'text/javascript', body: r.request().url().includes('app-compat') ? stub : '' }) : r.request().url().startsWith('http://app.test/') ? r.fulfill({ contentType: 'text/html', body: html }) : r.abort()) : 0);
  const doc = await page.evaluate(() => JSON.stringify(window.__doc));
  await p2.addInitScript(d => { window.__docsInit = { active_round: JSON.parse(d) }; }, doc);
  await p2.goto('http://app.test/?spectator=true'); await p2.waitForTimeout(400);
  ok((await p2.innerText('#dashboard-our-match').catch(() => '')) === '', 'spectator does not see Our Match');
  await browser.close();
  console.log(fails ? `${fails} FAILED` : 'ALL PASS'); process.exit(fails ? 1 : 0);
})();
