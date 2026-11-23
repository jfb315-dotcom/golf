// Our Match press: pick the hole it starts on (a late press can start earlier), and change the hole afterwards.
// Checked starting on hole 1 and on hole 10, and from the other pair's link (om=2).
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs = require('fs');
const stub = fs.readFileSync(__dirname + '/stub.js', 'utf8');
const html = fs.readFileSync(process.argv[2] || __dirname + '/../index.html', 'utf8');
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  for (const start of ['front', 'back']) {
    const page = await browser.newPage({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2 }); page.setDefaultTimeout(4000);
    page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; }); page.on('dialog', d => d.accept());
    await page.route('**/*', r => { const u = r.request().url();
      if (u.includes('gstatic')) return r.fulfill({ contentType: 'text/javascript', body: u.includes('app-compat') ? stub : '' });
      if (u.startsWith('http://app.test/')) return r.fulfill({ contentType: 'text/html', body: html });
      return r.abort(); });
    await page.addInitScript(() => { window.__docsInit = {}; });
    await page.goto('http://app.test/?beta=0'); await page.waitForTimeout(300);
    await page.evaluate(s => { showScreen('step-1'); document.getElementById('group-count').value = 2; document.getElementById('players-per-group').value = 2;
      document.getElementById('hole-format').value = '18'; document.getElementById('start-type').value = s;
      document.getElementById('hole-format').dispatchEvent(new Event('change')); document.getElementById('start-type').dispatchEvent(new Event('change')); }, start);
    await page.evaluate(() => startNewRound('om'));
    await page.click('#step-1 .bar-primary[onclick="goToStep2()"]');
    for (const [id, n] of [['g1-p1','Brent'],['g1-p2','John'],['g2-p1','Jordia'],['g2-p2','Mike']]) await page.fill(`#${id}-name`, n);
    await page.evaluate(() => saveRosterCache());
    await page.click('#btn-step2-next'); await page.waitForTimeout(300);
    // Jordia & Mike lose the 2nd hole played; 6 holes in
    const seq = await page.evaluate(() => { let seq = getHoleSequenceFor(roundData); for (let i = 0; i < 6; i++) { let h = seq[i]; [[1,1],[1,2],[2,1],[2,2]].forEach(([g, p]) => { scoresDb[g][p][h] = roundData.course.pars[h - 1] + (i === 1 && g === 2 ? 1 : 0); }); saveScoresToCloud([[1,1],[1,2],[2,1],[2,2]], h); } viewDashboard(); return seq; });
    const key = start === 'back' ? 'back' : 'front', K = key.toUpperCase(), tag = `[start ${seq[0]}]`;
    await page.click(`button.om-press[onclick="pressOurMatch('${key}','B')"]`); await page.waitForTimeout(150);
    const opts = await page.$$eval('#press-hole option', o => o.map(x => x.value + (x.selected ? '*' : '')));
    ok(opts.join() === [seq[1], seq[2], seq[3], seq[4], seq[5], seq[6] + '*'].join(), `${tag} press: holes from the 2nd played up to the next hole, next hole picked: ${opts.join()}`);
    if (start === 'front') await page.screenshot({ path: __dirname + '/shots/press-pick.png' });
    // late: it really started on the 3rd hole played
    await page.selectOption('#press-hole', String(seq[2])); await page.click('#press-save'); await page.waitForTimeout(200);
    ok(await page.evaluate(([k, h]) => matchPresses[k]?.B === h && window.__docs.active_round.matchPresses?.[k]?.B === h, [key, seq[1]]), `${tag} late press saved to start on hole ${seq[2]} (here and in the cloud)`);
    ok(await page.evaluate(([k, h]) => calculateOurMatch(roundData, scoresDb, matchPresses).nassau[k].bets.some(b => b.by === 'B' && b.label.includes(`starts hole ${h}`)), [key, seq[2]]), `${tag} the press bet counts from hole ${seq[2]}`);
    // wrong hole: change it to the 5th played
    await page.evaluate(() => { document.querySelector('details[data-fold="om-presses"]').open = true; });
    if (start === 'front') await (await page.$('details[data-fold="om-presses"]')).screenshot({ path: __dirname + '/shots/press-made.png' });
    await page.click('.om-press-made .om-movepress'); await page.waitForTimeout(150);
    ok(await page.inputValue('#press-hole') === String(seq[2]) && (await page.innerText('#press-title')).includes('Change'), `${tag} Change hole opens on the press's hole (${seq[2]})`);
    await page.selectOption('#press-hole', String(seq[4])); await page.click('#press-save'); await page.waitForTimeout(200);
    ok(await page.evaluate(([k, h]) => matchPresses[k]?.B === h && matchPresses[k]?.A == null && window.__docs.active_round.matchPresses?.[k]?.B === h, [key, seq[3]]), `${tag} press moved to start on hole ${seq[4]}`);
    // from Jordia & Mike's view (pairs flipped), changing it still moves their press
    await page.evaluate(() => { history.replaceState(null, '', location.pathname + '?beta=0&om=2'); viewDashboard(); document.querySelector('details[data-fold="om-presses"]').open = true; });
    await page.click('.om-press-made .om-movepress'); await page.waitForTimeout(150);
    await page.selectOption('#press-hole', String(seq[1])); await page.click('#press-save'); await page.waitForTimeout(200);
    ok(await page.evaluate(([k, h]) => matchPresses[k]?.B === h && matchPresses[k]?.A == null, [key, seq[0]]), `${tag} flipped view: their press moved, not the other pair's`);
    await page.close();
  }
  await browser.close();
  console.log(fails ? `${fails} FAILED` : 'ALL PASS'); process.exit(fails ? 1 : 0);
})();
