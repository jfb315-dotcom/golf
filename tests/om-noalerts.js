// Our Match: no alerts anywhere (nothing sent, no alerts chip for the organizer, no Phone alerts row in setup); tournaments keep them
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs = require('fs');
const stub = fs.readFileSync(__dirname + '/stub.js', 'utf8');
const html = fs.readFileSync(process.argv[2] || __dirname + '/../index.html', 'utf8');
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } }); page.setDefaultTimeout(5000);
  page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; }); page.on('dialog', d => d.accept());
  let sent = [];
  await page.route('**/*', r => { const u = r.request().url();
    if (u.includes('gstatic')) return r.fulfill({ contentType: 'text/javascript', body: u.includes('app-compat') ? stub : '' });
    if (u.startsWith('http://app.test/')) return r.fulfill({ contentType: 'text/html', body: html });
    if (r.request().method() === 'POST') { try { sent.push(JSON.parse(r.request().postData() || '{}').title); } catch (e) {} return r.fulfill({ status: 200, body: '{}' }); }
    return r.abort(); });
  await page.addInitScript(() => { window.__docsInit = {}; });
  await page.goto('http://app.test/?beta=0'); await page.waitForTimeout(400);
  const bannerShown = () => page.evaluate(() => [...document.querySelectorAll('.screen.active .alerts-banner')].some(e => e.offsetParent && e.textContent.trim()));
  const play = async (kind, perTeam) => {
    await page.evaluate(([k, n]) => { startNewRound(k); document.getElementById('group-count').value = 2; document.getElementById('players-per-group').value = n; }, [kind, perTeam]);
    if (kind === 'om') ok(!(await page.isVisible('#alerts-row')), 'Our Match setup: no Phone alerts row');
    await page.click('#step-1 .bar-primary[onclick="goToStep2()"]');
    const names = ['John Bischof', 'Brent Copeland', 'Jordia Smith', 'Andy Anderson'];
    for (let i = 0; i < 4; i++) await page.fill(`#g${Math.floor(i / 2) + 1}-p${i % 2 + 1}-name`, names[i]);
    await page.evaluate(() => saveRosterCache());
    await page.click('#btn-step2-next'); await page.waitForTimeout(400);
    // a birdie on hole 1 (an alert-worthy moment in a tournament)
    await page.evaluate(() => { let who = [[1,1],[1,2],[2,1],[2,2]]; who.forEach(([g, p], i) => { scoresDb[g][p][1] = roundData.course.pars[0] - (i === 0 ? 1 : 0); }); saveScoresToCloud(who, 1); renderScoreEntry(); });
    await page.waitForTimeout(400);
  };
  // Our Match
  await play('om', 2);
  ok(!(await bannerShown()), 'Our Match scoring screen: no alerts chip');
  await page.evaluate(() => viewDashboard()); await page.waitForTimeout(200);
  ok(!(await bannerShown()), 'Our Match Standings: no alerts chip');
  const before = sent.length;
  await page.evaluate(() => sendAlert('presses', 'test press', 'x', 'our-match', 'press-test'));
  await page.waitForTimeout(300);
  ok(sent.length === before && sent.length === 0, 'Our Match: no alerts sent (' + sent.join(', ') + ')');
  // Tournament: alerts still offered
  await page.evaluate(() => { liveRoundInCloud = false; });
  await play('tournament', 2);
  await page.evaluate(() => viewDashboard()); await page.waitForTimeout(200);
  ok(await bannerShown(), 'tournament Standings: alerts still offered');
  await page.evaluate(() => sendAlert('birdies', 'test birdie', 'x', 'standings', 'birdie-test'));
  await page.waitForTimeout(300);
  ok(sent.includes('test birdie'), 'tournament: alerts still sent');
  await browser.close();
  console.log(fails ? `${fails} FAILED` : 'ALL PASS'); process.exit(fails ? 1 : 0);
})();
