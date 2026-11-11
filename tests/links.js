const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs = require('fs');
const stub = fs.readFileSync(__dirname + '/stub.js', 'utf8');
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.setDefaultTimeout(5000);
  page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
  const seen = [];
  await page.route('**/*', r => { const u = new URL(r.request().url());
    if (u.href.includes('gstatic')) return r.fulfill({ contentType: 'text/javascript', body: u.href.includes('app-compat') ? stub : '' });
    if (u.host === 'app.test') { seen.push(u.pathname + u.search); let f = u.pathname.replace('/golf/', '') || 'index.html';
      return r.fulfill({ contentType: f.endsWith('.png') ? 'image/png' : 'text/html', body: fs.readFileSync(__dirname + '/../' + f) }); }
    return r.abort(); });
  for (const [f, q, title] of [['join.html', '?signup=1', 'Are you in?'], ['cart.html', '?cart=3', 'Cart scorecard'], ['live.html', '?spectator=true', 'Live leaderboard'], ['results.html', '?round=123', 'Final results']]) {
    const raw = fs.readFileSync(__dirname + '/../' + f, 'utf8');
    ok(raw.includes(`og:title" content="JB Golf · ${title}"`) && raw.includes(`golf/card-${f.replace('.html', '')}.png`), `${f} has its own preview card`);
    seen.length = 0;
    await page.goto('http://app.test/golf/' + f + q); await page.waitForTimeout(400);
    ok(page.url() === 'http://app.test/golf/' + q, `${f}${q} opens the app at /golf/${q}`);
  }
  // the app builds links through those pages
  await page.goto('http://app.test/golf/'); await page.waitForTimeout(400);
  const links = await page.evaluate(() => [shareUrl('cart.html', 'cart=2'), shareUrl('join.html', 'signup=1')]);
  ok(links[0] === 'http://app.test/golf/cart.html?cart=2' && links[1] === 'http://app.test/golf/join.html?signup=1', 'links: ' + links.join(' '));
  await browser.close();
  console.log(fails ? `${fails} FAILED` : 'ALL PASS'); process.exit(fails ? 1 : 0);
})();
