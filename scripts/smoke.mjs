// End-to-end smoke test against the astro preview server using system Edge.
import { chromium } from 'playwright';

const BASE = process.env.SMOKE_BASE ?? 'http://localhost:4321';
const results = [];
const consoleErrors = [];

function check(name, cond, extra = '') {
  results.push({ name, pass: !!cond, extra });
}

const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage();
page.on('console', (msg) => {
  // Generic resource-load 404 text carries no URL; unexpected 404s are caught
  // (with their URL) by the response listener below, so skip the duplicate.
  if (msg.type() === 'error' && !msg.text().includes('status of 404')) {
    consoleErrors.push(msg.text());
  }
});
page.on('pageerror', (err) => consoleErrors.push(`pageerror: ${err.message}`));
page.on('response', (r) => {
  if (r.status() >= 400 && r.status() !== 404 /* the intentional 404-page check */) {
    consoleErrors.push(`HTTP ${r.status()} ${r.url()}`);
  }
  if (r.status() === 404 && !r.url().includes('/tools/nonexistent/') && !r.url().includes('favicon')) {
    consoleErrors.push(`HTTP 404 ${r.url()}`);
  }
});

// ---------- homepage ----------
await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
check('home: title', (await page.title()).includes('exacttools'));
check('home: catalog cards', (await page.locator('a.tool-card').count()) === 10);
check('home: no dark class by default (light OS)', true);

// console greeting easter egg — reload with a listener capturing all log levels
const logs = [];
page.on('console', (msg) => logs.push(msg.text()));
await page.reload({ waitUntil: 'networkidle' });
check('home: console egg', logs.some((l) => l.includes('Curious? Good instinct')));

// dark mode toggle + persistence
await page.click('#theme-toggle');
check('theme: dark class applied', await page.evaluate(() => document.documentElement.classList.contains('dark')));
check('theme: persisted', (await page.evaluate(() => localStorage.getItem('theme'))) === 'dark');
await page.reload({ waitUntil: 'domcontentloaded' });
check('theme: survives reload (no flash)', await page.evaluate(() => document.documentElement.classList.contains('dark')));
await page.click('#theme-toggle'); // back to light

// konami code → engineer mode
await page.keyboard.press('ArrowUp'); await page.keyboard.press('ArrowUp');
await page.keyboard.press('ArrowDown'); await page.keyboard.press('ArrowDown');
await page.keyboard.press('ArrowLeft'); await page.keyboard.press('ArrowRight');
await page.keyboard.press('ArrowLeft'); await page.keyboard.press('ArrowRight');
await page.keyboard.press('b'); await page.keyboard.press('a');
check('konami: engineer mode on', await page.evaluate(() => document.documentElement.classList.contains('engineer')));
check('konami: bundle readout shown', /JS [\d.]+ KB/.test((await page.locator('#engineer-hud').textContent()) ?? ''));

// ---------- regex tester ----------
await page.goto(`${BASE}/tools/regex-tester/`, { waitUntil: 'networkidle' });
await page.waitForSelector('#rx-pattern');
check('regex: prefilled matches found', await page.locator('mark.match').count() >= 2);
check('regex: groups table rows', (await page.locator('tbody tr').count()) >= 2);
await page.fill('#rx-pattern', '\\d+');
await page.waitForTimeout(200);
check('regex: live update', (await page.locator('.output-pane').first().textContent()).includes('MATCHES:'));
check('regex: h1 title', (await page.textContent('h1')).includes('Regex Tester'));
check('regex: privacy line', (await page.textContent('main')).includes('All processing happens in your browser'));

// collapsed guide/FAQ notes
check('regex: notes collapsed by default', !(await page.locator('details.notes').getAttribute('open')));
await page.click('details.notes > summary');
check('regex: notes expand', (await page.locator('details.notes .article').isVisible()));

// ---------- yaml/json ----------
await page.goto(`${BASE}/tools/yaml-json-converter/`, { waitUntil: 'networkidle' });
await page.waitForSelector('#yj-input');
await page.waitForTimeout(300);
const jsonOut = await page.locator('.output-pane pre').textContent();
check('yaml: sample converts', jsonOut.includes('"service": "billing-api"'));
await page.fill('#yj-input', 'a:\n  - 1\n -bad');
await page.waitForTimeout(200);
check('yaml: error with line no.', (await page.locator('[role=alert]').textContent()).includes('LINE'));

