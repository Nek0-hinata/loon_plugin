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

test('every script uses a declared site switch and a bundled local script', () => {
    assert.equal(Object.keys(defaults).length, 5);
    assert.doesNotMatch(plugin, /\[Rule\]|\[Rewrite\]/);
    for (const rule of rules) {
        assert.ok(Object.hasOwn(defaults, rule.option));
        assert.ok(rule.line.includes('argument=[{' + rule.option + '}]'));
        assert.ok(rule.line.includes('script-path=Web_NoAds.js'));
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
