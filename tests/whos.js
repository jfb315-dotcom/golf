const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs = require('fs');
const stub = fs.readFileSync(__dirname + '/stub.js', 'utf8');
const html = fs.readFileSync(__dirname + '/../index.html', 'utf8');
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  page.setDefaultTimeout(5000);
  page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
  const msgs = []; page.on('dialog', d => { msgs.push(d.message()); d.type() === 'prompt' ? d.accept('Rain') : d.accept(); });
  await page.route('**/*', r => { const u = r.request().url();
    if (u.includes('gstatic')) return r.fulfill({ contentType: 'text/javascript', body: u.includes('app-compat') ? stub : '' });
    if (u.startsWith('http://app.test/')) return r.fulfill({ contentType: 'text/html', body: html });
    return r.abort(); });
  const today = new Date(); const iso = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
  await page.addInitScript(iso => {
    if (sessionStorage.getItem('seeded')) return; sessionStorage.setItem('seeded', '1');
    const idx = { 'al a': 2, 'bo b': 6, 'cy c': 10, 'di d': 14, 'ed e': 18 };
    const rounds = {};
    Object.entries(idx).forEach(([k, i]) => [1, 2, 3].forEach(n => { rounds[k + n] = { date: '2026-09-0' + n, courseKey: 'cleveland_cc', course: 'Cleveland Country Club', holes: 18, players: { [k]: { name: k, holes: 18, gross: 90, par: 72, diff: i + 2 } } }; }));
    rounds['fy1'] = { date: '2026-09-01', course: 'X', holes: 18, players: { 'fy f': { name: 'Fy F', holes: 18, gross: 95, par: 72, diff: 20 } } }; // one round → ~20
    const players = {};
    ['Al A','Bo B','Cy C','Di D','Ed E','Fy F','Gus G','Hal H','Ike I'].forEach(n => players[n.toLowerCase()] = { name: n, tee: 'White' });
    players['al a'].phone = '(423) 555-0101'; players['bo b'].phone = '423-555-0102';
    players['gus g'].usual = 100; // a score → ~25.2
    players['hal h'].usual = 8;   // a handicap
    window.__docsInit = { saved_players: { players }, player_history: { rounds },
      signup: { date: iso, time: '08:00', course: 'Cleveland Country Club', courseKey: 'cleveland_cc', responses: { 'al a': { name: 'Al A', status: 'in', at: 1 }, 'ike i': { name: 'Ike I', status: 'out', at: 2 }, 'zed new': { name: 'Zed New', status: 'in', at: 3 } } } };
  }, iso);
  await page.goto('http://app.test/'); await page.waitForTimeout(500); await page.evaluate(() => { if (document.getElementById('step-home')?.classList.contains('active')) showScreen('step-1'); });
  await page.selectOption('#course-selector', 'cleveland_cc');
  await page.click('.whos-btn'); await page.waitForTimeout(300);
  ok(await page.isVisible('#step-whos'), "Who's playing opens");
  ok((await page.textContent('#whos-signup-text')).includes('2 in · 1 out'), 'sign-up summary shows 2 in, 1 out');
  const pre = await page.$$eval('.rp-row.on .rp-name', e => e.map(x => x.textContent));
  ok(pre.length === 2 && pre.some(t => t.startsWith('Al A')) && pre.some(t => t.startsWith('Zed New')), 'signed-up players (incl. new Zed) checked: ' + pre);
  const note = n => page.textContent(`.rp-row:has-text("${n}") .rp-note`);
  ok(await note('Fy F') === '~20.0' && await note('Gus G') === '~25.2' && await note('Hal H') === '~8.0' && await note('Al A') === '2.0', 'estimates: 1 round avg, usual score, usual handicap; real index plain');
  for (const n of ['Bo B','Cy C','Di D','Ed E','Fy F','Gus G']) await page.click(`.rp-row:has-text("${n}")`);
  ok((await page.textContent('#whos-count')) === '8 playing' && (await page.textContent('#whos-plan')) === '2 teams of 4', '8 playing → 2 teams of 4');
  await page.click('#whos-size button[data-size="3"]');
  ok((await page.textContent('#whos-plan')).includes('3 teams (3, 3, 2)'), 'teams of 3 → 3,3,2 with blind draw note');
  await page.click('#whos-size button[data-size="4"]');
  await page.screenshot({ path: __dirname + '/shots/whos.png' });
  await page.click('#whos-make'); await page.waitForTimeout(400);
  ok(await page.isVisible('#step-2') && await page.inputValue('#group-count') === '2' && await page.inputValue('#players-per-group') === '4', 'roster: 2 teams of 4');
  const names = await page.evaluate(() => rosterPlayers().map(x => x.name));
  ok(names.length === 8 && names.includes('Zed New'), 'all 8 on the roster');
  const tot = await page.$$eval('.team-total', e => e.map(x => x.textContent));
  console.log('totals', tot);
  ok(tot.length === 2 && tot.every(t => t.includes('~')), 'balanced, totals shown');
  ok(msgs.some(m => m.includes('Zed')), 'Zed counted as average');
  await page.screenshot({ path: __dirname + '/shots/roster-made.png' });
  // try another
  const before = await page.evaluate(() => JSON.stringify(rosterPlayers().map(x => x.g + x.name).sort()));
  await page.click('#try-teams'); await page.waitForTimeout(300);
  const after = await page.evaluate(() => JSON.stringify(rosterPlayers().map(x => x.g + x.name).sort()));
  ok(before !== after, 'Try another gives a different split');
  await page.click('#undo-teams'); await page.waitForTimeout(200);
  ok(await page.evaluate(() => JSON.stringify(rosterPlayers().map(x => x.g + x.name).sort())) === before, 'Undo goes back');
  // swap: team1 #1 with team2 #2
  const a = await page.inputValue('#g1-p1-name'), b = await page.inputValue('#g2-p2-name');
  const aTee = await page.inputValue('#g1-p1-tee');
  await page.click('#g1-p1-name >> xpath=preceding-sibling::button');
  ok((await page.textContent('#swap-hint')).includes('Now tap'), 'first tap picks the player');
  await page.click('#g2-p2-name >> xpath=preceding-sibling::button'); await page.waitForTimeout(200);
  ok(await page.inputValue('#g1-p1-name') === b && await page.inputValue('#g2-p2-name') === a && await page.inputValue('#g2-p2-tee') === aTee, `swapped ${a} ↔ ${b} with tees`);
  await page.click('#undo-teams'); await page.waitForTimeout(100);
  ok(await page.inputValue('#g1-p1-name') === a, 'undo swap');
  await page.click('text=✕ Clear all'); await page.waitForTimeout(150);
  ok(await page.evaluate(() => rosterPlayers().length) === 0 && await page.inputValue('#g1-p1-name') === '' && await page.inputValue('#g1-time') === '08:00', 'Clear all empties the roster (tee times stay)');
  await page.click('#undo-teams'); await page.waitForTimeout(100);
  ok(await page.inputValue('#g1-p1-name') === a, 'Undo brings them back');
  // usual shoots on the player card
  await page.evaluate(() => { switchScreen('step-2', 'step-1'); openPlayersScreen(); });
  await page.click('.player-row:has-text("Ike")');
  await page.fill('#pl-usual', '88'); await page.fill('#pl-phone', '423 555 0109'); await page.screenshot({ path: __dirname + '/shots/player-phone.png' }); await page.click('#player-modal .btn-primary'); await page.waitForTimeout(200);
  ok(await page.evaluate(() => window.__docs.saved_players.players['ike i'].usual === 88 && window.__docs.admin_private.phones['ike i'] === '(423) 555-0109'), 'Usually shoots and mobile number saved');
  // sign-up link: admin creates, a player answers on another phone
  await page.evaluate(() => { switchScreen('step-players', 'step-1'); });
  await page.click('.whos-btn'); await page.waitForTimeout(200);
  await page.click('#step-whos button:has-text("📨 Sign-up link")');
  ok((await page.getAttribute('#su-note-in', 'placeholder')).match(/^Golf \w+day\?$/), 'message suggests "Golf <day>?"');
  await page.fill('#su-note-in', 'Golf Thursday? $20 Nassau');
  await page.click('#signup-modal .btn-primary'); await page.waitForTimeout(200);
  ok(await page.isVisible('#text-modal'), 'invite opens Text the group');
  const picks = await page.$$eval('#text-pick .rp-row', e => e.map(x => [x.querySelector('.rp-name').textContent, x.classList.contains('on'), x.disabled]));
  ok(picks.slice(0, 3).every(p => p[1]) && picks.filter(p => p[1]).map(p => p[0]).join() === 'Al A,Bo B,Ike I' && picks.slice(3).every(p => p[2]), 'checklist: players with numbers first and checked, the rest greyed: ' + JSON.stringify(picks.slice(0, 4)));
  ok((await page.textContent('#text-to')) === '3 selected', '3 selected');
  await page.click('#text-pick .rp-row:has-text("Bo B")');
  ok((await page.textContent('#text-to')) === '2 selected', 'untick Bo → 2 selected');
  await page.screenshot({ path: __dirname + '/shots/text-pick.png' });
  const smsUrl = await page.evaluate(() => groupTextList().map(x => x.phone.replace(/[^\d+]/g, '')).filter(Boolean).join(','));
  ok(smsUrl === '4235550101,4235550109', 'only the checked numbers: ' + smsUrl);
  await page.click('.text-quick button:has-text("None")'); ok((await page.textContent('#text-to')) === 'Nobody selected', 'None clears');
  await page.click('.text-quick button:has-text("Who\'s in")');
  ok(await page.evaluate(() => groupTextList().map(x => x.name).join()) === 'Al A', "Who's in picks only the In players with numbers");

  await page.evaluate(() => shareTextAnotherWay()); await page.waitForTimeout(100);
  const txt = await page.inputValue('#share-text-content');
  ok(txt.includes('?signup=1') && txt.startsWith('⛳ Golf Thursday? $20 Nassau') && txt.includes('Tap In or Out'), 'share text has the link: ' + txt.replace(/\n/g, ' | '));
  ok(Object.keys(await page.evaluate(() => window.__docs.signup.responses)).length === 3, 'same date keeps answers');
  await page.evaluate(() => closeShareModal());
  ok(await page.evaluate(() => !!savedPlayers['zed new']), 'new name from the sign-up becomes a saved player');
  const docs = await page.evaluate(() => window.__docs);
  const p2 = await ctx.newPage();
  p2.on('pageerror', e => { console.log('P2 ERROR', e.message); fails++; });
  const p2msgs = []; p2.on('dialog', d => { p2msgs.push(d.message()); d.type() === 'prompt' ? d.accept('Talked at lunch') : d.accept(); });
  const p2alerts = [];
  await p2.route('**/*', r => { const u = r.request().url();
    if (u.includes('workers.dev')) { try { p2alerts.push(JSON.parse(r.request().postData() || '{}')); } catch (e) {} return r.fulfill({ status: 200, body: '{}' }); }
    if (u.includes('gstatic')) return r.fulfill({ contentType: 'text/javascript', body: u.includes('app-compat') ? stub : '' });
    if (u.startsWith('http://app.test/')) return r.fulfill({ contentType: 'text/html', body: html });
    return r.abort(); });
  await p2.addInitScript(d => { window.__docsInit = JSON.parse(sessionStorage.getItem('docs2') || 'null') || d; }, docs);
  await p2.goto('http://app.test/?signup=1'); await p2.waitForTimeout(500);
  ok(await p2.isVisible('#step-signup') && (await p2.textContent('#su-details')).includes('Cleveland'), 'sign-up page shows the round');
  const rows = await p2.$$eval('.su-row', e => e.map(x => x.querySelector('.su-name').textContent.trim()));
  ok(rows.length === 10 && rows[0].startsWith('Al A') && rows[1].startsWith('Zed New'), 'every player listed with In / Out right away (In first): ' + rows.join(', '));
  ok(await p2.$eval('.su-row:has-text("Al A") button.in', b => b.classList.contains('on')), 'Al shows In');
  await p2.screenshot({ path: __dirname + '/shots/signup-pick.png' });
  await p2.click('.su-row:has-text("Cy C") button.in'); await p2.waitForTimeout(300);
  ok(!p2msgs.length && await p2.evaluate(() => window.__docs.signup.responses['cy c'].status === 'in' && !window.__docs.signup.responses['cy c'].by), 'Cy taps In for himself: no questions');
  ok(p2alerts.length === 1 && p2alerts[0].title === '✅ Cy is in' && p2alerts[0].cart === 'admin' && p2alerts[0].view === 'whos' && /3 in, 1 out$/.test(p2alerts[0].body), 'organizer gets an alert: ' + JSON.stringify(p2alerts[0]));
  ok((await p2.textContent('#su-who')).includes('This phone is Cy C'), 'phone now knows it is Cy');
  // Cy marks Di in too: asks first, with a note
  await p2.click('.su-row:has-text("Di D") button.in'); await p2.waitForTimeout(300);
  ok(p2msgs.some(m => m.includes("You're marking Di D IN") && m.includes('This phone is Cy C')), 'marking someone else asks first');
  let rr = await p2.evaluate(() => window.__docs.signup.responses);
  ok(rr['di d'].status === 'in' && rr['di d'].by === 'Cy C' && rr['di d'].note === 'Talked at lunch', 'saved as put in by Cy with the note');
  ok(p2alerts[1]?.title === '✅ Cy marked Di in' && p2alerts[1].body.startsWith('"Talked at lunch" · '), 'alert says who marked who: ' + JSON.stringify(p2alerts[1]));
  await p2.click('.su-row:has-text("Cy C") button.in'); await p2.waitForTimeout(200);
  ok(p2alerts.length === 2, 'tapping the same answer again sends nothing');
  ok((await p2.textContent('.su-row:has-text("Di D")')).includes('put in by Cy · "Talked at lunch"'), 'list shows who put them in');
  await p2.click('.su-row:has-text("Ed E") button.out'); await p2.waitForTimeout(300);
  ok(await p2.evaluate(() => window.__docs.signup.responses['ed e'].status === 'out'), 'Out works too');
  ok((await p2.textContent('#su-counts')) === '4 in · 2 out', 'counts: ' + await p2.textContent('#su-counts'));
  await p2.screenshot({ path: __dirname + '/shots/signup-list.png', fullPage: true });
  // remembered on this phone; "not you?" to switch
  await p2.evaluate(() => sessionStorage.setItem('docs2', JSON.stringify(window.__docs))); await p2.reload(); await p2.waitForTimeout(500);
  ok((await p2.textContent('#su-who')).includes('This phone is Cy C'), 'remembers who you are');
  await p2.click('#su-who .text-link');
  await p2.click('text=Not on the list? Add your name'); await p2.fill('#su-other', 'New  Guy'); await p2.click('text=Add me · I\'m in'); await p2.waitForTimeout(300);
  const r2 = await p2.evaluate(() => window.__docs.signup.responses);
  ok(r2['cy c'].status === 'in' && r2['new guy'].status === 'in', 'answers saved');
  ok(!(await p2.isVisible('#step-1')) && !(await p2.isVisible('#step-3')), 'sign-up page shows nothing else');
  await p2.screenshot({ path: __dirname + '/shots/signup.png' });
  // admin cancels: link shows cancelled, admin gets a text to everyone who's in

  await page.click('#su-cancel-btn'); await page.waitForTimeout(300);
  ok(await page.evaluate(() => window.__docs.signup.cancelled === true && window.__docs.signup.cancelNote === 'Rain'), 'round cancelled with a reason');
  ok(await page.isVisible('#text-modal') && (await page.inputValue('#text-body')).includes('is cancelled (Rain)'), 'cancel offers a text to everyone who was in');
  await page.click('#text-modal .modal-content > .btn-secondary:has-text("Cancel")');
  const docs2 = await page.evaluate(() => window.__docs);
  await p2.evaluate(d => { sessionStorage.setItem('docs2', JSON.stringify(d)); }, docs2); await p2.reload(); await p2.waitForTimeout(500);
  ok(await p2.isVisible('#su-cancelled') && (await p2.textContent('#su-cancelled')).includes('cancelled · Rain') && !(await p2.isVisible('#su-open')), 'sign-up page shows it is cancelled');
  await p2.screenshot({ path: __dirname + '/shots/signup-cancelled.png' });
  ok((await page.textContent('#whos-signup-text')).includes('Cancelled') && (await page.textContent('#su-cancel-btn')).includes('Un-cancel'), "Who's playing shows Cancelled, can un-cancel");
  // start over
  await page.click('text=↺ Start over'); await page.waitForTimeout(300);
  ok(Object.keys(await page.evaluate(() => window.__docs.signup.responses)).length === 0 && !(await page.evaluate(() => window.__docs.signup.cancelled)), 'Start over clears answers and the cancel');
  ok(await page.isVisible('#text-modal') && (await page.inputValue('#text-body')).includes('?signup=1'), 'and offers to send the link again');
  await browser.close();
  console.log(fails ? `${fails} FAILED` : 'ALL PASS'); process.exit(fails ? 1 : 0);
})();