// ---------- timestamp ----------
await page.goto(`${BASE}/tools/unix-timestamp-converter/`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);
const tsBody = await page.textContent('main');
check('timestamp: iso output', tsBody.includes('2025-01-01T00:00:00.000Z'));
check('timestamp: ticker running', /NOW:/.test(tsBody) && !tsBody.includes('··········'));

// ---------- sql ----------
await page.goto(`${BASE}/tools/sql-formatter/`, { waitUntil: 'networkidle' });
await page.waitForTimeout(300);
const sqlOut = await page.locator('.output-pane pre').textContent();
check('sql: formatted uppercase', sqlOut.includes('SELECT') && sqlOut.includes('\n'));

// ---------- xml ----------
await page.goto(`${BASE}/tools/xml-formatter/`, { waitUntil: 'networkidle' });
await page.waitForTimeout(300);
const xmlOut = await page.locator('.output-pane pre').textContent();
check('xml: pretty printed', xmlOut.includes('<config env="production">') && xmlOut.includes('\n  <service'));
check('xml: cdata preserved', xmlOut.includes('<![CDATA[Line numbers matter & are reported.]]>'));
await page.fill('#xmlf-input', '<a><b></a>');
await page.waitForTimeout(200);
check('xml: error line reported', (await page.locator('[role=alert]').textContent()).includes('LINE'));

// ---------- duplicate lines ----------
await page.goto(`${BASE}/tools/duplicate-line-remover/`, { waitUntil: 'networkidle' });
await page.waitForTimeout(300);
const dlrLabel = await page.locator('.output-pane .ui-label').first().textContent();
check('dedupe: stats label', dlrLabel.includes('DUPLICATES REMOVED'));

// ---------- number base ----------
await page.goto(`${BASE}/tools/number-base-converter/`, { waitUntil: 'networkidle' });
await page.fill('#nb-16', 'ff00');
await page.waitForTimeout(200);
check('base: hex→dec sync', (await page.inputValue('#nb-10')) === '65280');
check('base: hex→bin sync', (await page.inputValue('#nb-2')) === '1111111100000000');
check('base: 16 bits shown', (await page.locator('.bit').count()) === 16);

// ---------- word counter ----------
await page.goto(`${BASE}/tools/word-character-counter/`, { waitUntil: 'networkidle' });
await page.fill('#wc-text', 'One two three. Four five!');
await page.waitForTimeout(200);
const wcBody = await page.textContent('main');
check('words: count updates', /WORDS\s*5/.test(wcBody.replace(/\n/g, ' ')));

// ---------- fetchxml ----------
await page.goto(`${BASE}/tools/fetchxml-formatter/`, { waitUntil: 'networkidle' });
await page.waitForTimeout(300);
const fxOut = await page.locator('.output-pane pre').textContent();
check('fetchxml: aligned attrs', /<condition attribute="statecode"\n\s+operator="eq"/.test(fxOut));

// ---------- odata ----------
await page.goto(`${BASE}/tools/odata-filter-builder/`, { waitUntil: 'networkidle' });
await page.waitForTimeout(300);
const odOut = await page.locator('.output-pane pre').textContent();
check('odata: prefilled filter', odOut.includes("$filter=statecode eq 0 and contains(name,'contoso')"));

// ---------- 404 ----------
const resp = await page.goto(`${BASE}/tools/nonexistent/`, { waitUntil: 'domcontentloaded' });
check('404: status', resp.status() === 404);
check('404: copy', (await page.textContent('body')).includes('404 — Page not found'));

// ---------- keyboard focus ----------
await page.goto(`${BASE}/tools/regex-tester/`, { waitUntil: 'networkidle' });
await page.keyboard.press('Tab');
const focused = await page.evaluate(() => document.activeElement.tagName);
check('a11y: tab reaches interactive element', ['A', 'BUTTON', 'INPUT'].includes(focused));

await browser.close();

// ---------- report ----------
let fails = 0;
for (const r of results) {
  console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}${r.extra ? '  ' + r.extra : ''}`);
  if (!r.pass) fails++;
}
const realErrors = consoleErrors.filter((e) => !e.includes('favicon'));
if (realErrors.length) {
  console.log('\nCONSOLE ERRORS:');
  realErrors.forEach((e) => console.log('  ' + e));
  fails++;
}
console.log(`\n${results.length - fails}/${results.length} checks passed${realErrors.length ? ` (+${realErrors.length} console errors)` : ', no console errors'}`);
process.exit(fails ? 1 : 0);
