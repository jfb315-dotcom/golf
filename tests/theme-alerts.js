const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs = require('fs');
const stub = fs.readFileSync(__dirname + '/stub-shared.js', 'utf8');
const html = fs.readFileSync(__dirname + '/../index.html', 'utf8');
const TEAMS = 2;
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
// ---- shared backend ----
const docs = {}; const pages = [];
function setPath(obj, segs, v) { let o = obj; for (let i = 0; i < segs.length - 1; i++) { if (typeof o[segs[i]] !== 'object' || o[segs[i]] === null) o[segs[i]] = {}; o = o[segs[i]]; } if (v && v.__delete) delete o[segs[segs.length - 1]]; else o[segs[segs.length - 1]] = v; }
function deepMerge(t, s) { for (const k in s) { if (s[k] && typeof s[k] === 'object' && !Array.isArray(s[k])) { if (typeof t[k] !== 'object' || !t[k]) t[k] = {}; deepMerge(t[k], s[k]); } else t[k] = s[k]; } }
let queue = Promise.resolve();
async function write(op) {
  await new Promise(r => setTimeout(r, Math.random() * 60));          // network latency, so writes from different phones interleave
  queue = queue.then(async () => {
    if (op.op === 'set') { if (op.merge) { docs[op.id] = docs[op.id] || {}; deepMerge(docs[op.id], op.data); } else docs[op.id] = op.data; }
    else { if (!docs[op.id]) throw new Error('update on missing doc'); op.pairs.forEach(([segs, v]) => setPath(docs[op.id], segs, v)); }
    const snap = JSON.parse(JSON.stringify(docs));
    await Promise.all(pages.map(p => p.evaluate(d => window.__receiveDocs(d), snap).catch(() => {})));
  });
  return queue;
}

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  async function open(q) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });   // each phone has its own storage
    const page = await ctx.newPage();
    page.on('pageerror', e => { console.log(`PAGE ERROR ${q}:`, e.message); fails++; });
    page.on('dialog', d => { if (q) console.log('DIALOG', q, d.message().replace(/\n/g, ' ')); d.accept(); });
    await page.exposeFunction('__backendWrite', write);
    await page.route('**/*', r => { const u = r.request().url();
      if (u.includes('gstatic')) return r.fulfill({ contentType: 'text/javascript', body: u.includes('app-compat') ? stub : '' });
      if (u.startsWith('http://app.test/')) return u.includes('logo') ? r.fulfill({ status: 404, body: '' }) : r.fulfill({ contentType: 'text/html', body: html });
      return r.abort(); });
    await page.goto('http://app.test/' + q);
    await page.evaluate(d => window.__receiveDocs(d), JSON.parse(JSON.stringify(docs)));
    pages.push(page);
    await page.waitForTimeout(200);
    await page.evaluate(() => { if (document.getElementById('step-home')?.classList.contains('active')) showScreen('step-1'); });
    return page;
  }
  const admin = await open('');
  // alerts section is closed with a count
  ok(await admin.isVisible('#alerts-row') && await admin.innerText('#alerts-count') === '13 of 13 on', 'Setup has a Phone alerts row showing "13 of 13 on"');
  await admin.click('#alerts-row'); await admin.waitForTimeout(100);
  await admin.uncheck('#alert-doubles');
  ok(await admin.innerText('#alerts-count') === '12 of 13 on', 'count updates when a switch changes');
  await admin.screenshot({ path: __dirname + '/shots/alerts-screen.png', fullPage: true });
  await admin.click('#step-alerts .back-link-top');
  // start a round in Augusta
  await admin.evaluate(() => { document.getElementById('app-theme-selector').value = 'augusta'; changeTheme(); document.getElementById('group-count').value = 2; document.getElementById('players-per-group').value = 2; });
  await admin.click('text=Next: Rosters');
  for (const [id, n] of [['g1-p1','Brent'],['g1-p2','John'],['g2-p1','Jordia'],['g2-p2','Mike']]) await admin.fill(`#${id}-name`, n);
  await admin.evaluate(() => saveRosterCache());
  await admin.click('#btn-step2-next'); await admin.waitForTimeout(500);
  ok(docs.active_round?.roundData?.theme === 'augusta', 'round saved with the admin theme: ' + docs.active_round?.roundData?.theme);
  const cart = await open('?cart=1');
  await cart.waitForTimeout(500);
  const bg = () => cart.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--bg-dark').trim());
  ok(await bg() === await admin.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--bg-dark').trim()), 'cart phone opens in Augusta: ' + await bg());
  const spec = await open('?spectator=true'); await spec.waitForTimeout(500);
  ok(await spec.evaluate(() => localStorage.getItem('savedTheme')) === 'augusta', 'spectator follows too');
  // admin switches mid-round: everyone follows
  await admin.evaluate(() => { document.getElementById('app-theme-selector').value = 'neyland'; changeTheme(); });
  await admin.waitForTimeout(800);
  ok(await cart.evaluate(() => localStorage.getItem('savedTheme')) === 'neyland' && await bg() === '#121212', 'admin switches to Neyland Night mid-round, the cart follows');
  await browser.close();
  console.log(fails ? `${fails} FAILED` : 'ALL PASS'); process.exit(fails ? 1 : 0);
})();
