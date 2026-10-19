const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { handle } = require('../scripts/Web_NoAds.js');

const plugin = fs.readFileSync(path.join(__dirname, '../plugins/Web_NoAds.lpx'), 'utf8');
const rules = plugin.split('[Script]')[1].split('[Mitm]')[0].split(/\r?\n/)
    .filter(line => line.startsWith('http-')).map(line => {
        const [phase, regex] = line.split(/\s+/);
        return { phase, regex: new RegExp(regex), option: line.match(/enable=\{([^}]+)\}/)[1], line };
    });
const defaults = Object.fromEntries([...plugin.matchAll(/^(\w+) = switch,(true|false),/gm)]
    .map(match => [match[1], match[2] === 'true']));

// Exercise the configured legacy Script bindings; Loon's native UI/parser still needs device QA.
function stage(url, response, options = {}) {
    const settings = { ...defaults, ...options };
    const phase = response ? 'http-response' : 'http-request';
    for (const rule of rules) {
        if (rule.phase !== phase || !rule.regex.test(url) || !settings[rule.option]) continue;
        return handle({ url }, response, { [rule.option]: settings[rule.option] });
    }
    return {};
}

function rewrite(url, input, options) {
    return stage(url, { body: input, status: 200, headers: { 'Content-Type': 'text/html' } }, options).body ?? input;
}

function injectedScript() {
    return rewrite('https://www.4khd.com/', '<html><head></head><body></body></html>')
        .match(/<script\b[^>]*>([\s\S]*?)<\/script>/)[1];
}

function run4khd({ registrations = [], controller = null, cacheStore } = {}) {
    const listeners = [], opened = [], events = [];
    class EventTarget {
        addEventListener(...args) { listeners.push({ target: this, args }); }
    }
    const context = {
        URL, EventTarget, navigator: { serviceWorker: {
            controller, getRegistrations: () => Promise.resolve(registrations)
        } },
        location: { href: 'https://www.4khd.com/', origin: 'https://www.4khd.com', reload: () => events.push('reload') },
        document: Object.assign(new EventTarget(), {
            createElement() { let u = new URL(context.location.href); return {
                set href(value) { u = new URL(value, context.location.href); }, get hostname() { return u.hostname; }
            }; },
            querySelectorAll() { return []; }
        }),
        window: { open(...args) { opened.push({ target: this, args }); return 'opened'; } }
    };
    if (cacheStore) { context.caches = cacheStore; context.window.caches = cacheStore; }
    vm.runInNewContext(injectedScript(), context, { timeout: 1000 });
    return { context, listeners, opened, events };
}

test('every script uses a declared site switch and the public main-branch script', () => {
    assert.equal(Object.keys(defaults).length, 5);
    assert.doesNotMatch(plugin, /\[Rule\]|\[Rewrite\]/);
    for (const rule of rules) {
        assert.ok(Object.hasOwn(defaults, rule.option));
        assert.ok(rule.line.includes('argument=[{' + rule.option + '}]'));
        const source = rule.line.match(/script-path=([^,\s]+)/)[1];
        assert.equal(source, 'https://raw.githubusercontent.com/Nek0-hinata/loon_plugin/main/scripts/Web_NoAds.js');
        assert.equal(new URL(source).search, '');
    }
});

test('document injection preserves head attributes, comments, doctype and original content', () => {
    const prefix = '\uFEFF<!-- <head> is a comment --><!DOCTYPE html><HTML lang="en"><HEAD data-x=">">';
    const tail = '<title>test</title></HEAD><BODY><a href="/search/test">link</a></BODY></HTML>';
    for (const host of ['4khd.com', 'jable.tv', 'www.xvideos.com', 'www.pornhub.com']) {
        const result = rewrite('https://' + host + '/', prefix + tail);
        assert.ok(result.startsWith(prefix));
        assert.ok(result.endsWith(tail));
        assert.ok(result.length > prefix.length + tail.length, host);
        assert.equal((result.match(/<script\b/g) || []).length, 1, host);
    }
});

