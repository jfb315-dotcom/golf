// After a tournament whose Our Match used other roster slots, start an Our Match from Home: do the pairs and the send list come out right?
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs = require('fs');
const stub = fs.readFileSync(__dirname + '/stub.js', 'utf8');
const html = fs.readFileSync(process.argv[2] || __dirname + '/../index.html', 'utf8');
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  for (const seats of [['1-3', '1-4', '2-3', '2-4'], ['1-1', '2-1', '1-2', '2-2'], ['1-1', '1-2', '2-1', '2-2']]) {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } }); page.setDefaultTimeout(5000);
    const dialogs = []; page.on('dialog', d => { dialogs.push(d.message().slice(0, 70)); d.accept(); }); page.on('pageerror', e => console.log('PAGE ERROR', e.message));
    await page.route('**/*', r => { const u = r.request().url();
      if (u.includes('gstatic')) return r.fulfill({ contentType: 'text/javascript', body: u.includes('app-compat') ? stub : '' });
      if (u.startsWith('http://app.test/')) return r.fulfill({ contentType: 'text/html', body: html });
      return r.abort(); });
    await page.addInitScript(() => { window.__docsInit = {}; });
    await page.goto('http://app.test/?beta=0'); await page.waitForTimeout(400);
    // what the phone remembers from the last tournament's roster page
    await page.evaluate(s => { ['om-a1', 'om-a2', 'om-b1', 'om-b2'].forEach((id, i) => tempRosterCache[id] = s[i]); localStorage.setItem('jbGolfRosterCache', JSON.stringify(tempRosterCache)); }, seats);
    await page.evaluate(() => startNewRound('om'));
    await page.click('#step-1 .bar-primary[onclick="goToStep2()"]');
    for (const [id, n] of [['g1-p1','John'],['g1-p2','Brent'],['g2-p1','Jordia'],['g2-p2','Andy']]) await page.fill(`#${id}-name`, n);
    await page.evaluate(() => saveRosterCache());
    await page.click('#btn-step2-next'); await page.waitForTimeout(500);
    const r = await page.evaluate(() => { let m = roundData.ourMatch && calculateOurMatch(roundData, scoresDb, {}); let list = []; try { openMatchSend(roundData, false); list = [...document.querySelectorAll('#match-send-list .match-send-row b')].map(b => b.textContent); } catch (e) { list = 'ERR ' + e.message; }
      return { screen: document.querySelector('.screen.active')?.id, pairs: m ? m.names : roundData.ourMatch ? 'match broken' : 'no match', list }; });
    ok(r.screen === 'step-3' && JSON.stringify(r.pairs) === '["John & Brent","Jordia & Andy"]' && JSON.stringify(r.list) === '["John","Brent","Jordia","Andy"]' && !dialogs.length, 'left over ' + seats.join(',') + ' → starts as Team 1 vs Team 2, four names to send to: ' + JSON.stringify(r) + (dialogs.length ? ' ALERTS: ' + dialogs.join(' | ') : ''));
    await page.close();
  }
  await browser.close();
  console.log(fails ? `${fails} FAILED` : 'ALL PASS'); process.exit(fails ? 1 : 0);
})();
