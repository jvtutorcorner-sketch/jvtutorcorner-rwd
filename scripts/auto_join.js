const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

(async () => {
  const outDir = path.resolve(process.cwd(), 'automation-output');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir);

  const harPath = path.join(outDir, 'playwright-network.har');
  const logsPath = path.join(outDir, 'console-logs.json');
  const shotPath = path.join(outDir, 'auto_join.png');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ recordHar: { path: harPath } });
  const page = await context.newPage();

  const logs = [];
  page.on('console', (msg) => {
    try { logs.push({ type: msg.type(), text: msg.text(), location: msg.location() }); } catch { }
  });
  page.on('pageerror', (err) => logs.push({ type: 'pageerror', text: String(err) }));
  page.on('requestfailed', (req) => logs.push({ type: 'requestfailed', url: req.url(), status: req.failure()?.errorText }));

  try {
    const url = process.argv[2] || 'http://localhost:3000/classroom?courseId=c1';
    console.log('Navigating to', url);
    await page.goto(url, { waitUntil: 'networkidle' });

    // wait for Join button (text match)
    let joined = false;
    try {
      const joinSelector = 'text=Join';
      await page.waitForSelector(joinSelector, { timeout: 5000 });
      await page.click(joinSelector);
      logs.push({ type: 'info', text: 'Clicked Join button' });
      // wait some time for initialization
      await page.waitForTimeout(7000);
      joined = true;
    } catch (e) {
      logs.push({ type: 'warn', text: 'Join button not found or click failed: ' + String(e) });
    }

    // capture screenshot and page HTML
    await page.screenshot({ path: shotPath, fullPage: true });
    const html = await page.content();
    fs.writeFileSync(path.join(outDir, 'page.html'), html, 'utf8');

    logs.push({ type: 'info', text: `Joined: ${joined}` });
  } catch (err) {
    console.error('Automation error', err);
    logs.push({ type: 'error', text: String(err) });
  } finally {
    try { await context.close(); } catch {}
    try { await browser.close(); } catch {}
    fs.writeFileSync(logsPath, JSON.stringify(logs, null, 2), 'utf8');
    console.log('Artifacts saved to', outDir);
    console.log('Files:', fs.readdirSync(outDir));
  }
})();
