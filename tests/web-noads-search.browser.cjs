// Offline browser checks: reduced public search markup and floating-theme behavior, no media or network.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium, devices } = require('playwright');
const { handle } = require('../scripts/Web_NoAds.js');
const plugin = fs.readFileSync(path.join(__dirname, '../plugins/Web_NoAds.lpx'), 'utf8');
const requestRules = plugin.split('[Script]')[1].split('[Mitm]')[0].split(/\r?\n/)
    .filter(line => line.startsWith('http-request ')).map(line => new RegExp(line.split(/\s+/)[1]));

const form = (id, floating = false) => `<form id="${id}" role="search" method="get" action="https://www.4khd.com/"
 class="wp-block-search ${floating ? 'is-style-floating-white-search' : ''}">
 <label for="${id}-input">Search</label><div class="wp-block-search__inside-wrapper">
 <input id="${id}-input" type="search" name="s" required><button type="submit">Search</button></div></form>`;

function fixture(theme) {
    // The header input is hidden by the theme. Its button needs a working script to open a clone.
    return '<!doctype html><html><head><style>' +
        '.is-style-floating-white-search input{display:none}.fr-floating-search-block{display:none}' +
        '.fr-floating-search-block.fr-floatsearch-active{display:block}header{height:60px}' +
        '</style></head><body><header>' + form('header', true) + '</header>' + form('ordinary') +
        (theme ? `<script>
            const source = document.querySelector('.is-style-floating-white-search');
            const panel = document.createElement('div'), copy = source.cloneNode(true);
            copy.classList.remove('is-style-floating-white-search');
            panel.className = 'fr-floating-search-block'; panel.appendChild(copy); document.body.appendChild(panel);
            source.querySelector('button').addEventListener('click', event => {
                event.preventDefault(); panel.classList.toggle('fr-floatsearch-active');
            });
        </script>` : '') + '</body></html>';
}

