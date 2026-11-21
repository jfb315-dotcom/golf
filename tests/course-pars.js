// Course pars match the real scorecards (Tennessee National was wrong hole by hole until Nov 2026)
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs = require('fs');
const stub = fs.readFileSync(__dirname + '/stub.js', 'utf8');
const html = fs.readFileSync(process.argv[2] || __dirname + '/../index.html', 'utf8');
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await browser.newPage(); page.setDefaultTimeout(5000);
  page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
  await page.route('**/*', r => { const u = r.request().url();
    if (u.includes('gstatic')) return r.fulfill({ contentType: 'text/javascript', body: u.includes('app-compat') ? stub : '' });
    if (u.startsWith('http://app.test/')) return r.fulfill({ contentType: 'text/html', body: html });
    return r.abort(); });
  await page.addInitScript(() => { window.__docsInit = {}; });
  await page.goto('http://app.test/?beta=0'); await page.waitForTimeout(400);
  const tn = await page.evaluate(() => allAvailableCourses.tennessee_national.pars.join(','));
  ok(tn === '4,5,3,5,4,4,3,4,4,4,5,3,4,5,4,4,3,4', 'Tennessee National pars: ' + tn);
  const tees = await page.evaluate(() => courseTees('tennessee_national').map(t => `${t.name} ${t.yards} ${t.rating}/${t.slope}`).join(', '));
  ok(tees === 'Black 7393 75.9/139, Orange 6936 73.6/137, White 6572 71.8/135, White/Green 6235 69.9/128, Green 6059 69.4/127, Red 5355 71.5/129', 'Tennessee National tees match the card: ' + tees);
  await browser.close();
  console.log(fails ? `${fails} FAILED` : 'ALL PASS'); process.exit(fails ? 1 : 0);
})();
