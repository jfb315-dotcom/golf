// Our Match starting on the back: 1st ball / birdies are the base amount on 10-18 (played first) and double on 1-9.
// Starting on the front is unchanged: base on 1-9, double on 10-18. A 9-hole round is the base amount.
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs = require('fs');
const stub = fs.readFileSync(__dirname + '/stub.js', 'utf8');
const html = fs.readFileSync(process.argv[2] || __dirname + '/../index.html', 'utf8');
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  for (const [start, mode] of [['back', '18'], ['front', '18'], ['back', '9']]) {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 }); page.setDefaultTimeout(5000);
    page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; }); page.on('dialog', d => d.accept());
    await page.route('**/*', r => { const u = r.request().url();
      if (u.includes('gstatic')) return r.fulfill({ contentType: 'text/javascript', body: u.includes('app-compat') ? stub : '' });
      if (u.startsWith('http://app.test/')) return r.fulfill({ contentType: 'text/html', body: html });
      return r.abort(); });
    await page.addInitScript(() => { window.__docsInit = {}; });
    await page.goto('http://app.test/?beta=0'); await page.waitForTimeout(300);
    await page.evaluate(([start, mode]) => {
      showScreen('step-1');
      document.getElementById('group-count').value = 2; document.getElementById('players-per-group').value = 2;
      document.getElementById('hole-format').value = mode; document.getElementById('start-type').value = start;
      document.getElementById('hole-format').dispatchEvent(new Event('change')); document.getElementById('start-type').dispatchEvent(new Event('change'));
      document.getElementById('om-ball').value = 25;
    }, [start, mode]);
    await page.evaluate(() => startNewRound('om'));
    await page.click('#step-1 .bar-primary[onclick="goToStep2()"]');
    for (const [id, n] of [['g1-p1','Brent'],['g1-p2','John'],['g2-p1','Jordia'],['g2-p2','Mike']]) await page.fill(`#${id}-name`, n);
    await page.evaluate(() => saveRosterCache());
    await page.click('#btn-step2-next'); await page.waitForTimeout(300);
    const r = await page.evaluate(() => {
      // Brent birdies the first hole played on each nine; everyone else pars
      let seq = getHoleSequence(), firsts = [seq[0], seq[9]];
      seq.forEach(h => [[1,1],[1,2],[2,1],[2,2]].forEach(([g, p], i) => { scoresDb[g][p][h] = roundData.course.pars[h - 1] - (i === 0 && firsts.includes(h) ? 1 : 0); }));
      let m = calculateOurMatch(roundData, scoresDb, {});
      return { start: roundData.startType, mode: roundData.playMode, nines: m.nines.map(n => ({ first: n.holes[0], amount: n.amount, birdieMoney: n.birdieMoney })), foot: (generateOurMatchHTML(roundData, scoresDb, {}, true).match(/om-grid-rules">([^<]*)/) || [])[1], rules: ourMatchRulesHTML(roundData).match(/1st ball goes to 2nd ball.*?<p class="om-rule-note">([^<]*)/)?.[1] };
    });
    console.log(JSON.stringify(r));
    const tag = `${mode} holes, start ${start}`;
    if (mode === '18' && start === 'back') {
      ok(r.nines[0].first === 10 && r.nines[0].amount === 25 && r.nines[0].birdieMoney === 25, tag + ': 10-18 played first at $25 (birdie pays $25)');
      ok(r.nines[1].first === 1 && r.nines[1].amount === 50 && r.nines[1].birdieMoney === 50, tag + ': 1-9 played second at $50 (birdie pays $50)');
      ok(/\$25 on 10–18 \(played first\), \$50 on 1–9/.test(r.rules), tag + ': rules say $25 on 10-18, $50 on 1-9');
      ok(/birdies \$25 back, \$50 front/.test(r.foot), tag + ': money table note says $25 back, $50 front: ' + r.foot);
    } else if (mode === '18') {
      ok(r.nines[0].first === 1 && r.nines[0].amount === 25 && r.nines[1].first === 10 && r.nines[1].amount === 50, tag + ': unchanged, $25 front, $50 back');
      ok(/\$25 front, \$50 back/.test(r.rules), tag + ': rules unchanged');
    } else {
      ok(r.nines.length === 1 && r.nines[0].amount === 25, tag + ': one nine at $25');
    }
    await page.close();
  }
  await browser.close();
  console.log(fails ? `${fails} FAILED` : 'ALL PASS'); process.exit(fails ? 1 : 0);
})();
