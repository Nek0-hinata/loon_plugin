const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const plugin = fs.readFileSync(path.join(__dirname, '../plugins/Web_NoAds.lpx'), 'utf8');
const rules = plugin.split('[Rewrite]')[1].split('[Mitm]')[0].split(/\r?\n/)
    .filter(line => line.startsWith('^')).map(line => line.split(/\s+/));

// Model Loon's documented legacy whitespace-separated regex/replacement pairs.
// These tests exercise the supported common regex subset, not Loon's native parser.
function pattern(value, global = false) {
    const insensitive = value.startsWith('(?i)');
    return new RegExp(insensitive ? value.slice(4) : value, (insensitive ? 'i' : '') + (global ? 'g' : ''));
}

function rewrite(url, input) {
    let body = input;
    for (const [urlPattern, action, ...pairs] of rules) {
        if (action !== 'response-body-replace-regex' || !pattern(urlPattern).test(url)) continue;
        for (let i = 0; i < pairs.length; i += 2) body = body.replace(pattern(pairs[i], true), pairs[i + 1]);
    }
    return body;
}

function injectedScript() {
    return rewrite('https://www.4khd.com/', '<html><head></head><body></body></html>')
        .match(/<script>([\s\S]*?)<\/script>/)[1];
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

test('every rewrite has complete arguments and compilable regular expressions', () => {
    for (const [url, action, ...args] of rules) {
        pattern(url);
        if (action === 'response-body-replace-regex') {
            assert.equal(args.length % 2, 0);
            for (let i = 0; i < args.length; i += 2) pattern(args[i], true);
        } else assert.equal(action, 'reject-200');
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
        assert.equal((result.match(/<style>|<script>/g) || []).length, 1, host);
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

test('CSS-only sites do not install page mutation handlers and preserve normal markup', () => {
    const body = '<html><head></head><body><video src="/movie.m3u8"></video><img src="https://img.afcdn.net/cover.jpg"><a href="/next">next</a></body></html>';
    for (const host of ['jable.tv', 'www.xvideos.com', 'www.pornhub.com']) {
        const result = rewrite('https://' + host + '/', body);
        assert.doesNotMatch(result, /<script\b/i);
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
    const body = '<A TITLE="example class=\'js-popUnder\'" CLASS="js-popUnder">link</A>';
    assert.equal(rewrite('https://www.pornhub.com/', body),
        '<A TITLE="example class=\'js-popUnder\'" CLASS="js-noPopUnder">link</A>');
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
    const body = '<script>window.open(targetUrl, "_blank");window.open(playerUrl, "_blank");</script>' +
        '<iframe src="https://myvidplay.com/e/id"></iframe><script src="https://cdn.plyr.io/plyr.js"></script>' +
        '<a href="/wp-json/pixibb/v1/video-direct">video</a>';
    assert.equal(rewrite('https://hub.pixibb.com/', body), body.replace('window.open(targetUrl, "_blank");', 'void(0);'));
    for (const url of ['https://myvidplay.com/e/id', 'https://playmogo.com/e/id', 'https://cdn.plyr.io/plyr.js',
        'https://hub.pixibb.com/wp-json/pixibb/v1/video-direct', 'https://www.4khd.com/js/config.js']) {
        assert.ok(!rules.some(([source, action]) => action === 'reject-200' && pattern(source).test(url)));
    }
});