async function main() {
    const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
        headless: true, args: ['--no-sandbox'] });
    let passed = 0;
    async function scenario(name, options, check) {
        const { mobile = true, theme = true, enabled = true } = options;
        const context = await browser.newContext(mobile ? devices['iPhone 13'] : { viewport: { width: 1280, height: 900 } });
        try {
            const page = await context.newPage(), errors = [], redirects = [], navigations = [];
            page.setDefaultTimeout(5000);
            page.on('pageerror', error => errors.push(error.message));
            await page.route('**/*', async route => {
                const request = route.request();
                if (!request.isNavigationRequest()) return route.abort();
                const url = new URL(request.url());
                navigations.push(request.url());
                const result = enabled && requestRules.some(rule => rule.test(request.url())) ?
                    handle({ url: request.url(), method: request.method() }, null, { fourkhd: true }) : {};
                if (result.response) {
                    redirects.push(result.response.headers.Location);
                    return route.fulfill({ status: result.response.status, headers: result.response.headers, body: result.response.body });
                }
                const raw = url.pathname.startsWith('/search/') ? '<html><head></head><body>Search results</body></html>' : fixture(theme);
                const response = handle({ url: request.url() }, { status: 200, headers: { 'content-type': 'text/html' }, body: raw }, { fourkhd: enabled });
                return route.fulfill({ status: 200, contentType: 'text/html', body: response.body || raw });
            });
            await page.goto('https://www.4khd.com/', { waitUntil: 'load' });
            await check({ page, redirects, navigations });
            assert.deepEqual(errors, [], name);
            passed++;
            console.log('PASS ' + name);
        } finally { await context.close(); }
    }
    try {
        for (const theme of [true, false]) {
            for (const enter of [false, true]) {
                await scenario(`mobile ${theme ? 'theme' : 'fallback'} search via ${enter ? 'Enter' : 'button'}`, { theme }, async ({ page, redirects }) => {
                    await page.locator('header #header button').click();
                    const panel = page.locator(theme ? '.fr-floating-search-block' : '[data-loon-4khd-search]');
                    await panel.waitFor({ state: 'visible' });
                    assert.equal(await page.locator('[data-loon-4khd-search]').count(), theme ? 0 : 1);
                    const term = enter ? '写真 cosplay + test?#' : 'Pure Media';
                    await panel.locator('input[name=s]').fill(term);
                    const destination = 'https://www.4khd.com/search/' + encodeURIComponent(term);
                    await Promise.all([page.waitForURL(destination), enter ? panel.locator('input[name=s]').press('Enter') : panel.locator('button').click()]);
                    assert.equal(page.url(), destination);
                    // Submission avoids both the old worker's lossy ?s= branch and a server redirect.
                    assert.deepEqual(redirects, []);
                });
            }
        }
        await scenario('fallback focus, validation, closing and reopening', { theme: false }, async ({ page, navigations }) => {
            await page.locator('header #header button').click();
            const panel = page.locator('[data-loon-4khd-search]');
            assert.equal(await panel.locator('input').evaluate(input => input === document.activeElement), true);
            await panel.locator('button').click();
            assert.equal(navigations.length, 1);
            await panel.locator('input').fill('draft');
            await panel.locator('input').press('Escape');
            await panel.waitFor({ state: 'hidden' });
            await page.locator('header #header button').click();
            assert.equal(await panel.locator('input').inputValue(), 'draft');
            assert.equal(await page.locator('[data-loon-4khd-search]').count(), 1);
            await page.mouse.click(5, 500);
            await panel.waitFor({ state: 'hidden' });
        });
        await scenario('desktop form preserves successful controls and submitter', { mobile: false }, async ({ page, redirects }) => {
            await page.locator('#ordinary').evaluate(form => {
                for (const [name, value] of [['paged', '2'], ['lang', 'zh'], ['filter', 'x&y']]) {
                    const input = document.createElement('input'); input.type = 'hidden'; input.name = name; input.value = value; form.appendChild(input);
                }
                form.querySelector('button').name = 'search_button'; form.querySelector('button').value = 'go';
                const unused = document.createElement('input'); unused.name = 'disabled'; unused.value = 'never'; unused.disabled = true; form.appendChild(unused);
            });
            await page.locator('#ordinary input[name=s]').fill('cat & dog');
            const destination = 'https://www.4khd.com/search/cat%20%26%20dog/page/2/?lang=zh&filter=x%26y&search_button=go';
            await Promise.all([page.waitForURL(destination), page.locator('#ordinary button').click()]);
            assert.equal(page.url(), destination);
            assert.deepEqual(redirects, []);
        });
        await scenario('browser keeps custom handlers, POST, external targets and non-search forms', {}, async ({ page }) => {
            const results = await page.evaluate(() => {
                const results = [];
                for (const variant of ['post', 'external', 'blank', 'button-post', 'button-external', 'button-blank', 'unrelated', 'prevented']) {
                    const form = document.querySelector('#ordinary').cloneNode(true);
                    const button = form.querySelector('button');
                    form.querySelector('input').value = 'test';
                    if (variant === 'post') form.method = 'post';
                    if (variant === 'external') form.action = 'https://example.org/';
                    if (variant === 'blank') form.target = '_blank';
                    if (variant === 'button-post') button.setAttribute('formmethod', 'post');
                    if (variant === 'button-external') button.setAttribute('formaction', 'https://example.org/');
                    if (variant === 'button-blank') button.setAttribute('formtarget', '_blank');
                    if (variant === 'unrelated') form.removeAttribute('role');
                    let called = 0;
                    form.addEventListener('submit', event => { called++; if (variant === 'prevented') event.preventDefault(); });
                    document.body.appendChild(form);
                    const event = new SubmitEvent('submit', { bubbles: true, cancelable: true, submitter: button });
                    form.dispatchEvent(event);
                    results.push({ variant, called, prevented: event.defaultPrevented });
                    form.remove();
                }
                return results;
            });
            assert.deepEqual(results.map(result => result.called), [1, 1, 1, 1, 1, 1, 1, 1]);
            assert.deepEqual(results.map(result => result.prevented), [false, false, false, false, false, false, false, true]);
            assert.equal(page.url(), 'https://www.4khd.com/');
        });
        await scenario('existing query bookmarks retain page number through request redirect', {}, async ({ page, redirects }) => {
            await page.goto('https://www.4khd.com/?s=cosplay&paged=2');
            assert.equal(page.url(), 'https://www.4khd.com/search/cosplay/page/2/');
            assert.deepEqual(redirects, [page.url()]);
        });
        await scenario('disabled switch leaves original form submission untouched', { enabled: false }, async ({ page, redirects }) => {
            await page.locator('#ordinary input[name=s]').fill('Pure Media');
            await Promise.all([page.waitForURL('**/?s=Pure+Media'), page.locator('#ordinary button').click()]);
            assert.equal(page.url(), 'https://www.4khd.com/?s=Pure+Media');
            assert.deepEqual(redirects, []);
            assert.equal(await page.locator('[data-loon-4khd-search]').count(), 0);
        });
        console.log(`${passed} offline browser scenarios passed`);
    } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
