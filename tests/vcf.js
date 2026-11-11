const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs = require('fs');
const stub = fs.readFileSync(__dirname + '/stub.js', 'utf8');
const html = fs.readFileSync(__dirname + '/../index.html', 'utf8');
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.setDefaultTimeout(5000);
  page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
  const msgs = []; page.on('dialog', d => { msgs.push(d.message()); d.accept(); });
  await page.route('**/*', r => { const u = r.request().url();
    if (u.includes('gstatic')) return r.fulfill({ contentType: 'text/javascript', body: u.includes('app-compat') ? stub : '' });
    if (u.startsWith('http://app.test/')) return r.fulfill({ contentType: 'text/html', body: html });
    return r.abort(); });
  await page.addInitScript(() => { window.__docsInit = { saved_players: { players: {
    'bart hamilton': { name: 'Bart Hamilton', first: 'Bart', last: 'Hamilton' }, 'joe king': { name: 'Joe King', first: 'Joe', last: 'King' },
    'mike watson': { name: 'Mike Watson', first: 'Mike', last: 'Watson', phone: '423-555-7777' } } } }; });
  await page.goto('http://app.test/'); await page.waitForTimeout(500);
  await page.click('.home-tile[onclick="openPlayersScreen()"]'); await page.waitForTimeout(200);
  console.log(await page.evaluate(() => [document.querySelector('.screen.active').id, getComputedStyle(document.querySelector('[onclick*=vcf-file]')).display])); ok(await page.isVisible('button:has-text("Add phone numbers from a contacts file")'), 'import button on Players');
  await page.setInputFiles('#vcf-file', __dirname + '/vcfdir/golf.vcf'); await page.waitForTimeout(400);
  const ph = await page.evaluate(() => window.__docs.admin_private.phones);
  const p = Object.fromEntries(Object.entries(ph).map(([k, v]) => [k, { phone: v }]));
  ok(await page.evaluate(() => Object.values(window.__docs.saved_players.players).every(x => x.phone === undefined)), 'numbers are not on the shared player list (moved to the private doc)');
  ok(p['bart hamilton'].phone === '(423) 555-0111', 'Bart gets his mobile (not home) number: ' + p['bart hamilton'].phone);
  ok(p['joe king'].phone === '(423) 555-0122', 'Joe gets his number, formatted: ' + p['joe king'].phone);
  ok(p['mike watson'].phone === '423-555-7777', 'Mike keeps the number he had');
  ok(!p['dave plumber'] && !(await page.evaluate(() => window.__docs.saved_players.players['dave plumber'])), 'other contacts are not added');
  ok(msgs.some(m => m.includes('Added numbers for 2 players. 1 already had one. 1 contact didn\'t match')), 'summary: ' + msgs.join(' | '));
  // green dot for players with a number, and a count
  await page.evaluate(() => renderPlayersList());
  const dots = await page.$$eval('.player-row', e => e.map(x => [x.querySelector('b').textContent, x.querySelector('.phone-dot').classList.contains('on')]));
  ok(JSON.stringify(dots) === JSON.stringify([['Bart Hamilton', true], ['Joe King', true], ['Mike Watson', true]]), 'green dots: ' + JSON.stringify(dots));
  ok((await page.textContent('#players-phones')).includes('3 of 3 have a mobile number'), 'count of players with numbers');
  // typing a number formats it
  await page.evaluate(() => { savedPlayers['amy z'] = { name: 'Amy Z', first: 'Amy', last: 'Z' }; renderPlayersList(); });
  ok(!(await page.$eval('.player-row:has-text("Amy") .phone-dot', e => e.classList.contains('on'))), 'no number: empty dot');
  await page.click('.player-row:has-text("Amy")');
  await page.type('#pl-phone', '4235550199');
  ok(await page.inputValue('#pl-phone') === '(423) 555-0199', 'typing formats as you go: ' + await page.inputValue('#pl-phone'));
  await page.fill('#pl-phone', '1-423-555-0177'); await page.dispatchEvent('#pl-phone', 'input');
  ok(await page.inputValue('#pl-phone') === '(423) 555-0177', 'pasting with a leading 1 and dashes formats too');
  await page.screenshot({ path: __dirname + '/shots/phone-format.png' });
  await page.click('#player-modal .btn-primary'); await page.waitForTimeout(200);
  ok(await page.evaluate(() => window.__docs.admin_private.phones['amy z']) === '(423) 555-0177' && await page.evaluate(() => window.__docs.saved_players.players['amy z'].phone === undefined), 'saved formatted, privately');
  await page.screenshot({ path: __dirname + '/shots/phone-dots.png' });
  // share with preview: link goes in url
  // the admin's spectator share opens the text screen with the link in the message
  await page.evaluate(() => shareSpectatorLink());
  ok(await page.isVisible('#text-modal') && (await page.inputValue('#text-body')).endsWith('live.html?spectator=true'), 'admin spectator share: text screen, link at the end of the message');
  // a cart phone still gets the Share menu with the link in its own spot (for the picture)
  const shared = await page.evaluate(async () => { document.getElementById('text-modal').classList.remove('active'); lockedTeamId = 1; let got; navigator.share = d => { got = d; return Promise.resolve(); }; shareSpectatorLink(); lockedTeamId = null; return got; });
  ok(shared && shared.url.endsWith('live.html?spectator=true') && !shared.text.includes('http'), 'cart spectator share puts the link in its own spot (for the picture): ' + JSON.stringify(shared));
  await browser.close();
  console.log(fails ? `${fails} FAILED` : 'ALL PASS'); process.exit(fails ? 1 : 0);
})();