test('JavaScript, JSON and incomplete comments with head-like text are unchanged', () => {
    for (const host of ['4khd.com', 'jable.tv', 'www.xvideos.com', 'www.pornhub.com']) {
        for (const body of ['const config={html:"<head>"};', '{"html":"<head>"}', '<!-- <head>',
            '<!-- <head> --><script>const s="<head>";</script>']) {
            assert.equal(rewrite('https://' + host + '/js/config.js', body), body);
        }
    }
});

test('page guards do not scan DOM mutations and preserve normal markup', () => {
    const body = '<html><head></head><body><video src="/movie.m3u8"></video><img src="https://img.afcdn.net/cover.jpg"><a href="/next">next</a></body></html>';
    for (const host of ['jable.tv', 'www.xvideos.com', 'www.pornhub.com']) {
        const result = rewrite('https://' + host + '/', body);
        const code = result.match(/<script\b[^>]*>([\s\S]*?)<\/script>/)[1];
        vm.runInNewContext(code, { window: { open() {} },
            document: { querySelectorAll() { throw Error('unexpected page scan'); } },
            MutationObserver() { throw Error('unexpected observer'); }
        }, { timeout: 1000 });
        assert.ok(result.endsWith(body.slice(body.indexOf('</head>'))));
    }
});

test('Pornhub popunder classes change while JavaScript selectors and similar classes stay intact', () => {
    const body = '<html><head></head><body><script>const selectors=["js-popUnder"]; </script>' +
        '<a class="first js-popUnder last">a</a><a class=\'js-popUnder\'>b</a>' +
        '<a class="my-js-popUnder js-popUnder-other" data-class="js-popUnder">c</a></body></html>';
    const result = rewrite('https://www.pornhub.com/', body);
    assert.ok(result.includes('const selectors=["js-popUnder"]'));
    assert.ok(result.includes('class="first js-noPopUnder last"'));
    assert.ok(result.includes("class='js-noPopUnder'"));
    assert.ok(result.includes('class="my-js-popUnder js-popUnder-other" data-class="js-popUnder"'));
});

test('Pornhub class rewriting skips quoted attribute text and supports uppercase HTML attributes', () => {
    const body = '<html><head></head><body><A TITLE="example class=\'js-popUnder\'" CLASS="js-popUnder">link</A></body></html>';
    assert.ok(rewrite('https://www.pornhub.com/', body).endsWith(
        '<A TITLE="example class=\'js-popUnder\'" CLASS="js-noPopUnder">link</A></body></html>'));
});

test('4KHD retains legitimate index navigation and media popups while blocking known ads', () => {
    const { context, listeners, opened } = run4khd();
    const element = new context.EventTarget();
    const navigate = function () { location.href = '/index.html'; };
    element.addEventListener('click', navigate, { once: true });
    assert.ok(listeners.some(({ target, args }) => target === element && args[1] === navigate));
    const ad = function () { popMagic.open(); };
    element.addEventListener('click', ad);
    assert.ok(!listeners.some(({ args }) => args[1] === ad));
    assert.equal(context.window.open('https://pemsrv.com/ad', '_blank'), null);
    assert.equal(context.window.open('https://pfec.uuss.uk/', '_blank'), null);
    for (const url of ['/index.html', 'https://img.afcdn.net/photo.jpg', 'https://pemsrv.com.example.org/help']) {
        assert.equal(context.window.open(url, '_blank'), 'opened');
        assert.equal(opened.at(-1).args[0], url);
    }
});

test('4KHD keeps native search forms and allows both search routes and worker configuration', () => {
    // Reduced from the public home/search markup inspected on 2026-09-14.
    const form = '<form role="search" method="get" action="https://www.4khd.com/" class="wp-block-search">' +
        '<input type="search" id="wp-block-search__input-1" name="s" value="test" required />' +
        '<button type="submit" class="wp-block-search__button">Search</button></form>';
    const page = '<html><head><script src="/js/config.js"></script></head><body>' + form + '</body></html>';
    for (const url of ['https://www.4khd.com/', 'https://www.4khd.com/?s=test',
        'https://www.4khd.com/?s=%E6%B5%8B%E8%AF%95&paged=2', 'https://www.4khd.com/search/test',
        'https://www.4khd.com/search/test/page/2/']) {
        assert.deepEqual(stage(url, null), {}, url);
        const result = rewrite(url, page);
        assert.ok(result.includes(form), url);
        assert.ok(result.includes('<script src="/js/config.js"></script>'), url);
    }
    for (const url of ['https://www.4khd.com/js/config.js', 'https://4khd.com/js/config.js?v=1',
        'https://www.4khd.com/wp-includes/js/jquery/jquery.min.js?ver=3.6.1',
        'https://www.4khd.com/wp-content/cache/min/1/search.js']) {
        assert.deepEqual(stage(url, null), {}, url);
        assert.deepEqual(stage(url, { body: 'const config={html:"<head>"};',
            headers: { 'Content-Type': 'application/javascript' } }), {}, url);
    }
});

