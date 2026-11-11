const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs = require('fs');
const stub = fs.readFileSync(__dirname + '/stub.js', 'utf8');
const html = fs.readFileSync(__dirname + '/../index.html', 'utf8');
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const pars = Array(18).fill(4);
const mkArc = (id, course) => ({ id, at: id, date: '2026-10-2' + (id % 9), course: { name: course, pars }, roundData: { roundId: id, date: '2026-10-28', course: { name: course, pars }, groups: [], playMode: '18' }, scoresDb: {} });
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const open = async (docs, local) => {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    page.setDefaultTimeout(5000);
    page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
    page.on('dialog', d => d.accept());
    await page.route('**/*', r => { const u = r.request().url();
      if (u.includes('gstatic')) return r.fulfill({ contentType: 'text/javascript', body: u.includes('app-compat') ? stub : '' });
      if (u.startsWith('http://app.test/')) return r.fulfill({ contentType: 'text/html', body: html });
      return r.abort(); });
    await page.addInitScript(([d, l]) => { if (sessionStorage.getItem('x')) return; sessionStorage.setItem('x', 1); window.__docsInit = d; if (l) localStorage.setItem('tournamentArchive', JSON.stringify(l)); }, [docs, local]);
    await page.goto('http://app.test/'); await page.waitForTimeout(500);
    return page;
  };
  const pin = async p => { await p.waitForTimeout(150); for (const d of '1234') await p.click(`.pin-pad button:text-is("${d}")`); await p.waitForTimeout(300); };
  // Desktop: old test rounds only in its own browser
  const desk = await open({}, [mkArc(101, 'Test A'), mkArc(102, 'Test B'), mkArc(103, 'Real Round')]);
  await desk.click('#btn-archive'); await desk.waitForTimeout(400);
  let docs = await desk.evaluate(() => window.__docs);
  ok(Object.keys(docs.archive_index.rounds).length === 3, 'desktop backs up its 3 rounds (what happened before)');
  // Phone: same cloud, no local copies; deletes the two test rounds
  const phone = await open(docs, null);
  await phone.click('#btn-archive'); await phone.waitForTimeout(400);
  ok((await phone.$$('.archive-item')).length === 3, 'phone sees all 3');
  await phone.check('.archive-item:has-text("Test A") .archive-checkbox'); await phone.check('.archive-item:has-text("Test B") .archive-checkbox');
  phone.click('#bulk-delete-btn'); await pin(phone);
  docs = await phone.evaluate(() => window.__docs);
  ok(Object.keys(docs.archive_index.rounds).join() === '103' && docs.archive_index.deleted['101'] && docs.archive_index.deleted['102'], 'phone deletes Test A and B (and remembers they were deleted)');
  // Desktop opens Past rounds again with its old copies still in its browser
  const desk2 = await open(docs, [mkArc(101, 'Test A'), mkArc(102, 'Test B'), mkArc(103, 'Real Round')]);
  await desk2.click('#btn-archive'); await desk2.waitForTimeout(500);
  const rows = await desk2.$$eval('.archive-item', e => e.map(x => x.textContent.replace(/\s+/g, ' ')));
  docs = await desk2.evaluate(() => window.__docs);
  ok(rows.length === 1 && rows[0].includes('Real Round'), 'desktop now shows only the real round: ' + rows.length);
  ok(Object.keys(docs.archive_index.rounds).join() === '103' && !docs.archive_101 && !docs.archive_102, 'deleted rounds are NOT uploaded again');
  ok(await desk2.evaluate(() => JSON.parse(localStorage.getItem('tournamentArchive')).map(a => a.id).join()) === '103', "desktop's own copies of the deleted rounds are gone");
  await browser.close();
  console.log(fails ? `${fails} FAILED` : 'ALL PASS'); process.exit(fails ? 1 : 0);
})();
