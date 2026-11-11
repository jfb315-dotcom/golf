// Per-person Our Match links: the send screen texts each player his own link; the link follows him to whichever pair he's in
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs = require('fs');
const stub = fs.readFileSync(__dirname + '/stub.js', 'utf8');
const html = fs.readFileSync(__dirname + '/../index.html', 'utf8');
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const mk = async (docs, url) => { const p = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 }); p.setDefaultTimeout(5000);
    p.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; }); p.on('dialog', d => d.accept());
    await p.route('**/*', r => { const u = r.request().url();
      if (u.includes('gstatic')) return r.fulfill({ contentType: 'text/javascript', body: u.includes('app-compat') ? stub : '' });
      if (u.startsWith('http://app.test/')) return r.fulfill({ contentType: 'text/html', body: html });
      return r.abort(); });
    await p.addInitScript(d => { window.__docsInit = d; }, docs); await p.goto(url); await p.waitForTimeout(800); return p; };
  const players = { saved_players: { players: {
    'jordia smith': { name: 'Jordia Smith', first: 'Jordia', last: 'Smith', phone: '(423) 555-0101' },
    'john bischof': { name: 'John Bischof', first: 'John', last: 'Bischof', phone: '(423) 555-0102' },
    'brent copeland': { name: 'Brent Copeland', first: 'Brent', last: 'Copeland', phone: '(423) 555-0103' },
    'andy anderson': { name: 'Andy Anderson', first: 'Andy', last: 'Anderson' } } } };
  // play a match: four names in roster order g1p1, g1p2, g2p1, g2p2 (Team 1 vs Team 2); Team 1 one stroke worse on hole 2
  const playMatch = async (a, four) => {
    await a.evaluate(() => startNewRound('om'));
    await a.click('#step-1 .bar-primary[onclick="goToStep2()"]');
    for (const [id, n] of [['g1-p1', four[0]], ['g1-p2', four[1]], ['g2-p1', four[2]], ['g2-p2', four[3]]]) await a.fill(`#${id}-name`, n);
    await a.evaluate(() => saveRosterCache());
    await a.click('#btn-step2-next'); await a.waitForTimeout(400);
    await a.evaluate(() => { let who = [[1,1],[1,2],[2,1],[2,2]];
      for (let h = 1; h <= 3; h++) { who.forEach(([g, p], i) => { scoresDb[g][p][h] = roundData.course.pars[h - 1] + (h === 2 && i < 2 ? 1 : 0); }); saveScoresToCloud(who, h); } });
  };
  const a = await mk(players, 'http://app.test/?beta=0');
  await a.evaluate(() => changeTheme('fairway'));
  await playMatch(a, ['Jordia Smith', 'John Bischof', 'Brent Copeland', 'Andy Anderson']);
  // the send screen
  await a.evaluate(() => { openShareHub(); });
  await a.click('#share-hub-spectator'); await a.waitForTimeout(200);
  ok(await a.isVisible('#match-send-modal'), 'Send the match to the other players opens the send screen');
  const rows = await a.$$eval('.match-send-row', r => r.map(x => x.innerText.replace(/\s+/g, ' ')));
  console.log(rows.join(' | '));
  ok(rows.length === 4 && /Brent Copeland.*💬 Text/.test(rows[2]) && /Andy Anderson.*no number.*Copy link/.test(rows[3]), 'all four listed; Text for numbers on file, Copy link for Andy (no number)');
  await a.screenshot({ path: __dirname + '/shots/permatch-send.png' });
  const brentText = await a.evaluate(() => matchTextFor(roundData, false, 'Brent Copeland'));
  console.log(brentText);
  ok(/me=brent%20copeland/.test(brentText) && brentText.split('\n').length === 3 && /^⛳ Our Match · Cleveland Country Club/.test(brentText) && !/alerts/i.test(brentText), "Brent's text: 3 short lines with his own link");
  ok(!(await (await mk(await a.evaluate(() => JSON.parse(JSON.stringify(window.__docs))), 'http://app.test/?spectator=true&me=brent%20copeland&beta=0')).isVisible('.alerts-banner')), 'no alerts prompt on an Our Match link');
  let smsUrl = '';
  await a.exposeFunction('__sms', u => { smsUrl = u; });
  await a.evaluate(() => { window.openSms = u => window.__sms(u); });
  await a.click('.match-send-row:nth-child(3) .match-send-btn'); await a.waitForTimeout(200);
  ok(/4235550103/.test(smsUrl) && !/4235550101|4235550102/.test(smsUrl) && decodeURIComponent(smsUrl).includes('me=brent%20copeland'), 'tapping Text opens a message to Brent only, with his link');
  ok((await a.textContent('.match-send-row:nth-child(3) .match-send-btn')).includes('Texted'), "Brent's row then shows ✓ Texted");
  // Andy's link this week: Andy is in Team 2 (with Brent), and Team 2 is up
  let docs = await a.evaluate(() => JSON.parse(JSON.stringify(window.__docs)));
  let andy = await mk(docs, 'http://app.test/?spectator=true&me=andy%20anderson&beta=0');
  ok(/Brent & Andy currently up/.test(await andy.innerText('.om-final-banner')) && (await andy.innerText('#our-match .om-sides')).replace(/\s+/g, ' ').startsWith('Brent & Andy'), "this week Andy's link: Brent & Andy first, up");
  await andy.close();
  // next week: Andy partners John (Team 1), and Team 1 is down. Same link.
  const b = await mk(players, 'http://app.test/?beta=0');
  await playMatch(b, ['Andy Anderson', 'John Bischof', 'Jordia Smith', 'Brent Copeland']);
  docs = await b.evaluate(() => JSON.parse(JSON.stringify(window.__docs)));
  andy = await mk(docs, 'http://app.test/?spectator=true&me=andy%20anderson&beta=0');
  ok(/Andy & John currently down/.test(await andy.innerText('.om-final-banner')) && (await andy.innerText('#our-match .om-sides')).replace(/\s+/g, ' ').startsWith('Andy & John'), "next week, same link: Andy & John first, down");
  await andy.close();
  // someone not in today's match: plain view, no crash
  const other = await mk(docs, 'http://app.test/?spectator=true&me=gus%20gray&beta=0');
  ok(await other.isVisible('#our-match'), 'a player not in this match still sees the match');
  await other.close();
  // old pair links keep working
  const old = await mk(docs, 'http://app.test/?spectator=true&om=2&beta=0');
  ok((await old.innerText('#our-match .om-sides')).replace(/\s+/g, ' ').startsWith('Jordia & Brent'), 'older om=2 links still show the second pair');
  await old.close();
  // results link from the standings while live goes through the same send screen
  await b.evaluate(() => { viewDashboard(); shareStandingsLink(); }); await b.waitForTimeout(200);
  ok(await b.isVisible('#match-send-modal'), 'Share results link (Our Match) uses the same send screen');
  await b.evaluate(() => document.getElementById('match-send-modal').classList.remove('active'));
  // finalize: the send screen opens for the results, each with his own results link
  await b.evaluate(async () => { window.askPin = async () => true; await validateAndFinalize(); });
  await b.waitForTimeout(400);
  const finOpen = await b.isVisible('#match-send-modal') && (await b.textContent('#match-send-title')) === 'Send the results';
  ok(finOpen, 'after finalizing, Send the results opens');
  const andyFinal = await b.evaluate(() => matchLinkFor(matchSend.rd, true, 'Andy Anderson'));
  ok(/match\.html\?round=.*&me=andy%20anderson/.test(andyFinal), "Andy's results link: " + andyFinal);
  const docs2 = await b.evaluate(() => JSON.parse(JSON.stringify(window.__docs)));
  const rid = await b.evaluate(() => matchSend.rd.roundId);
  const af = await mk(docs2, `http://app.test/?round=${rid}&me=andy%20anderson&beta=0`);
  await af.waitForTimeout(600);
  const t = await af.evaluate(() => document.querySelector('.screen.active')?.innerText.replace(/\s+/g, ' ') || '');
  ok(/Andy & John/.test(t) && t.indexOf('Andy & John') < t.indexOf('Jordia & Brent'), "Andy's results page: from Andy & John's side");
  await browser.close();
  console.log(fails ? `${fails} FAILED` : 'ALL PASS'); process.exit(fails ? 1 : 0);
})();
