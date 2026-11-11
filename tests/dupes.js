// Same person twice ("Brent" and "Brent Copeland"): merge them, and typing "Brent" on a roster uses Brent Copeland
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
  await page.addInitScript(() => { window.__docsInit = {
    saved_players: { players: {
      'brent copeland': { name: 'Brent Copeland', first: 'Brent', last: 'Copeland', nick: '', tee: 'Blue' },
      'brent': { name: 'Brent', strokes: { cleveland: '4' }, tees: { cleveland: 'White' } },
      'john bischof': { name: 'John Bischof', first: 'John', last: 'Bischof', nick: 'John', tee: 'White' },
      'john': { name: 'John' },
      'jordia': { name: 'Jordia' },
      'chad copeland': { name: 'Chad Copeland', first: 'Chad', last: 'Copeland', nick: '', tee: 'White' } } },
    player_history: { rounds: { r1: { date: '2026-11-06', at: 1, course: 'Cleveland', holes: 18,
      players: { brent: { gross: 80, diff: 8 }, 'john bischof': { gross: 85, diff: 12 } },
      money: { brent: { name: 'Brent', games: 5000, om: 0 } } } } } }; });
  await page.goto('http://app.test/'); await page.waitForTimeout(500);
  await page.evaluate(() => openPlayersScreen()); await page.waitForTimeout(200);
  const rows = await page.$$eval('#players-dupes .dupes-row', r => r.map(x => x.innerText.replace(/\s+/g, ' ').trim()));
  console.log(rows);
  ok(rows.length === 2 && rows.some(r => r.includes('"Brent" looks like Brent Copeland')) && rows.some(r => r.includes('"John" looks like John Bischof')), 'flags Brent and John as duplicates, not Jordia');
  await page.screenshot({ path: __dirname + '/shots/dupes.png' });
  await page.click('.dupes-row:has-text("Brent") .dupes-btn'); await page.waitForTimeout(200);
  ok(dialogs.some(d => d.includes('Merge "Brent" into Brent Copeland')), 'asks first');
  const st = await page.evaluate(() => ({ saved: !!savedPlayers['brent'], cloudSaved: !!window.__docs.saved_players.players['brent'],
    to: savedPlayers['brent copeland'], hist: window.__docs.player_history.rounds.r1 }));
  ok(!st.saved && !st.cloudSaved, 'extra "Brent" removed');
  ok(st.to.tee === 'Blue' && st.to.tees?.cleveland === 'White' && st.to.strokes?.cleveland === '4', 'kept his tee, brought over course tees and strokes');
  ok(st.hist.players['brent copeland']?.gross === 80 && !st.hist.players.brent && st.hist.money['brent copeland']?.games === 5000 && !st.hist.money.brent, 'his round and money moved to Brent Copeland');
  ok(await page.evaluate(() => playerRounds('brent copeland').length) === 1, 'stats now count it for Brent Copeland');
  ok((await page.$$('#players-dupes .dupes-row')).length === 1, 'only John left in the box');
  // Editor: merge any two by hand
  await page.evaluate(() => openPlayerEditor('john'));
  ok(await page.isVisible('#pl-merge-row'), 'editor offers "Same person as…"');
  await page.selectOption('#pl-merge', 'john bischof'); await page.click('#pl-merge-row button'); await page.waitForTimeout(200);
  ok(await page.evaluate(() => !savedPlayers['john'] && !!savedPlayers['john bischof']), 'merged from the editor');
  ok(!(await page.$('#players-dupes .dupes-box')), 'no more duplicates');
  // Roster: typing "Brent" and "John" uses the saved players
  await page.evaluate(() => showScreen('step-1'));
  await page.evaluate(() => { document.getElementById('group-count').value = 2; document.getElementById('players-per-group').value = 2; });
  await page.click('#step-1 .bar-primary[onclick="goToStep2()"]');
  for (const [id, n] of [['g1-p1','Brent'],['g1-p2','John'],['g2-p1','Jordia'],['g2-p2','Chad']]) await page.fill(`#${id}-name`, n);
  await page.evaluate(() => saveRosterCache());
  await page.click('#btn-step2-next'); await page.waitForTimeout(400);
  const names = await page.evaluate(() => roundData.groups.flatMap(g => g.players.map(p => p.name)));
  ok(names.join() === 'Brent Copeland,John Bischof,Jordia,Chad Copeland', 'roster first names became the saved players: ' + names.join());
  ok(await page.evaluate(() => !savedPlayers['brent'] && !savedPlayers['john'] && !savedPlayers['chad'] && Object.keys(savedPlayers).length === 4), 'no new duplicates saved: ' + await page.evaluate(() => Object.keys(savedPlayers).join()));
  await browser.close();
  console.log(fails ? `${fails} FAILED` : 'ALL PASS'); process.exit(fails ? 1 : 0);
})();
