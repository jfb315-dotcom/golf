// iPhones zoom in when you tap a typing box whose text is under 16px. Visit every screen and pop-up and list those boxes.
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs = require('fs');
const stub = fs.readFileSync(__dirname + '/stub.js', 'utf8');
const html = fs.readFileSync(process.argv[2] || __dirname + '/../index.html', 'utf8');
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const found = new Map();
  for (const beta of [false, true]) {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } }); page.setDefaultTimeout(5000);
    page.on('dialog', d => d.dismiss());
    await page.route('**/*', r => { const u = r.request().url();
      if (u.includes('gstatic')) return r.fulfill({ contentType: 'text/javascript', body: u.includes('app-compat') ? stub : '' });
      if (u.startsWith('http://app.test/')) return r.fulfill({ contentType: 'text/html', body: html });
      return r.abort(); });
    await page.addInitScript(() => { window.__docsInit = { saved_players: { players: { 'al adams': { name: 'Al Adams', first: 'Al', last: 'Adams', handicap: 10 } } } }; });
    await page.goto('http://app.test/?beta=' + (beta ? 1 : 0)); await page.waitForTimeout(500);
    const scan = async where => {
      const list = await page.evaluate(() => [...document.querySelectorAll('input, select, textarea')].filter(el => {
        if (['checkbox', 'radio', 'hidden', 'button', 'submit', 'range', 'color', 'file'].includes(el.type)) return false;
        if (el.readOnly || el.getAttribute('inputmode') === 'none') return false; // no keyboard, no zoom
        return parseFloat(getComputedStyle(el).fontSize) < 16;
      }).map(el => {
        let label = el.id || el.name || el.className || el.placeholder || el.tagName;
        let home = el.closest('.screen, .modal-overlay')?.id || '?';
        return `${home} › ${el.tagName.toLowerCase()}${el.type && el.tagName === 'INPUT' ? '[' + el.type + ']' : ''} ${label.toString().slice(0, 40)} (${getComputedStyle(el).fontSize}${el.placeholder ? ', "' + el.placeholder.slice(0, 25) + '"' : ''})`;
      }));
      list.forEach(x => { let k = x.replace(/g\d+-p\d+/g, 'gN-pN').replace(/-\d+\b/g, '-N'); if (!found.has(k)) found.set(k, (beta ? 'test' : 'real') + ' / ' + where); });
    };
    const safe = async (where, fn) => { try { await fn(); await page.waitForTimeout(200); await scan(where); } catch (e) { console.log('skip', where, e.message.split('\n')[0]); } };
    await safe('start', async () => {});
    await safe('setup', async () => { await page.evaluate(() => { showScreen('step-1'); document.getElementById('group-count').value = 2; document.getElementById('players-per-group').value = 2; let e = document.getElementById('om-enabled'); e.checked = true; toggleOurMatchOptions(); }); });
    await safe('rosters', async () => {
      if (beta) { await page.click('text=Next: games & money'); await page.click('text=Next: players & teams'); } else await page.click('#step-1 .bar-primary[onclick="goToStep2()"]');
      for (const [id, n] of [['g1-p1','Al Adams'],['g1-p2','Bo Brown'],['g2-p1','Ed Eads'],['g2-p2','Fy Fox']]) await page.fill(`#${id}-name`, n);
      await page.evaluate(() => saveRosterCache());
    });
    await safe('strokes pop-up', async () => { await page.evaluate(() => { let b = [...document.querySelectorAll('#step-2 button')].find(x => /strokes/i.test(x.textContent)); b && b.click(); }); });
    await safe('side bet setup', async () => { await page.evaluate(() => { document.querySelectorAll('.modal-overlay.active').forEach(m => m.classList.remove('active')); if (BETA) rvPage('step-2', 4); let b = [...document.querySelectorAll('#side-bets-setup button')].find(x => /side bet/i.test(x.textContent)); b && b.click(); }); });
    await safe('round', async () => { await page.evaluate(() => document.querySelectorAll('.modal-overlay.active').forEach(m => m.classList.remove('active'))); if (beta) await page.evaluate(() => rvPage('step-2', 4)); await page.click('#btn-step2-next'); await page.waitForTimeout(400); });
    await safe('standings', async () => { await page.evaluate(() => viewDashboard()); });
    await safe('live side bet', async () => { await page.evaluate(() => { typeof openLiveSideBet === 'function' && openLiveSideBet(); }); });
    for (const [name, fn] of [['players', 'openPlayersScreen'], ['money', 'openMoneyScreen'], ['whos playing', 'openWhosPlaying'], ['tees', 'openTeesEditor'], ['sign-up', 'openSignupModal'], ['group text', "() => openGroupText('all')"], ['change pin', 'changeAdminPin'], ['add course', "() => showScreen('step-add-course')"], ['alerts', "() => openAlertsScreen('step-home')"], ['archive', 'viewArchiveList']]) {
      await safe(name, async () => { await page.evaluate(f => { document.querySelectorAll('.modal-overlay.active').forEach(m => m.classList.remove('active')); let fn = eval(f); fn(); }, fn); });
    }
    await safe('player edit', async () => { await page.evaluate(() => { openPlayersScreen(); let b = document.querySelector('#step-players .player-row, #step-players button.list-row, #step-players [onclick*="editPlayer"]'); b && b.click(); }); });
    await safe('all pop-ups', async () => { await page.evaluate(() => document.querySelectorAll('.modal-overlay').forEach(m => m.classList.add('active'))); });
    await page.close();
  }
  console.log([...found.entries()].map(([k, v]) => `${k}   [first seen: ${v}]`).sort().join('\n') || 'NONE');
  console.log('TOTAL', found.size);
  await browser.close();
  process.exit(found.size ? 1 : 0);
})();
