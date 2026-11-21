// Courses & tees: change a course's holes, delete a course you added, put a changed built-in course back to its card
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs = require('fs');
const stub = fs.readFileSync(__dirname + '/stub.js', 'utf8');
const html = fs.readFileSync(process.argv[2] || __dirname + '/../index.html', 'utf8');
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 }); page.setDefaultTimeout(4000);
  page.on('pageerror', e => { console.log('PAGE ERROR', e.message); fails++; }); page.on('dialog', d => d.accept());
  await page.route('**/*', r => { const u = r.request().url();
    if (u.includes('gstatic')) return r.fulfill({ contentType: 'text/javascript', body: u.includes('app-compat') ? stub : '' });
    if (u.startsWith('http://app.test/')) return r.fulfill({ contentType: 'text/html', body: html });
    return r.abort(); });
  await page.addInitScript(() => { window.__docsInit = {}; });
  await page.goto('http://app.test/?beta=0'); await page.waitForTimeout(400);
  const pars = () => page.evaluate(() => allAvailableCourses[document.getElementById('course-selector').value].pars.join(''));
  // add a course
  await page.evaluate(() => openTeesEditor());
  await page.click('#course-add-btn');
  await page.fill('#new-course-name', 'Test Links');
  for (let i = 1; i <= 18; i++) await page.fill(`#custom-par-${i}`, '4');
  await page.click('#step-add-course .btn-primary');
  const key = await page.evaluate(() => document.getElementById('course-selector').value);
  ok(key === 'custom_testlinks', 'course added and picked: ' + key);
  // change its holes
  await page.evaluate(() => openTeesEditor());
  ok(await page.isVisible('#course-edit-btn') && await page.isVisible('#course-del-btn'), 'Courses & tees shows Change the holes and Delete for a course you added');
  await page.screenshot({ path: __dirname + '/shots/course-manage.png' });
  await page.click('#course-edit-btn');
  ok(await page.inputValue('#new-course-name') === 'Test Links' && await page.inputValue('#custom-par-1') === '4', 'Change the holes opens filled in');
  await page.fill('#custom-par-2', '5'); await page.fill('#custom-par-3', '3');
  await page.screenshot({ path: __dirname + '/shots/course-edit.png' });
  await page.click('#step-add-course .btn-primary');
  ok(await pars() === '453444444444444444' && await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('customCourses'))).length === 1), 'holes changed, no second copy made: ' + await pars());
  // delete it
  await page.evaluate(() => openTeesEditor());
  await page.click('#course-del-btn');
  ok(await page.evaluate(() => !allAvailableCourses.custom_testlinks && ![...document.querySelectorAll('#course-selector option')].some(o => o.value === 'custom_testlinks')), 'course deleted from the list');
  // a built-in course: change the holes, then back to the card
  await page.evaluate(() => { let s = document.getElementById('course-selector'); s.value = 'tennessee_national'; s.dispatchEvent(new Event('change')); openTeesEditor(); });
  ok(!(await page.isVisible('#course-del-btn')), 'built-in course untouched: no delete button');
  await page.click('#course-edit-btn');
  ok(await page.inputValue('#new-course-name') === 'Tennessee National (Loudon, TN)', 'built-in course opens with its own name');
  await page.fill('#custom-par-1', '5'); await page.click('#step-add-course .btn-primary');
  ok(await pars() === '553544344453454434' && await page.evaluate(() => allAvailableCourses.tennessee_national.name === 'Tennessee National (Loudon, TN)'), 'built-in course changed, same name, still one entry: ' + await pars());
  await page.evaluate(() => openTeesEditor());
  ok((await page.innerText('#course-del-btn')).includes('original card'), 'changed built-in course offers Use the original card');
  await page.click('#course-del-btn');
  ok(await pars() === '453544344453454434', 'back to the original card: ' + await pars());
  await browser.close();
  console.log(fails ? `${fails} FAILED` : 'ALL PASS'); process.exit(fails ? 1 : 0);
})();
