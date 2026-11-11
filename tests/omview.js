// Our Match round, mid-round: what the organizer sees (scoring + standings) vs what the shared link shows
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs = require('fs');
const stub = fs.readFileSync(__dirname + '/stub.js', 'utf8');
const html = fs.readFileSync(process.argv[2] || __dirname + '/../index.html', 'utf8');
const tag = process.argv[3] || 'now';
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const mk = async (docs, url) => { const p = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 }); p.setDefaultTimeout(5000);
    p.on('pageerror', e => console.log('PAGE ERROR', e.message)); p.on('dialog', d => d.accept());
    await p.route('**/*', r => { const u = r.request().url();
      if (u.includes('gstatic')) return r.fulfill({ contentType: 'text/javascript', body: u.includes('app-compat') ? stub : '' });
      if (u.startsWith('http://app.test/')) return r.fulfill({ contentType: 'text/html', body: html });
      return r.abort(); });
    await p.addInitScript(d => { window.__docsInit = d; }, docs); await p.goto(url); await p.waitForTimeout(900); return p; };
  const a = await mk({}, 'http://app.test/?beta=0');
  await a.evaluate(() => { changeTheme('fairway'); startNewRound('om'); });
  await a.click('#step-1 .bar-primary[onclick="goToStep2()"]');
  for (const [id, n] of [['g1-p1','Jordia Smith'],['g1-p2','John Bischof'],['g2-p1','Brent Copeland'],['g2-p2','Andy Anderson']]) await a.fill(`#${id}-name`, n);
  await a.evaluate(() => saveRosterCache());
  await a.click('#btn-step2-next'); await a.waitForTimeout(400);
  await a.evaluate(() => {
    const over = [[0,1,0,1],[1,0,1,1],[-1,1,0,0],[0,0,1,0],[1,1,0,2],[0,1,0,0]];
    let who = [[1,1],[1,2],[2,1],[2,2]];
    for (let h = 1; h <= 6; h++) { who.forEach(([g, p], i) => { scoresDb[g][p][h] = roundData.course.pars[h - 1] + over[h - 1][i]; }); saveScoresToCloud(who, h); }
    roundData.currentHole = 7; renderScoreEntry();
  });
  await a.waitForTimeout(300);
  await a.screenshot({ path: __dirname + `/shots/omview-admin-scoring-${tag}.png` });
  await a.evaluate(() => { viewDashboard(); window.scrollTo(0, 0); }); await a.waitForTimeout(300);
  await a.evaluate(() => { let b = document.querySelector('.back-to-scoring'); if (b) b.style.visibility = 'hidden'; });
  const ah = await a.evaluate(() => document.documentElement.scrollHeight);
  await a.setViewportSize({ width: 390, height: Math.min(ah, 5000) }); await a.waitForTimeout(150);
  await a.screenshot({ path: __dirname + `/shots/omview-admin-stand-${tag}.png` });
  const adminText = await a.evaluate(() => [...document.querySelectorAll('#step-dashboard section, #step-dashboard details > summary, #step-dashboard .dash-section-title')].filter(e => e.offsetParent).map(e => (e.querySelector('.dash-section-title')?.textContent || e.textContent).replace(/\s+/g, ' ').trim().slice(0, 60)));
  const docs = await a.evaluate(() => JSON.parse(JSON.stringify(window.__docs)));
  // the link the organizer texts out (Our Match only): match.html → the app with spectator=true&om=1
  const s = await mk(docs, 'http://app.test/?spectator=true&om=1&beta=0');
  await s.evaluate(() => { window.scrollTo(0, 0); });
  const sh = await s.evaluate(() => document.documentElement.scrollHeight);
  await s.setViewportSize({ width: 390, height: Math.min(sh, 5000) }); await s.waitForTimeout(150);
  await s.screenshot({ path: __dirname + `/shots/omview-spec-${tag}.png` });
  const specText = await s.evaluate(() => [...document.querySelectorAll('.screen.active section, .screen.active details > summary, .screen.active .dash-section-title')].filter(e => e.offsetParent).map(e => (e.querySelector('.dash-section-title')?.textContent || e.textContent).replace(/\s+/g, ' ').trim().slice(0, 60)));
  console.log('ADMIN standings:\n  ' + [...new Set(adminText)].join('\n  '));
  console.log('LINK page (' + await s.evaluate(() => document.querySelector('.screen.active')?.id) + '):\n  ' + [...new Set(specText)].join('\n  '));
  const titles = [await a.textContent('#dashboard-title'), await s.textContent('#dashboard-title')];
  const same = JSON.stringify([...new Set(adminText)]) === JSON.stringify([...new Set(specText)]);
  console.log((same ? 'PASS' : 'FAIL') + ' the Our Match link shows the same sections as the organizer');
  console.log((titles[0] === titles[1] ? 'PASS' : 'FAIL') + ' same title: ' + titles.join(' / '));
  const noSide = !(await a.isVisible('#dashboard-side-bets .dash-section'));
  console.log((noSide ? 'PASS' : 'FAIL') + ' no empty Side bets section in an Our Match round');
  await browser.close();
  process.exit(same && titles[0] === titles[1] && noSide ? 0 : 1);
})();
