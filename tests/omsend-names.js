// Our Match "Send the match": the four players are always listed, however their names were typed
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs = require('fs');
const stub = fs.readFileSync(__dirname + '/stub.js', 'utf8');
const html = fs.readFileSync(process.argv[2] || __dirname + '/../index.html', 'utf8');
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const saved = { saved_players: { players: {
    'john bischof': { name: 'John Bischof', first: 'John', last: 'Bischof', phone: '(423) 555-0102' },
    'brent copeland': { name: 'Brent Copeland', first: 'Brent', last: 'Copeland', phone: '(423) 555-0103' },
    'jordia smith': { name: 'Jordia Smith', first: 'Jordia', last: 'Smith', nick: 'Jordia' },
    'andy anderson': { name: 'Andy Anderson', first: 'Andy', last: 'Anderson', phone: '(423) 555-0105' },
    'andy baker': { name: 'Andy Baker', first: 'Andy', last: 'Baker' } } } };
  const cases = [['first names, players saved', saved, ['John', 'Brent', 'Jordia', 'Andy']], ['first names, nobody saved', {}, ['John', 'Brent', 'Jordia', 'Andy']],
    ['full names', saved, ['John Bischof', 'Brent Copeland', 'Jordia Smith', 'Andy Anderson']], ['odd names', saved, ["O'Neil", 'J.B.', 'Big Mike ', 'andy']]];
  for (const [label, docs, names] of cases) for (const from of ['hub', 'standings']) {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 }); page.setDefaultTimeout(5000);
    const errs = []; page.on('pageerror', e => errs.push(e.message)); page.on('dialog', d => d.accept());
    await page.route('**/*', r => { const u = r.request().url();
      if (u.includes('gstatic')) return r.fulfill({ contentType: 'text/javascript', body: u.includes('app-compat') ? stub : '' });
      if (u.startsWith('http://app.test/')) return r.fulfill({ contentType: 'text/html', body: html });
      return r.abort(); });
    await page.addInitScript(d => { window.__docsInit = d; }, docs);
    await page.goto('http://app.test/?beta=0'); await page.waitForTimeout(400);
    await page.evaluate(() => startNewRound('om'));
    await page.click('#step-1 .bar-primary[onclick="goToStep2()"]');
    for (let i = 0; i < 4; i++) await page.fill(`#g${Math.floor(i / 2) + 1}-p${i % 2 + 1}-name`, names[i]);
    await page.evaluate(() => saveRosterCache());
    await page.click('#btn-step2-next'); await page.waitForTimeout(400);
    if (from === 'hub') { await page.evaluate(() => openShareHub()); await page.click('#share-hub-spectator'); }
    else { await page.evaluate(() => viewDashboard()); await page.click('#step-dashboard .bar-primary[onclick="shareStandingsLink()"]'); }
    await page.waitForTimeout(250);
    const rows = await page.$$eval('#match-send-list .match-send-row', r => r.map(x => x.innerText.replace(/\s+/g, ' ').trim())).catch(() => []);
    ok(await page.isVisible('#match-send-modal') && rows.length === 4 && !errs.length, `${label}, from ${from}: 4 players listed → ${JSON.stringify(rows)}${errs.length ? ' ERR ' + errs.join(' | ') : ''}`);
    if (label === 'first names, players saved' && from === 'hub') await page.screenshot({ path: __dirname + '/shots/omsend-names.png' });
    await page.close();
  }
  await browser.close();
  console.log(fails ? `${fails} FAILED` : 'ALL PASS'); process.exit(fails ? 1 : 0);
})();