test('4KHD leaves search button and form event handlers attached with their original options', () => {
    const { context, listeners } = run4khd();
    const form = new context.EventTarget(), button = new context.EventTarget();
    const submit = function (event) { this.lastSearch = event.query; };
    const click = function () { this.clicked = true; };
    const options = { capture: true, once: true };
    form.addEventListener('submit', submit, options);
    button.addEventListener('click', click, false);
    for (const [target, type, listener, option] of [[form, 'submit', submit, options], [button, 'click', click, false]]) {
        const binding = listeners.find(item => item.target === target && item.args[0] === type);
        assert.ok(binding);
        assert.equal(binding.args[1], listener);
        assert.equal(binding.args[2], option);
        binding.args[1].call(target, { query: 'test' });
    }
    assert.equal(form.lastSearch, 'test');
    assert.equal(button.clicked, true);
});

test('4KHD repairs worker-dependent image URLs without changing size, lazy loading or gallery links', () => {
    const old = 'https://i0.wp.com/pic.4khd.com/-example/albuml/AAAAAA/idCNcBGAsHYQ/w1300-rw/cover.webp?w=1300&amp;quality=90';
    const fixed = 'https://i0.wp.com/yt4.googleusercontent.com/-example/albumI/AAAAAA/idCNcBGAsYHQ/w1300-rw/cover.webp?w=1300&amp;quality=90';
    const body = '<html><head><meta property="og:image" content="' + old + '"></head><body>' +
        '<a class="imageLink" href="' + old + '"><IMG loading="lazy" decoding="async" width="1300" height="1500" SRC="' + old + '"></a>' +
        '<img src="/placeholder.svg" data-src=\'' + old + '\' data-original="' + old + '"></body></html>';
    const result = rewrite('https://www.4khd.com/content/example.html', body);
    assert.ok(result.includes('<meta property="og:image" content="' + fixed + '">'));
    assert.ok(result.includes('<a class="imageLink" href="' + fixed + '"><IMG loading="lazy" decoding="async" width="1300" height="1500" SRC="' + fixed + '"></a>'));
    assert.ok(result.includes('<img src="/placeholder.svg" data-src=\'' + fixed + '\' data-original="' + fixed + '">'));
    assert.doesNotMatch(result, /i0\.wp\.com\/pic\.4khd\.com\//);
    assert.deepEqual(stage(fixed.replace(/&amp;/g, '&'), null), {});
    assert.equal(rewrite('https://www.4khd.com/', body, { fourkhd: false }), body);
});

test('4KHD image repair is restricted to actual image attributes and the identified proxy path', () => {
    const old = 'https://i0.wp.com/pic.4khd.com/-example/id/AAAAAA/hashAsYHQ/w1300-rw/cover.webp';
    const unchanged = '<!-- <img src="' + old + '"> --><script>const sample=\'<img src="' + old + '">\';</script>' +
        '<style>.x{background:url("' + old + '")}</style><div data-url="' + old + '"></div>' +
        '<img src="https://i0.wp.com/example.org/cover.webp"><img src="https://i0.wp.com.example.org/pic.4khd.com/-example/id/AAAAAA/cover.webp">' +
        '<img src="https://i0.wp.com/pic.4khd.com/logo.webp"><img src="https://img.afcdn.net/cover.jpg">' +
        '<a href="/?s=test">search</a><script src="/js/config.js"></script>';
    const page = '<html><head></head><body>' + unchanged + '</body></html>';
    assert.ok(rewrite('https://www.4khd.com/', page).endsWith('<body>' + unchanged + '</body></html>'));
    for (const host of ['jable.tv', 'www.xvideos.com', 'www.pornhub.com', 'hub.pixibb.com', 'missav.live']) {
        const image = '<img src="' + old + '">';
        assert.ok(rewrite('https://' + host + '/', '<html><head></head><body>' + image + '</body></html>').includes(image));
    }
});

test('MissAV remains outside this plugin and its player layout attributes are never rewritten', () => {
    // The old whitespace-consuming pop() replacement corrupted this real player wrapper.
    const wrapper = '<div\n  @click="pop()"\n  @keyup.space.window="pop()"\n  class="aspect-w-16 aspect-h-9"\n>' +
        '<video controls></video></div>';
    const body = '<html><head><link rel="stylesheet" href="/build/assets/app.css">' +
        '<script src="/build/assets/app.js"></script></head><body>' + wrapper + '</body></html>';
    const response = { body, status: 200, headers: { 'Content-Type': 'text/html' } };
    for (const host of ['missav.live', 'www.missav.live']) {
        for (const resource of ['/', '/detail', '/build/assets/app.css', '/build/assets/app.js', '/fonts/site.woff2']) {
            const url = 'https://' + host + resource;
            assert.deepEqual(stage(url, null), {}, url);
            assert.deepEqual(stage(url, response), {}, url);
            assert.deepEqual(handle({ url }, response, defaults), {}, url);
            assert.equal(rewrite(url, body), body, url);
        }
    }
    assert.doesNotMatch(plugin.split('[Mitm]')[1], /missav/i);
});

test('4KHD removes only the audited ad worker and waits for cache cleanup before reload', async () => {
    const ad = { scriptURL: 'https://www.4khd.com/interstitial.js?v=1' };
    const other = { scriptURL: 'https://www.4khd.com/offline.js' };
    const removed = [], deleted = [];
    let finishDelete;
    const state = run4khd({ controller: ad, registrations: [
        { active: ad, unregister: async () => { removed.push('ad'); return true; } },
        { active: other, unregister: async () => { removed.push('other'); return true; } }
    ], cacheStore: {
        keys: async () => ['my-cache', 'img-cache', 'user-cache'],
        delete(key) { deleted.push(key); return new Promise(resolve => { if (key === 'img-cache') finishDelete = resolve; else resolve(true); }); }
    } });
    await new Promise(setImmediate);
    assert.deepEqual(removed, ['ad']);
    assert.deepEqual(deleted.sort(), ['img-cache', 'my-cache']);
    assert.deepEqual(state.events, []);
    finishDelete(true);
    await new Promise(setImmediate);
    assert.deepEqual(state.events, ['reload']);
});

test('4KHD does not reload when a different worker controls the page', async () => {
    const state = run4khd({ controller: { scriptURL: 'https://www.4khd.com/offline.js' }, registrations: [
        { active: { scriptURL: 'https://www.4khd.com/interstitial.js' }, unregister: async () => true }
    ] });
    await new Promise(setImmediate);
    assert.deepEqual(state.events, []);
});

test('PixiBB removes its audited promotion call and preserves player APIs and frames', () => {
    const body = '<html><head></head><body><script>const adUrls=[];const key="pixibb_ad_cooldown";' +
        'function initAdListeners(){window.open(targetUrl, "_blank");}</script>' +
        '<script>window.open(playerUrl, "_blank");</script>' +
        '<iframe src="https://myvidplay.com/e/id"></iframe><script src="https://cdn.plyr.io/plyr.js"></script>' +
        '<a href="/wp-json/pixibb/v1/video-direct">video</a></body></html>';
    const result = rewrite('https://hub.pixibb.com/', body);
    assert.doesNotMatch(result, /pixibb_ad_cooldown|initAdListeners|window\.open\(targetUrl/);
    assert.ok(result.endsWith(body.slice(body.indexOf('<script>window.open(playerUrl'))));
    for (const url of ['https://myvidplay.com/e/id', 'https://playmogo.com/e/id', 'https://cdn.plyr.io/plyr.js',
        'https://hub.pixibb.com/wp-json/pixibb/v1/video-direct', 'https://www.4khd.com/js/config.js']) {
        assert.deepEqual(stage(url, null), {});
        assert.deepEqual(stage(url, { body: 'untouched' }), {});
    }
});

test('PixiBB removes the identified A-Ads frame only on enabled PixiBB pages', () => {
    const ad = '<iframe data-aa=2426655 src=//ad.a-ads.com/2426655/?size=320x50 style="width:320px;height:50px"></iframe>';
    const player = '<iframe src="https://myvidplay.com/e/example"></iframe>';
    const ordinary = '<iframe src="https://ad.a-ads.com.example.org/help"></iframe>';
    const body = '<html><head></head><body><div id="frame">' + ad + '</div>' + player + ordinary + '</body></html>';
    for (const host of ['hub.pixibb.com', 'sexy.pixibb.com', 'cosplay.pixibb.com']) {
        const result = rewrite('https://' + host + '/', body);
        assert.ok(result.includes('<div id="frame"></div>' + player + ordinary));
        assert.ok(!result.includes(ad));
        assert.equal(rewrite('https://' + host + '/', body, { pixibb: false }), body);
    }
    assert.ok(rewrite('https://jable.tv/', body).includes(ad));
    assert.deepEqual(stage('https://ad.a-ads.com/2426655/?size=320x50', null), {});
});

test('all 32 switch combinations independently control page rewriting and request blocking', () => {
    const pages = { fourkhd: 'https://4khd.com/', jable: 'https://jable.tv/', xvideos: 'https://www.xvideos.com/',
        pornhub: 'https://www.pornhub.com/', pixibb: 'https://cosplay.pixibb.com/example/videos/' };
    const requests = { fourkhd: 'https://4khd.com/interstitial.js?v=1',
        pornhub: 'https://www.pornhub.com/_xa/ads_batch?test=1',
        pixibb: 'https://cosplay.pixibb.com/promotion/sexy-cosplay/?test=1' };
    const body = '<html><head></head><body>Original</body></html>';
    const names = Object.keys(pages);
    for (let mask = 0; mask < 32; mask++) {
        const options = Object.fromEntries(names.map((name, i) => [name, Boolean(mask & (1 << i))]));
        for (const name of names) {
            assert.equal(rewrite(pages[name], body, options) !== body, options[name], mask + ':' + name);
            if (requests[name]) assert.equal(Boolean(stage(requests[name], null, options).response), options[name]);
        }
    }
});

test('disabled scripts leave original data intact even if invoked directly with string arguments', () => {
    const request = { url: 'https://sexy.pixibb.com/promotion/sexy-girls/' };
    const response = { body: '<html><head></head><body>Original</body></html>', headers: {} };
    assert.deepEqual(handle(request, response, { pixibb: false }), {});
    assert.deepEqual(handle(request, null, '{"pixibb":"false"}'), {});
    for (const url of ['https://example.org/', 'https://pixibb.com.example.org/', 'https://happylength.com/']) {
        assert.deepEqual(handle({ url }, response, defaults), {});
        assert.deepEqual(stage(url, null), {});
    }
});

test('enabled pages remove known ad resources without changing player scripts or quoted HTML', () => {
    const body = '<html><head><!-- <script src="https://pemsrv.com/ad.js"></script> -->' +
        '<script>const sample=\'<img src="https://pemsrv.com/ad.png">\';</script>' +
        '<script async src="https://pemsrv.com/ad.js"></script>' +
        '<script src="/js/config.js"></script></head><body><iframe src="https://magsrv.com/ad"></iframe>' +
        '<iframe src="https://myvidplay.com/e/test"></iframe><img src="https://img.afcdn.net/cover.jpg"></body></html>';
    const result = rewrite('https://4khd.com/', body);
    assert.ok(result.includes('<!-- <script src="https://pemsrv.com/ad.js"></script> -->'));
    assert.ok(result.includes('const sample=\'<img src="https://pemsrv.com/ad.png">\''));
    assert.ok(result.includes('<script src="/js/config.js"></script>'));
    assert.doesNotMatch(result, /<script async src="https:\/\/pemsrv|<iframe src="https:\/\/magsrv/);
    assert.ok(result.includes('<iframe src="https://myvidplay.com/e/test"></iframe>'));
    assert.ok(result.includes('<img src="https://img.afcdn.net/cover.jpg">'));
    assert.equal(rewrite('https://4khd.com/', body, { fourkhd: false }), body);
});

test('PixiBB hides the audited sponsored banner without hiding ordinary external links or containers', () => {
    const body = '<html><head></head><body><section><a rel="sponsored noopener" href="https://www.filmxy.vip/ref/007">Ad</a>' +
        '<a href="https://www.filmxy.vip/ref/007">Normal</a><a href="https://filmxy.vip.example.org/ref/007" rel="sponsored">Other</a>' +
        '<a href="/promotion/sexy-girls/?x=1">Promo</a><img src="/cover.jpg"></section></body></html>';
    for (const host of ['hub', 'sexy', 'cosplay']) {
        const result = rewrite('https://' + host + '.pixibb.com/', body);
        assert.ok(result.includes('href="https://www.filmxy.vip/ref/007" class=" loon-web-noads-promotion">Ad'));
        assert.ok(result.includes('<a href="https://www.filmxy.vip/ref/007">Normal</a>'));
        assert.ok(result.includes('<a href="https://filmxy.vip.example.org/ref/007" rel="sponsored">Other</a>'));
        assert.ok(result.includes('href="/promotion/sexy-girls/?x=1" class=" loon-web-noads-promotion">Promo'));
        assert.ok(result.includes('<img src="/cover.jpg"></section>'));
    }
});

test('PixiBB popup and click guards stop known promotions while keeping search and video actions', () => {
    const html = rewrite('https://hub.pixibb.com/', '<html><head></head><body></body></html>');
    const code = html.match(/<script\b[^>]*>([\s\S]*?)<\/script>/)[1];
    const listeners = {}, calls = [];
    const window = { open(...args) { calls.push(args); return 'player'; } };
    const document = { addEventListener(type, listener) { listeners[type] = listener; } };
    vm.runInNewContext(code, { URL, window, document, location: { href: 'https://hub.pixibb.com/' } });
    for (const url of ['https://happylength.com/ad', '//sub.happylength.com/ad', '/promotion/sexy-girls/?x=1',
        'https://cosplay.pixibb.com/promotion/sexy-cosplay/']) assert.equal(window.open(url), null);
    for (const url of ['https://myvidplay.com/e/id', 'https://playmogo.com/e/id', '/?s=test',
        'https://happylength.com.example.org/', '/promotion/normal-page/']) {
        assert.equal(window.open(url, '_blank', 'width=600'), 'player');
        assert.deepEqual(calls.at(-1), [url, '_blank', 'width=600']);
    }
    function click(href) {
        let prevented = false, stopped = false;
        listeners.click({ target: { closest: () => href ? { href } : null },
            preventDefault() { prevented = true; }, stopImmediatePropagation() { stopped = true; } });
        return { prevented, stopped };
    }
    assert.deepEqual(click('/promotion/sexy-cosplay/'), { prevented: true, stopped: true });
    assert.deepEqual(click('/?s=test'), { prevented: false, stopped: false });
    assert.deepEqual(click(null), { prevented: false, stopped: false });
    assert.doesNotMatch(code, /document\.cookie|MutationObserver|querySelectorAll|localStorage/);
});

test('Loon entry point works without browser globals and calls done exactly once', () => {
    const source = fs.readFileSync(path.join(__dirname, '../scripts/Web_NoAds.js'), 'utf8');
    const results = [];
    vm.runInNewContext(source, {
        $request: { url: 'https://cosplay.pixibb.com/example/' },
        $response: { status: 200, headers: { 'content-type': 'text/html' }, body: '<html><head></head><body>content</body></html>' },
        $argument: { pixibb: true }, $done(result) { results.push(result); }
    }, { timeout: 1000 });
    assert.equal(results.length, 1);
    assert.ok(results[0].body.includes('loon-web-noads-promotion'));
    const nonHTML = { body: '<html><head></head></html>', headers: { 'CONTENT-TYPE': 'application/javascript' } };
    assert.deepEqual(handle({ url: 'https://hub.pixibb.com/' }, nonHTML, defaults), {});
});
