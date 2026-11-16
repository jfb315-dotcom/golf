// The app knows its version, checks the site for a newer one, loads it by itself on Home and offers it mid-round
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const { execSync } = require('child_process');
const fs = require('fs');
const stub = fs.readFileSync(__dirname + '/stub.js', 'utf8');
const html = fs.readFileSync(__dirname + '/../index.html', 'utf8');
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const verOf = h => (h.match(/const APP_VERSION = '([^']+)'/) || [])[1];
(async () => {
  const mine = verOf(html), file = fs.readFileSync(__dirname + '/../version.txt', 'utf8').trim();
  ok(mine && mine === file, `version.txt (${file}) matches APP_VERSION (${mine})`);
  // any change to the app must come with a new version, or phones won't know to update
  try {
    const live = execSync('git show origin/main:index.html', { cwd: __dirname + '/..', maxBuffer: 1e8 }).toString();
    if (live !== html) ok(verOf(live) !== mine, `index.html changed since the live copy, so the version changed too (live ${verOf(live) || 'none'} → ${mine})`);
  } catch (e) { console.log('(no origin/main to compare with)'); }
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const open = async site => { const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 }); page.setDefaultTimeout(5000);
    page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; }); page.on('dialog', d => d.accept());
    const st = { loads: 0, site };
    await page.route('**/*', r => { const u = r.request().url();
      if (u.includes('gstatic')) return r.fulfill({ contentType: 'text/javascript', body: u.includes('app-compat') ? stub : '' });
      if (u.includes('/version.txt')) return st.site === 'html' ? r.fulfill({ contentType: 'text/html', body: '<html>Sign in to Wi-Fi</html>' }) : r.fulfill({ contentType: 'text/plain', body: st.site + '\n' });
      if (u.startsWith('http://app.test/')) { if (r.request().isNavigationRequest()) st.loads++; return r.fulfill({ contentType: 'text/html', body: html }); }
      return r.abort(); });
    await page.addInitScript(() => { window.__docsInit = {}; });
    await page.goto('http://app.test/?beta=0'); await page.waitForTimeout(3200); return { page, st }; };
  let { page, st } = await open(mine);
  ok(st.loads === 1 && !(await page.isVisible('#update-bar')), 'up to date: no reload, no update bar');
  ok((await page.textContent('#app-version')).trim() === 'Version ' + mine && await page.isVisible('#app-version'), 'Home shows "Version ' + mine + '"');
  await page.evaluate(() => document.getElementById('app-version').scrollIntoView()); await page.screenshot({ path: __dirname + '/shots/version-home.png' });
  await page.close();
  ({ page, st } = await open('2099-01-01.1'));
  ok(st.loads === 2, 'a newer version on the site, sitting on Home: the app reloads itself once (loads: ' + st.loads + ')');
  ok(await page.isVisible('#update-bar'), 'still not the newest after that one reload: it offers the update instead of reloading again');
  await page.close();
  ({ page, st } = await open('html'));
  ok(st.loads === 1 && !(await page.isVisible('#update-bar')), 'a Wi-Fi sign-in page instead of a version is ignored');
  await page.close();
  // mid-round: offered, not forced
  ({ page, st } = await open(mine));
  await page.evaluate(() => startNewRound('om'));
  await page.click('#step-1 .bar-primary[onclick="goToStep2()"]');
  for (const [id, n] of [['g1-p1','John'],['g1-p2','Brent'],['g2-p1','Jordia'],['g2-p2','Andy']]) await page.fill(`#${id}-name`, n);
  await page.evaluate(() => saveRosterCache());
  await page.click('#btn-step2-next'); await page.waitForTimeout(400);
  st.site = '2099-01-01.1';
  await page.evaluate(() => checkForUpdate()); await page.waitForTimeout(500);
  ok(st.loads === 1 && await page.isVisible('#update-bar'), 'mid-round: no surprise reload, the update bar shows');
  await page.screenshot({ path: __dirname + '/shots/version-bar.png', clip: { x: 0, y: 0, width: 390, height: 260 } });
  await page.click('#update-bar'); await page.waitForTimeout(1500);
  ok(st.loads === 2, 'tapping the bar loads the new copy');
  await browser.close();
  console.log(fails ? `${fails} FAILED` : 'ALL PASS'); process.exit(fails ? 1 : 0);
})();
