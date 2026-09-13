const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../scripts/JD_Price.js'), 'utf8');
const helpers = source.slice(source.indexOf('function escapeHtmlText('), source.indexOf('// 提交请求'));
const context = { $: { time: () => '2026-09-13' } };
vm.createContext(context);
vm.runInContext(helpers, context, { timeout: 1000 });
const { Price_HTML, Price_Error_HTML, insertPriceHtml } = context;

test('all external price columns are encoded as text, including entity-shaped input', () => {
    const html = Price_HTML([{
        Name: '<img src=x onerror="alert(1)">',
        Date: '</td><script>alert(1)</script>',
        Price: '&lt;b&gt;"\'&',
        Difference: '↑</td><svg onload=alert(1)>'
    }]);
    assert.ok(html.includes('&lt;img src=x onerror=&quot;alert(1)&quot;&gt;'));
    assert.ok(html.includes('&lt;/td&gt;&lt;script&gt;alert(1)&lt;/script&gt;'));
    assert.ok(html.includes('&amp;lt;b&amp;gt;&quot;&#39;&amp;'));
    assert.ok(html.includes('class="price-diff up">↑&lt;/td&gt;&lt;svg'));
    assert.doesNotMatch(html, /<img|<svg|<script/i);
    assert.equal((html.match(/<td\b/g) || []).length, 4);
});

test('normal prices, dates, zero and rise/fall labels retain their display', () => {
    const html = Price_HTML([
        { Name: '当前到手价', Date: 'old', Price: 0, Difference: null },
        { Name: '历史最低价', Date: '2026-08-01', Price: '¥99.90', Difference: '↓10元' },
        { Name: '618价格', Date: null, Price: null, Difference: 0 }
    ]);
    assert.ok(html.includes('<td>当前到手价</td><td>2026-09-13</td><td>0</td>'));
    assert.ok(html.includes('>仅供参考</td>'));
    assert.ok(html.includes('<td>历史最低价</td><td>2026-08-01</td><td>¥99.90</td>'));
    assert.ok(html.includes('class="price-diff down">↓10元</td>'));
    assert.ok(html.includes('<td>618价格</td><td>-</td><td></td><td class="price-diff ">0</td>'));
});

test('error messages cannot insert tags and tolerate non-Error rejections', () => {
    for (const error of [new Error('<script>"x" & \'y\'</script>'), '<img src=x>', null, 0]) {
        const html = Price_Error_HTML(error);
        assert.doesNotMatch(html, /<script|<img/i);
        assert.equal((html.match(/<strong>/g) || []).length, 1);
    }
    assert.ok(Price_Error_HTML(new Error('<b>bad</b>')).includes('&lt;b&gt;bad&lt;/b&gt;'));
    assert.ok(Price_Error_HTML(null).includes('比价请求失败'));
});

test('insertion preserves replacement metacharacters and the complete original document', () => {
    const body = '<html><body><p>商品原文 $&</p></body></html>';
    const html = '<div>$& $$ $` $\'</div>';
    assert.equal(insertPriceHtml(body, html), '<html><body>' + html + '<p>商品原文 $&</p></body></html>');
});

test('uppercase body and attributes containing angle brackets retain correct boundaries', () => {
    const body = '<!DOCTYPE html><HTML><HEAD></HEAD><BODY data-x=">" data-y=\'<body>\'><p>商品</p></BODY></HTML>';
    assert.equal(insertPriceHtml(body, '<div>price</div>'), body.replace('<p>商品</p>', '<div>price</div><p>商品</p>'));
});

test('body-looking text inside comments, scripts, styles and title is not an insertion point', () => {
    const body = '<!doctype html><html><head><!-- <body> -->' +
        '<script>const s="<body>";</script><style>x::after{content:"<body>"}</style>' +
        '<title>literal <body></title></head><body class="product">CONTENT</body></html>';
    assert.equal(insertPriceHtml(body, '<div>price</div>'), body.replace('CONTENT', '<div>price</div>CONTENT'));
});

