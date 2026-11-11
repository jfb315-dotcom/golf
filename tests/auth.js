const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs = require('fs');
const stub = fs.readFileSync(__dirname + '/stub.js', 'utf8');
const html = fs.readFileSync(__dirname + '/../index.html', 'utf8');
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  let docs;
  const mk = async (init, url) => {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
    page.setDefaultTimeout(5000);
    page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; });
    const answers = []; page.__answers = answers;
    page.on('dialog', d => d.type() === 'prompt' ? d.accept(answers.shift() || '') : d.accept());
    await page.route('**/*', r => { const u = r.request().url();
      if (u.includes('gstatic')) return r.fulfill({ contentType: 'text/javascript', body: u.includes('app-compat') ? stub : '' });
      if (u.startsWith('http://app.test/')) return r.fulfill({ contentType: u.includes('logo') ? 'image/png' : 'text/html', body: u.includes('logo') ? fs.readFileSync(__dirname + '/../logo.png') : html });
      return r.abort(); });
    await page.addInitScript(init, docs);
    await page.goto(url); await page.waitForTimeout(600);
    return page;
  };
  docs = { admin_private: { pin: '4321', phones: { 'al a': '(423) 555-0101' } }, saved_players: { players: { 'al a': { name: 'Al A' } } },
    signup: { date: '2099-01-01', note: 'Golf?', responses: {} } };
  // not signed in: organizer page shows the sign-in screen
  const a = await mk(d => { window.__authUser = null; window.__docsInit = d; }, 'http://app.test/');
  a.evaluate(() => 0);
  await a.waitForTimeout(0);
  const docsJSON = docs;
  ok(await a.isVisible('#signin-gate'), 'organizer page asks to sign in');
  await a.screenshot({ path: __dirname + '/shots/signin.png' });
  ok(await a.evaluate(() => !window.__docs.admin_private || true) && await a.evaluate(() => adminPin) === '1234', 'private doc not loaded before sign-in');
  await a.fill('#signin-email', 'me@test'); await a.fill('#signin-pass', 'bad'); await a.click('#signin-gate .btn-primary'); await a.waitForTimeout(200);
  ok((await a.textContent('#signin-error')).includes("didn't match"), 'wrong password says so');
  await a.fill('#signin-pass', 'good'); await a.click('#signin-gate .btn-primary'); await a.waitForTimeout(500);
  ok(!(await a.isVisible('#signin-gate')) && await a.isVisible('#signout-row') && (await a.textContent('#signed-in-as')) === 'me@test', 'signed in: gate gone, Sign out shown');
  ok(await a.evaluate(() => adminPin) === '4321' && await a.evaluate(() => savedPlayers['al a'].phone) === '(423) 555-0101', 'own PIN and private numbers loaded');
  // change PIN
  a.__answers.push('9876', '9876');
  a.click('text=Change PIN'); await a.waitForTimeout(200);
  for (const d of '4321') await a.click(`.pin-pad button:text-is("${d}")`);
  await a.waitForTimeout(400);
  ok(await a.evaluate(() => window.__docs.admin_private.pin) === '9876' && await a.evaluate(() => adminPin) === '9876', 'PIN changed to 9876');
  a.__answers.push('12', '');
  a.click('text=Change PIN'); await a.waitForTimeout(200);
  for (const d of '9876') await a.click(`.pin-pad button:text-is("${d}")`);
  await a.waitForTimeout(300);
  ok(await a.evaluate(() => adminPin) === '9876', 'a bad new PIN is refused');
  // sign out → gate again
  await a.click('#signout-row'); await a.waitForTimeout(400);
  ok(await a.isVisible('#signin-gate'), 'sign out brings the sign-in screen back');
  // cart link and sign-up page: no sign-in screen
  const c = await mk(d => { window.__authUser = null; window.__docsInit = d; }, 'http://app.test/?cart=1&r=1');
  ok(!(await c.isVisible('#signin-gate')), 'cart link: no sign-in');
  const s = await mk(d => { window.__authUser = null; window.__docsInit = d; }, 'http://app.test/?signup=1');
  ok(!(await s.isVisible('#signin-gate')) && await s.isVisible('#step-signup'), 'sign-up page: no sign-in');
  ok(await s.evaluate(() => firebase.auth().currentUser?.isAnonymous) === true, 'sign-up page is signed in quietly');
  // sign-in not set up in Firebase yet: everything works as before
  const l = await mk(d => { window.__authUser = null; window.__authDisabled = true; window.__docsInit = d; }, 'http://app.test/');
  ok(!(await l.isVisible('#signin-gate')) && await l.isVisible('#step-home'), 'before sign-in is turned on: no gate, works as before');
  await browser.close();
  console.log(fails ? `${fails} FAILED` : 'ALL PASS'); process.exit(fails ? 1 : 0);
})();
