// Simulate many randomized rounds through the real app: admin setup -> scoring -> standings -> finalize -> results,
// with cart and spectator phones checked every few rounds. Checks money balances and pages for errors / NaN / undefined.
// usage: node sim.js <first> <count>
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs = require('fs');
const stub = fs.readFileSync(__dirname + '/stub.js', 'utf8');
const html = fs.readFileSync(__dirname + '/../index.html', 'utf8');
const first = +(process.argv[2] || 1), count = +(process.argv[3] || 10);
let seed = first * 7919;
const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const pick = a => a[Math.floor(rnd() * a.length)];
const results = [];

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const mk = async (docs) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const p = await ctx.newPage(); p.setDefaultTimeout(6000);
    p.__errors = []; p.__dialogs = [];
    p.on('pageerror', e => p.__errors.push(e.message));
    p.on('dialog', d => { p.__dialogs.push(d.message().slice(0, 90)); d.accept(); });
    await p.route('**/*', r => { const u = r.request().url();
      if (u.includes('gstatic')) return r.fulfill({ contentType: 'text/javascript', body: u.includes('app-compat') ? stub : '' });
      if (u.includes('jbgolf-alerts')) return r.fulfill({ contentType: 'application/json', body: '{"sent":0}', headers: { 'Access-Control-Allow-Origin': '*' } });
      if (u.startsWith('http://app.test/')) return r.fulfill({ contentType: 'text/html', body: html });
      return r.abort(); });
    await p.addInitScript(d => { window.__docsInit = d; }, docs || {});
    return { p, ctx };
  };
  const badText = t => (t.match(/\bNaN\b|\bundefined\b|\[object Object\]|\bnull\b/g) || []);

  for (let n = first; n < first + count; n++) {
    const r = { n, issues: [], cfg: {} };
    const t0 = Date.now();
    const { p: page, ctx } = await mk({});
    try {
      await page.goto('http://app.test/'); await page.waitForTimeout(300);
      // ---------- setup ----------
      const teams = pick([2, 2, 2, 3, 4]), ppg = pick([2, 3, 4, 4]);
      const nine = rnd() < 0.25, back = rnd() < 0.2;
      const fm = [1, 2, 3].filter(() => rnd() < 0.55); if (!fm.length) fm.push(2);
      const omOk = ppg >= 2;
      const om = omOk && rnd() < 0.45, omOnly = om && rnd() < 0.35, net = om && rnd() < 0.4;
      const bet = pick([5, 10, 20]), skins = pick([0, 5, 10]);
      const sideBets = teams * ppg >= 4 && rnd() < 0.4 ? pick([1, 1, 2]) : 0;
      const scramble = !omOnly && teams * ppg >= 4 && rnd() < 0.25;
      Object.assign(r.cfg, { teams, ppg, holes: nine ? 9 : 18, back, formats: fm.join('/'), om, omOnly, net, bet, skins, sideBets, scramble });
      await page.evaluate(c => {
        showScreen('step-1');
        let sel = document.getElementById('course-selector'); sel.selectedIndex = Math.floor(c.r1 * sel.options.length); sel.dispatchEvent(new Event('change'));
        document.getElementById('group-count').value = c.teams; document.getElementById('players-per-group').value = c.ppg;
        let hf = document.getElementById('hole-format'); hf.value = c.nine ? '9' : '18'; hf.dispatchEvent(new Event('change'));
        let st = document.getElementById('start-type'); st.value = c.back ? 'back' : 'front'; st.dispatchEvent(new Event('change'));
        if (c.nine) { let nt = document.getElementById('nine-hole-type'); nt.value = c.r2 < 0.5 ? 'nassau' : 'straight'; nt.dispatchEvent(new Event('change')); }
        [1, 2, 3].forEach(f => { let el = document.getElementById('fmt-' + f); el.checked = c.fm.includes(f); el.dispatchEvent(new Event('change')); document.getElementById(`fmt-${f}-birdies`).checked = c.r3 < 0.5; });
        document.getElementById('bet-amount').value = c.bet; document.getElementById('skins-amount').value = c.skins;
        if (c.om) { let e = document.getElementById('om-enabled'); e.checked = true; toggleOurMatchOptions(); document.getElementById('om-nassau-net').checked = c.net;
          if (c.omOnly) { document.getElementById('om-only').checked = true; toggleOurMatchOnly(); } }
      }, { teams, ppg, nine, back, fm, om, omOnly, net, bet, skins, r1: rnd(), r2: rnd(), r3: rnd() });
      await page.click('#step-1 .bar-primary[onclick="goToStep2()"]'); await page.waitForTimeout(150);
      for (let g = 1; g <= teams; g++) for (let p = 1; p <= ppg; p++) {
        await page.fill(`#g${g}-p${p}-name`, `P${g}${p} Last${g}${p}`);
        if (rnd() < 0.25) await page.fill(`#g${g}-p${p}-strokes`, [3, 7, 12, 15].filter(() => rnd() < 0.5).join(', '));
      }
      await page.evaluate(() => saveRosterCache());
      if (sideBets) await page.evaluate(k => {
        let slots = []; for (let g = 1; g <= +document.getElementById('group-count').value; g++) for (let p = 1; p <= +document.getElementById('players-per-group').value; p++) slots.push(`${g}-${p}`);
        tempRosterCache.sideBets = [];
        for (let i = 0; i < k; i++) { let s = [...slots].sort(() => Math.random() - 0.5); tempRosterCache.sideBets.push({ a1: s[0], a2: s[1], b1: s[2], b2: s[3], amount: 10, allBirdies: Math.random() < 0.5 }); }
        renderSideBets();
      }, sideBets);
      if (scramble) {
        await page.evaluate(() => { let s = document.getElementById('is-scrambled'); s.value = 'yes'; s.dispatchEvent(new Event('change')); processStep2(); });
        await page.evaluate(() => {
          let total = +document.getElementById('group-count').value * +document.getElementById('players-per-group').value;
          document.getElementById('cart-group-count').value = Math.ceil(total / 4); renderPairingDropdowns();
          let slots = []; for (let g = 1; g <= +document.getElementById('group-count').value; g++) for (let p = 1; p <= +document.getElementById('players-per-group').value; p++) slots.push(`${g}-${p}`);
          slots.forEach((v, i) => { let el = document.getElementById(`cart${Math.floor(i / 4) + 1}-p${i % 4 + 1}`); if (el) { el.value = v; el.dispatchEvent(new Event('change')); } });
          startRoundScrambled();
        });
      } else {
        await page.click('#btn-step2-next');
      }
      await page.waitForTimeout(400);
      const started = await page.evaluate(() => !!(roundData?.roundId && document.getElementById('step-3').classList.contains('active')));
      if (!started) { r.issues.push('round did not start: ' + page.__dialogs.slice(-1)); throw new Error('nostart'); }

      // ---------- scoring, hole by hole, as the admin ----------
      const seq = await page.evaluate(() => getHoleSequence());
      for (let i = 0; i < seq.length; i++) {
        const h = seq[i];
        await page.evaluate(([h, rr]) => {
          let par = roundData.course.pars[h - 1], who = [];
          roundData.groups.forEach(g => g.players.forEach(p => { if (p.isGhost) return; let x = rr[(g.id * 7 + p.id * 3) % rr.length];
            scoresDb[g.id][p.id] = scoresDb[g.id][p.id] || {}; scoresDb[g.id][p.id][h] = Math.max(1, par + (x < 0.12 ? -1 : x < 0.55 ? 0 : x < 0.85 ? 1 : 2)); who.push([g.id, p.id]); }));
          saveScoresToCloud(who, h);
        }, [h, Array.from({ length: 20 }, rnd)]);
        if (om && i === 3 && rnd() < 0.6) await page.evaluate(() => { let m = calculateOurMatch(roundData, scoresDb, matchPresses); let k = Object.keys(m.nassau).find(k => m.nassau[k].canPress.A || m.nassau[k].canPress.B); if (k) pressOurMatch(k, m.nassau[k].canPress.A ? 'A' : 'B'); });
        if (i === Math.floor(seq.length / 2)) {
          await page.evaluate(() => viewDashboard());
          const mid = await page.innerText('#step-dashboard');
          if (badText(mid).length) r.issues.push('mid-round standings show: ' + badText(mid).join(','));
          await page.evaluate(() => switchScreen('step-dashboard', 'step-3'));
        }
      }
      // a score changed after the fact
      await page.evaluate(h => { let g = roundData.groups[0], p = g.players[0]; scoresDb[g.id][p.id][h] += 1; saveScoresToCloud([[g.id, p.id]], h); }, seq[1]);
      await page.waitForTimeout(150);

      // ---------- money must balance ----------
      const money = await page.evaluate(() => {
        let out = {};
        let mo = roundMoney(roundData, scoresDb);
        ['games', 'om', 'side'].forEach(f => out[f] = Object.values(mo).reduce((a, m) => a + (m[f] || 0), 0));
        out.players = Object.keys(mo).length;
        if (hasTournamentMoney(roundData)) { let pay = calculatePayouts(roundData, scoresDb); out.payNet = pay.players.reduce((a, x) => a + x.netCents, 0); out.payCount = pay.players.length; }
        out.omFinished = roundData.ourMatch ? !!calculateOurMatch(roundData, scoresDb, matchPresses)?.finished : null;
        out.sb = (roundData.sideBets || []).map(b => calculateSideBet(roundData, scoresDb, b)?.finished);
        return out;
      });
      r.money = money;
      if (Math.abs(money.games) > money.players) r.issues.push(`team bets/skins don't balance: ${money.games}¢`);
      if (money.om !== 0) r.issues.push(`Our Match doesn't balance: ${money.om}¢`);
      if (money.side !== 0) r.issues.push(`side bets don't balance: ${money.side}¢`);
      if (money.payNet !== undefined && Math.abs(money.payNet) > money.payCount) r.issues.push(`payouts don't balance: ${money.payNet}¢`);
      if (om && !money.omFinished) r.issues.push('Our Match not finished after all holes');
      if (money.sb.some(x => !x)) r.issues.push('a side bet not finished after all holes');

      // ---------- standings ----------
      await page.evaluate(() => viewDashboard()); await page.waitForTimeout(100);
      const dash = await page.innerText('#step-dashboard');
      if (badText(dash).length) r.issues.push('final standings show: ' + badText(dash).join(','));
      r.dashHeight = await page.evaluate(() => document.getElementById('step-dashboard').scrollHeight);
      r.folds = await page.evaluate(() => document.querySelectorAll('#step-dashboard details').length);
      r.overflow = await page.evaluate(() => [...document.querySelectorAll('#step-dashboard *')].filter(e => e.getBoundingClientRect().right > innerWidth + 1 && !e.closest('.scorecard-scroll,.table-scroll,[style*="overflow"]') && getComputedStyle(e).position !== 'fixed').length);

      // ---------- cart + spectator phones (every 4th round) ----------
      if (n % 4 === 0) {
        const docs = await page.evaluate(() => window.__docs);
        const rid = docs.active_round.roundData.roundId;
        const cartId = docs.active_round.roundData.carts?.[0]?.id ?? 1;
        for (const [who, q] of [['cart', `?cart=${cartId}&r=${rid}`], ['spectator', `?spectator=true${om ? '&om=' + (rnd() < 0.5 ? 1 : 2) : ''}`]]) {
          const { p: other, ctx: c2 } = await mk(docs);
          await other.goto('http://app.test/' + q); await other.waitForTimeout(1200);
          const active = await other.evaluate(() => document.querySelector('.screen.active')?.id);
          if (who === 'cart' && active !== 'step-3' && active !== 'step-dashboard') r.issues.push(`cart link opened on ${active}`);
          if (who === 'spectator' && active !== 'step-dashboard') r.issues.push(`spectator link opened on ${active}`);
          await other.evaluate(() => viewDashboard()).catch(() => {});
          const t = await other.innerText('#step-dashboard').catch(() => '');
          if (badText(t).length) r.issues.push(`${who} standings show: ` + badText(t).join(','));
          if (other.__errors.length) r.issues.push(`${who} page errors: ` + other.__errors.slice(0, 2).join(' | '));
          await c2.close();
        }
      }

      // ---------- finalize + results ----------
      page.evaluate(() => validateAndFinalize());
      await page.waitForTimeout(200); for (const d of '1234') await page.click(`.pin-pad button:text-is("${d}")`); await page.waitForTimeout(500);
      const fin = await page.evaluate(() => ({ archived: window.__docs.active_round.isArchived === true, text: document.getElementById('text-modal').classList.contains('active'), body: document.getElementById('text-body').value }));
      if (!fin.archived) r.issues.push('not archived after finalize');
      if (!fin.text || !/results\.html\?round=|match\.html\?round=/.test(fin.body)) r.issues.push('finalize did not open the results text');
      const arc = await page.evaluate(() => { document.getElementById('text-modal').classList.remove('active'); let a = JSON.parse(localStorage.getItem('tournamentArchive')).slice(-1)[0]; renderArchivedRound(a); return document.getElementById('step-9').innerText; });
      if (badText(arc).length) r.issues.push('results page shows: ' + badText(arc).join(','));
      const hist = await page.evaluate(() => Object.keys(roundHistory).length);
      if (!hist) r.issues.push('nothing saved to history/stats');
      if (page.__errors.length) r.issues.push('admin page errors: ' + [...new Set(page.__errors)].slice(0, 3).join(' | '));
    } catch (e) {
      if (e.message !== 'nostart') r.issues.push('script stopped: ' + e.message.split('\n')[0].slice(0, 140));
    }
    r.ms = Date.now() - t0;
    results.push(r);
    console.log(`#${n} ${r.issues.length ? 'ISSUES' : 'ok'} ${JSON.stringify(r.cfg)} ${r.issues.join(' || ')}`);
    await ctx.close();
  }
  fs.writeFileSync(__dirname + `/sim-${first}.json`, JSON.stringify(results, null, 1));
  await browser.close();
})();
