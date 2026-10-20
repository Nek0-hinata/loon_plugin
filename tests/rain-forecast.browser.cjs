// Optional: install Playwright + Chromium, then run this file. Unit tests do not require them.
// --live uses real Open-Meteo and Windy; otherwise all weather requests are mocked.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { X509Certificate, createHash } = require('node:crypto');
const { render } = require('../scripts/Rain_Forecast.js');
const live = process.argv.includes('--live');
const pageURL = 'https://raw.githubusercontent.com/Nek0-hinata/loon_plugin/main/web/Rain_Forecast.html';
const html = fs.readFileSync(path.join(__dirname, '../web/Rain_Forecast.html'), 'utf8');
const output = render({ url: pageURL }, { status: 200, body: html, headers: {} }, {});

function forecast(latitude) {
  const start = Math.floor(Date.now() / 3600000) * 3600;
  const rain = Number(latitude) < 35 ? 7 : 1;
  return { timezone: 'Asia/Shanghai', hourly_units: { time: 'unixtime', precipitation: 'mm', precipitation_probability: '%' },
    hourly: { time: Array.from({ length: 49 }, (_, i) => start + i * 3600), precipitation: Array(49).fill(rain), precipitation_probability: Array(49).fill(60) } };
}

(async () => {
  const args = ['--no-sandbox', '--disable-dev-shm-usage'];
  // Trust only the provided environment proxy CA's public key for this test browser.
  // No global ignoreHTTPSErrors option or production TLS setting is changed.
  if (live && process.env.NODE_EXTRA_CA_CERTS && fs.existsSync(process.env.NODE_EXTRA_CA_CERTS)) {
    const certificate = new X509Certificate(fs.readFileSync(process.env.NODE_EXTRA_CA_CERTS));
    const pin = createHash('sha256').update(certificate.publicKey.export({ type: 'spki', format: 'der' })).digest('base64');
    args.push('--ignore-certificate-errors-spki-list=' + pin);
  }
  const browser = await chromium.launch({ executablePath: process.env.RAIN_CHROMIUM_PATH || '/usr/bin/chromium', headless: true,
    proxy: live && process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY } : undefined, args });
  const checks = [];
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true,
      geolocation: { latitude: 30.27, longitude: 120.15 }, permissions: ['geolocation'] });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.route(pageURL, route => route.fulfill({ status: 200, headers: output.headers, body: output.body }));
    let failForecast = false, delayBeijing = false;
    if (!live) {
      await page.route('https://embed.windy.com/**', route => route.fulfill({ contentType: 'text/html', body: '<html><body>Windy fixture: forecast timeline</body></html>' }));
      await page.route('https://api.open-meteo.com/**', async route => {
        const latitude = new URL(route.request().url()).searchParams.get('latitude');
        if (delayBeijing && Number(latitude) > 35) await new Promise(resolve => setTimeout(resolve, 600));
        try { await route.fulfill({ status: failForecast ? 503 : 200, contentType: 'application/json', body: JSON.stringify(forecast(latitude)) }); }
        catch (_) { /* A deliberate location change can cancel the prior request. */ }
      });
      await page.route('https://geocoding-api.open-meteo.com/**', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ results: [{ name: '上海<img src=x onerror=alert(1)>', country: '中国', latitude: 31.23, longitude: 121.47 }] }) }));
      await page.addInitScript(() => {
        window.geoCalls = 0;
        const original = navigator.geolocation.getCurrentPosition.bind(navigator.geolocation);
        navigator.geolocation.getCurrentPosition = (...args) => { window.geoCalls++; return original(...args); };
      });
    }
    await page.goto(pageURL, { waitUntil: 'domcontentloaded' });
    await page.locator('#forecast-content:not(.hidden)').waitFor({ timeout: 30000 });
    assert.equal(await page.locator('#hourly-table tr').count(), 48);
    assert.ok((await page.locator('#forecast-status').innerText()) === '');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    checks.push('390px page and 48 future hourly intervals render');
    await page.locator('#range24').click(); assert.equal(await page.locator('#hourly-table tr').count(), 24);
    checks.push('24/48 interval switch works');
    if (!live) {
      assert.equal(await page.evaluate(() => window.geoCalls), 0);
      await page.locator('#city').fill('上海'); await page.locator('#search-button').click();
      await page.locator('#search-results button').first().waitFor();
      assert.equal(await page.locator('#search-results img').count(), 0);
      await page.locator('#search-results button').first().click();
      await page.waitForFunction(() => document.querySelector('#total6').textContent === '42.0 mm');
      assert.match(await page.locator('#location-label').innerText(), /上海<img/);
      assert.equal(new URL(await page.locator('#rain-map').getAttribute('src')).searchParams.get('lat'), '31.23');
      checks.push('city search updates both sources and treats source text as text');
      failForecast = true;
      await page.locator('#refresh').click();
      await page.waitForFunction(() => document.querySelector('#forecast-status').textContent.includes('刷新失败'));
      assert.equal(await page.locator('#hourly-table tr').count(), 24);
      checks.push('refresh failure retains only same-location data with a visible error');
      await page.locator('#coordinate-form').evaluate(form => { form.closest('details').open = true; });
      await page.locator('#latitude').fill('22.54'); await page.locator('#longitude').fill('114.06');
      await page.locator('#coordinate-form button').click();
      await page.waitForFunction(() => document.querySelector('#forecast-status').textContent.includes('预报暂不可用'));
      assert.equal(await page.locator('#forecast-content').evaluate(el => el.classList.contains('hidden')), true);
      checks.push('failed new-location request does not display old-location data');
      failForecast = false;
      await page.locator('#locate').click();
      await page.waitForFunction(() => document.querySelector('#location-label').textContent.includes('我的位置'));
      await page.waitForFunction(() => !document.querySelector('#forecast-content').classList.contains('hidden'));
      assert.equal(await page.evaluate(() => window.geoCalls), 1);
      checks.push('geolocation runs only after an explicit tap');
      await page.evaluate(() => localStorage.clear());
      delayBeijing = true;
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.locator('#coordinate-form').evaluate(form => { form.closest('details').open = true; });
      await page.locator('#latitude').fill('31.23'); await page.locator('#longitude').fill('121.47');
      await page.locator('#coordinate-form button').click();
      await page.waitForFunction(() => document.querySelector('#total6').textContent === '42.0 mm');
      await page.waitForTimeout(800);
      assert.equal(await page.locator('#total6').innerText(), '42.0 mm');
      checks.push('a late previous-location response cannot overwrite the current place');
    } else {
      const frame = page.frames().find(f => f.url().startsWith('https://embed.windy.com/'));
      assert.ok(frame);
      await frame.locator('.leaflet-tile-loaded').first().waitFor({ state: 'visible', timeout: 30000 });
      await frame.locator('#playpause').waitFor({ state: 'visible', timeout: 30000 });
      await frame.waitForFunction(() => document.querySelector('.main-timecode .box')?.textContent?.trim(), null, { timeout: 15000 });
      // Windy's lazy-loaded controller becomes visible before its event handlers settle.
      await page.waitForTimeout(2000);
      const initialTime = await frame.evaluate(() => W.store.get('timestamp'));
      await frame.locator('#playpause').click();
      await frame.waitForFunction(() => W.store.get('animation') === true, null, { timeout: 5000 });
      await frame.waitForFunction(initial => W.store.get('timestamp') > initial + 3600000, initialTime, { timeout: 15000 });
      await frame.locator('#playpause').click();
      await page.waitForTimeout(3000);
      const text = await frame.locator('body').innerText();
      assert.match(text, /Rain|rain|雨|mm/);
      checks.push('real Windy map loaded and its play control advanced the forecast by over one hour');
      checks.push('real Open-Meteo API returned 48 future intervals');
    }
    await page.screenshot({ path: '/tmp/rain-forecast-' + (live ? 'live' : 'mock') + '-mobile.png', fullPage: true });
    await page.setViewportSize({ width: 1280, height: 900 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.screenshot({ path: '/tmp/rain-forecast-' + (live ? 'live' : 'mock') + '-desktop.png', fullPage: true });
    assert.deepEqual(errors, []);
    checks.push('desktop fits and page has no uncaught JavaScript errors');
    console.log(JSON.stringify({ mode: live ? 'live' : 'mock', passed: checks }, null, 2));
    await context.close();
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
