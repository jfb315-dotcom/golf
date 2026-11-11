const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs = require('fs');
const stub = fs.readFileSync(__dirname + '/stub-shared.js', 'utf8');
const html = fs.readFileSync(__dirname + '/../index.html', 'utf8');
const TEAMS = +(process.env.TEAMS || 5);
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
  const score = (g, p, h) => 2 + ((g * 7 + p * 3 + h * 5) % 6);   // deterministic 2..7

  // Admin sets up TEAMS teams of 4, riding with their team
  const admin = await open('');
  await admin.evaluate(n => { document.getElementById('group-count').value = n; document.getElementById('players-per-group').value = 4; document.getElementById('bet-amount').value = 20; }, TEAMS);
  await admin.click('text=Next: Rosters');
  for (let g = 1; g <= TEAMS; g++) for (let p = 1; p <= 4; p++) await admin.fill(`#g${g}-p${p}-name`, `P${g}${p}`);
  await admin.evaluate(() => saveRosterCache());
  await admin.click('#btn-step2-next'); await admin.waitForTimeout(400);
  ok(await admin.isVisible('#step-3') && docs.active_round.roundData.groups.length === TEAMS, `round started with ${TEAMS} teams`);

  const carts = [];
  for (let c = 1; c <= TEAMS; c++) carts.push(await open(`?cart=${c}&r=${docs.active_round.roundData.roundId}`));
  ok((await Promise.all(carts.map(p => p.isVisible('#cart-scorecard-list')))).every(Boolean), `all ${TEAMS} cart phones open on their All scores list`);

  // Every cart scores holes `from`..`to` at the same time with the keypad
  async function playHoles(from, to) {
    await Promise.all(carts.map(async (page, i) => {
      const g = i + 1;
      const onHole = await page.evaluate(() => document.querySelector('.cart-band-hole')?.offsetParent ? document.querySelector('.cart-band-hole').innerText : null);
      if (onHole !== `Hole ${from}`) {
        if (onHole) await page.click('text=‹ All holes / scores');
        await page.click(`.hole-list-row >> nth=${from - 1}`);
      }
      for (let h = from; h <= to; h++) {
        await page.waitForFunction(h => document.querySelector('.cart-band-hole')?.innerText === `Hole ${h}`, h, { timeout: 10000 });
        for (let p = 1; p <= 4; p++) {
          await page.click(`label[for="score-input-${g}-${p}"]`);
          await page.click(`.score-keypad button:text-is("${score(g, p, h)}")`);
        }
        if (h < to) await page.waitForTimeout(2400);   // auto-advance delay after the last player
      }
    }));
    await new Promise(r => setTimeout(r, 1500));
  }
  const missing = (holes) => { const bad = []; for (let g = 1; g <= TEAMS; g++) for (let p = 1; p <= 4; p++) for (const h of holes) { if (docs.active_round.scoresDb?.[g]?.[p]?.[h] !== score(g, p, h)) bad.push(`${g}-${p}-h${h}=${docs.active_round.scoresDb?.[g]?.[p]?.[h]}`); } return bad; };

  await playHoles(1, 3);
  let bad = missing([1, 2, 3]);
  ok(bad.length === 0, `${TEAMS} carts scoring at once: all ${TEAMS * 4 * 3} scores saved` + (bad.length ? ' MISSING ' + bad.slice(0, 8).join(' ') : ''));
  const adminSees = await admin.evaluate(() => JSON.stringify(scoresDb));
  ok(adminSees === JSON.stringify(docs.active_round.scoresDb), 'admin phone shows every cart\'s scores');

  // ---- Mid-round edit: admin reloads the app (as can happen), taps Edit Setup, changes the bet, starts again,
  // while every cart keeps scoring hole 4
  await admin.reload(); await admin.evaluate(d => window.__receiveDocs(d), JSON.parse(JSON.stringify(docs))); await admin.waitForTimeout(400);
  const before = JSON.parse(JSON.stringify(docs.active_round.roundData));
  const editing = (async () => {
    await admin.click('text=Edit setup / rosters');
    await admin.waitForTimeout(300);
    await admin.fill('#bet-amount', '25');
    await admin.click('text=Next: Rosters'); await admin.waitForTimeout(300);
    await admin.click('#btn-step2-next'); await admin.waitForTimeout(500);
  })();
  await Promise.all([editing, playHoles(4, 4)]);
  const after = docs.active_round.roundData;
  ok(after.betAmount === 25, 'mid-round edit saved the new bet ($25)');
  ok(after.groups.length === TEAMS && after.groups.every((g, i) => g.players.length === 4 && g.players[0].name === `P${i + 1}1`), `teams unchanged after edit (${after.groups.length} teams)`);
  ok(after.course.name === before.course.name && after.playMode === before.playMode && after.formats.join() === before.formats.join(), 'course, holes and games unchanged');
  ok(after.roundId === before.roundId, 'same round (not restarted)');
  bad = missing([1, 2, 3, 4]);
  ok(bad.length === 0, 'no scores lost during the edit, including ones entered while it happened' + (bad.length ? ' MISSING ' + bad.slice(0, 8).join(' ') : ''));
  ok((await Promise.all(carts.map(p => p.isVisible('#step-3')))).every(Boolean), 'cart phones kept scoring (not kicked out)');

  // After the edit, carts carry on
  await playHoles(5, 5);
  bad = missing([1, 2, 3, 4, 5]);
  ok(bad.length === 0, 'scoring continues normally after the edit' + (bad.length ? ' MISSING ' + bad.slice(0, 8).join(' ') : ''));
  await admin.evaluate(() => viewDashboard());
  const prog = await admin.innerText('#dashboard-cart-progress');
  ok((prog.match(/Thru 5/g) || []).length === TEAMS, 'admin standings: every cart Thru 5');
  await browser.close();
  console.log(fails ? `${fails} FAILURE(S)` : 'ALL PASSED'); process.exit(fails ? 1 : 0);
})();