test('missing body and incomplete or ambiguous markup are left untouched', () => {
    for (const body of [undefined, null, '', '{"body":"text"}', '<html><head></head></html>',
        '<!-- <body>', '<script>"<body>"', '<html data-x="<body>',
        '<html><head><template><body></template></head><body>content</body></html>']) {
        assert.equal(insertPriceHtml(body, '<div>price</div>'), body);
    }
});

async function runProductResponse(responses, version = 'V1') {
    const requests = [];
    let complete;
    const done = new Promise(resolve => { complete = resolve; });
    class Env {
        getdata(key) { return key === 'manmanbuy_val' ? 'c_mmbDevId=synthetic-test-device' : version; }
        log() {}
        logErr() {}
        msg() {}
        toStr(value) { return JSON.stringify(value); }
        toObj(value) { return JSON.parse(value); }
        time() { return '2026-09-13'; }
        post(options, callback) {
            requests.push(options);
            assert.match(options.url, /^https:\/\/apapia-(?:history-weblogic|common)\.manmanbuy\.com\//);
            callback(null, { body: JSON.stringify(responses.shift()) });
        }
    }
    vm.runInNewContext(source.slice(0, source.indexOf('function intCryptoJS(')), {
        Env, intCryptoJS() {}, md5() { return 'synthetic-signature'; },
        setTimeout() { return 0; },
        $request: { url: 'https://in.m.jd.com/product/graphext/123.html' },
        $response: { body: '<html><body class="product"><p>原商品详情</p></body></html>' },
        $done: complete
    }, { timeout: 1000 });
    return { result: await done, requests };
}

test('full V1 product flow still makes three price queries and returns safe price HTML', { timeout: 1000 }, async () => {
    const { result, requests } = await runProductResponse([
        { ok: 1, result: { url: 'https://item.jd.com/123.html', spbh: '123' } },
        { ok: 1, result: { trend: 'synthetic-trend' } },
        { ok: 1, remark: { ListPriceDetail: [
            { Name: '历史最低价', Date: '2026-09-01', Price: '</td><script>bad</script>$&', Difference: '↓5元' }
        ] } }
    ]);
    assert.equal(requests.length, 3);
    assert.ok(result.body.startsWith('<html><body class="product"><div class="price-container">'));
    assert.ok(result.body.includes('&lt;/td&gt;&lt;script&gt;bad&lt;/script&gt;$&'));
    assert.ok(result.body.endsWith('<p>原商品详情</p></body></html>'));
    assert.doesNotMatch(result.body, /<script>/);
});

test('upstream price error remains readable without injecting HTML into the product page', { timeout: 1000 }, async () => {
    const { result, requests } = await runProductResponse([{ ok: 0, msg: '<img src=x onerror=alert(1)>$&' }]);
    assert.equal(requests.length, 1);
    assert.ok(result.body.includes('慢慢买提示您：&lt;img src=x onerror=alert(1)&gt;$&'));
    assert.ok(result.body.endsWith('<p>原商品详情</p></body></html>'));
    assert.doesNotMatch(result.body, /<img\b/);
});

test('full V2 product flow retains link parsing and four requests with ordinary prices', { timeout: 1000 }, async () => {
    const { result, requests } = await runProductResponse([
        { ok: 1, result: { link: 'https://item.jd.com/123.html', stteId: 'synthetic-site' } },
        { ok: 1, result: { url: 'https://item.jd.com/123.html', spbh: '123' } },
        { ok: 1, result: { trend: 'synthetic-trend' } },
        { ok: 1, remark: { ListPriceDetail: [
            { Name: '历史最低价', Date: '2026-09-01', Price: '99.90', Difference: '↓5元' }
        ] } }
    ], 'V2');
    assert.equal(requests.length, 4);
    assert.equal(requests[0].url, 'https://apapia-common.manmanbuy.com/SiteCommand/parse');
    assert.ok(requests[1].url.endsWith('/basic/v2/getItemBasicInfo'));
    assert.equal(new URLSearchParams(requests[1].body).get('stteId'), 'synthetic-site');
    assert.ok(result.body.includes('<td>历史最低价</td><td>2026-09-01</td><td>99.90</td>'));
    assert.ok(result.body.endsWith('<p>原商品详情</p></body></html>'));
});
