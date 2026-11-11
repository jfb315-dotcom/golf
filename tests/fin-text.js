// Finalizing opens "text the results" with the round's players (who have numbers) checked and the results link in the message
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs = require('fs');
const stub = fs.readFileSync(__dirname + '/stub.js', 'utf8');
const html = fs.readFileSync(__dirname + '/../index.html', 'utf8');
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1' });
  page.setDefaultTimeout(5000);
  page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
  page.on('dialog', d => d.accept());
  await page.route('**/*', r => { const u = r.request().url();
    if (u.includes('gstatic')) return r.fulfill({ contentType: 'text/javascript', body: u.includes('app-compat') ? stub : '' });
    if (u.startsWith('http://app.test/')) return r.fulfill({ contentType: 'text/html', body: html });
    return r.abort(); });
  await page.addInitScript(() => { window.__docsInit = { saved_players: { players: {
    'al adams': { name: 'Al Adams', first: 'Al', last: 'Adams', phone: '(423) 555-0101' },
    'bo brown': { name: 'Bo Brown', first: 'Bo', last: 'Brown', phone: '(423) 555-0102' },
    'cy cole': { name: 'Cy Cole', first: 'Cy', last: 'Cole' },
    'zed zane': { name: 'Zed Zane', first: 'Zed', last: 'Zane', phone: '(423) 555-0199' } } } }; });
  const pin = async () => { await page.waitForTimeout(150); for (const d of '1234') await page.click(`.pin-pad button:text-is("${d}")`); await page.waitForTimeout(400); };
  await page.goto('http://app.test/'); await page.waitForTimeout(500);
  await page.evaluate(() => { if (document.getElementById('step-home')?.classList.contains('active')) showScreen('step-1'); document.getElementById('group-count').value = 2; document.getElementById('players-per-group').value = 2; });
  await page.click('#step-1 .bar-primary[onclick="goToStep2()"]');
  for (const [id, n] of [['g1-p1','Al'],['g1-p2','Cy'],['g2-p1','Bo'],['g2-p2','Dee Dent']]) await page.fill(`#${id}-name`, n);
  await page.evaluate(() => saveRosterCache());
  await page.click('#btn-step2-next'); await page.waitForTimeout(400);
  page.evaluate(() => validateAndFinalize()); await pin();
  ok(await page.isVisible('#text-modal'), 'finalizing opens the text screen');
  ok((await page.innerText('#text-modal-title')) === 'Round finalized · text the results', 'titled for the results');
  const body = await page.inputValue('#text-body');
  ok(/^🏆 JB Golf final results · .+\nScores, money and who pays who:\nhttp:\/\/app\.test\/results\.html\?round=\d+$/.test(body), 'message has the results link: ' + JSON.stringify(body));
  const picked = await page.evaluate(() => groupTextList().map(x => x.name).sort().join());
  ok(picked === 'Al Adams,Bo Brown', 'checked: the round\'s players with numbers (not Zed, not Cy without a number): ' + picked);
  ok(await page.isVisible('#text-pick-round'), '"This round" quick pick shows');
  ok((await page.textContent('#text-send-picked')) === '💬 Text the 2 players checked below' && await page.evaluate(() => !!(document.getElementById('text-send-picked').compareDocumentPosition(document.getElementById('text-pick')) & 4)), 'both send buttons sit above the list; the first counts who is checked');
  await page.screenshot({ path: __dirname + '/shots/fin-text.png' });
  const nums = await page.evaluate(() => groupTextList().map(x => x.phone.replace(/[^\d+]/g, '')).sort().join());
  ok(nums === '4235550101,4235550102', 'texts go to Al and Bo: ' + nums);
  await browser.close();
  console.log(fails ? `${fails} FAILED` : 'ALL PASS'); process.exit(fails ? 1 : 0);
})();
