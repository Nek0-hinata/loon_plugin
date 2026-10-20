const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { render } = require('../scripts/Rain_Forecast.js');
const html = fs.readFileSync(path.join(__dirname, '../web/Rain_Forecast.html'), 'utf8');
const source = fs.readFileSync(path.join(__dirname, '../scripts/Rain_Forecast.js'), 'utf8');
const pageURL = 'https://raw.githubusercontent.com/Nek0-hinata/loon_plugin/main/web/Rain_Forecast.html';
const context = { URL };
vm.runInNewContext(html.match(/<script id="rain-core">([\s\S]*?)<\/script>/)[1], context);
const C = context.RainForecastCore;
const now = Date.UTC(2026, 9, 20, 4, 15);
const hour = 3600000;
function fixture() {
  return {
    timezone: 'Asia/Shanghai',
    hourly_units: { time: 'unixtime', precipitation: 'mm', precipitation_probability: '%' },
    hourly: { time: Array.from({ length: 50 }, (_, i) => (Date.UTC(2026, 9, 20, 4) + i * hour) / 1000),
      precipitation: Array.from({ length: 50 }, (_, i) => i === 0 ? 99 : i === 1 ? 2 : 0),
      precipitation_probability: Array(50).fill(40) }
  };
}
function response(body = html, status = 200) {
  return { status, body, headers: { 'content-type': 'text/plain', 'Content-Encoding': 'gzip', 'content-length': '99',
    'Content-Security-Policy': "default-src 'none'", 'ETag': 'old', 'X-Content-Type-Options': 'nosniff' } };
}

test('only the owned forecast page becomes HTML, with browser policy and correct headers', () => {
  const result = render({ url: pageURL }, response(), { latitude: 31.23, longitude: 121.47, location_name: '上海', model: 'gfs' });
  assert.equal(result.headers['Content-Type'], 'text/html; charset=utf-8');
  assert.equal(result.headers['Cache-Control'], 'no-store');
  assert.equal(result.headers['Content-Encoding'], undefined);
  assert.equal(result.headers['content-length'], undefined);
  assert.equal(result.headers.ETag, undefined);
  assert.equal(result.headers['X-Content-Type-Options'], 'nosniff');
  assert.match(result.headers['Content-Security-Policy'], /frame-src https:\/\/embed.windy.com/);
  const config = JSON.parse(result.body.match(/<script id="rain-config" type="application\/json">([\s\S]*?)<\/script>/)[1]);
  assert.deepEqual(config, { latitude: 31.23, longitude: 121.47, name: '上海', model: 'gfs' });
  for (const url of [pageURL + '/other', pageURL.replace('main/', 'other/'), pageURL.replace('githubusercontent.com', 'githubusercontent.com.evil.test'), 'https://example.com/']) {
    assert.deepEqual(render({ url }, response(), {}), {});
  }
  assert.deepEqual(render({ url: pageURL }, response(html, 404), {}), {});
  assert.deepEqual(render({ url: pageURL }, response('not our page'), {}), {});
});

test('plugin text cannot terminate the config script or inject HTML', () => {
  const name = '</script><script>alert(1)</script>\u2028&';
  const result = render({ url: pageURL }, response(), { latitude: '', longitude: '181', location_name: name, model: 'unknown' });
  const encoded = result.body.match(/<script id="rain-config" type="application\/json">([\s\S]*?)<\/script>/)[1];
  assert.ok(!encoded.includes('<'));
  assert.equal(JSON.parse(encoded).name, name);
  assert.equal(JSON.parse(encoded).latitude, 39.9042);
  assert.equal(JSON.parse(encoded).longitude, 116.4074);
  assert.equal(JSON.parse(encoded).model, 'ecmwf');
});

test('native diagnostics preserve the full upstream response and never log credentials or coordinates', () => {
  const logs = [];
  const upstream = response(JSON.stringify({ status: 'ok', token: 'TOP-SECRET', latitude: 39.9042, user: { email: 'PRIVATE-EMAIL' },
    images: [['https://cdn.example/image?auth_key=SECRET-KEY', 1792472400, [39, 115, 41, 118]]],
    data: { 'DYNAMIC-PRIVATE-KEY': 'secret', images: [null] } }));
  const before = JSON.stringify(upstream);
  const result = render({ url: 'https://wrapper.cyapi.cn/v1/radar/forecast_images?token=QUERY-SECRET&lat=39.9042', headers: { authorization: 'Bearer HEADER-SECRET' } }, upstream, {}, m => logs.push(m));
  assert.deepEqual(result, {});
  assert.equal(JSON.stringify(upstream), before);
  assert.equal(logs.length, 1);
  assert.match(logs[0], /"category":"radar"/);
  assert.match(logs[0], /"images"/);
  assert.doesNotMatch(logs[0], /SECRET|PRIVATE|39\.9042|1792472400|auth_key|authorization|https:/);
  assert.doesNotThrow(() => render({ url: 'https://api.cyapi.cn/v1/radar/images' }, response('binary'), {}, () => {}));
});

test('runtime calls $done once and passes through unsupported input', () => {
  for (const upstream of [response(), response('invalid'), null]) {
    const calls = [];
    vm.runInNewContext(source, { $request: { url: pageURL }, $response: upstream, $argument: {}, $done: value => calls.push(value), console });
    assert.equal(calls.length, 1);
  }
});

test('forecast excludes past endpoints, preserves the preceding-hour interval, and caps at 48', () => {
  const parsed = C.forecast(fixture(), now);
  assert.equal(parsed.rows.length, 48);
  assert.equal(parsed.rows[0].end, Date.UTC(2026, 9, 20, 5));
  assert.equal(parsed.rows[0].start, Date.UTC(2026, 9, 20, 4));
  assert.equal(parsed.rows[0].mm, 2);
  assert.equal(C.stats(parsed.rows).total, 2);
});

test('requested horizon preserves 48 future intervals when a response crosses the hour', () => {
  const requested = Number(html.match(/forecast_hours:\s*(\d+)/)[1]);
  const data = fixture();
  for (const key of Object.keys(data.hourly)) data.hourly[key] = data.hourly[key].slice(0, requested);
  const boundary = Date.UTC(2026, 9, 20, 5);
  for (const receivedAt of [boundary - 1000, boundary, boundary + 1000]) {
    const parsed = C.forecast(data, receivedAt);
    assert.equal(parsed.rows.length, 48);
    assert.ok(parsed.rows.every(row => row.end > receivedAt));
    assert.equal(parsed.rows[0].end, receivedAt < boundary ? boundary : boundary + hour);
    assert.equal(parsed.rows.at(-1).end - parsed.rows[0].start, 48 * hour);
  }
});

test('null, absent, nonnumeric or invalid values never become no rain', () => {
  const data = fixture();
  data.hourly.precipitation = [99, null, -1, '0', Number.NaN];
  data.hourly.precipitation_probability = [10, null, 150, '0'];
  const parsed = C.forecast(data, now);
  for (const row of parsed.rows) { assert.equal(row.mm, null); assert.equal(row.probability, null); }
  assert.equal(C.stats(parsed.rows).total, null);
  assert.equal(C.stats(parsed.rows).complete, false);
  const partial = fixture(); partial.hourly.precipitation[2] = null;
  const stats = C.stats(C.forecast(partial, now).rows);
  assert.equal(stats.total, 2); assert.equal(stats.complete, false); assert.equal(stats.known, 47);
});

test('rejects stale, unsorted and unexpected-unit forecasts', () => {
  assert.throws(() => C.forecast(fixture(), now + 100 * hour), /没有未来时段/);
  const order = fixture(); order.hourly.time[3] = order.hourly.time[2];
  assert.throws(() => C.forecast(order, now), /时间顺序/);
  const gaps = fixture(); gaps.hourly.time[3] += 1800;
  assert.throws(() => C.forecast(gaps, now), /小时间隔/);
  const units = fixture(); units.hourly_units.precipitation = 'inch';
  assert.throws(() => C.forecast(units, now), /单位/);
  assert.throws(() => C.forecast({}, now), /缺少逐小时/);
});

test('map uses actual forecast layer and validates WGS84 coordinates', () => {
  const u = new URL(C.mapURL({ latitude: 0, longitude: 0, name: '赤道' }, 'gfs'));
  assert.equal(u.origin, 'https://embed.windy.com');
  assert.equal(u.searchParams.get('overlay'), 'rain');
  assert.equal(u.searchParams.get('product'), 'gfs');
  assert.equal(u.searchParams.get('lat'), '0');
  assert.throws(() => C.mapURL({ latitude: '', longitude: 116 }, 'ecmwf'), /经纬度/);
  assert.throws(() => C.location({ latitude: 91, longitude: 0 }), /经纬度/);
});

test('plugin rules point to owned resources and keep diagnostics separately optional', () => {
  const plugin = fs.readFileSync(path.join(__dirname, '../plugins/Rain_Forecast.lpx'), 'utf8');
  assert.match(plugin, /#!openUrl=https:\/\/raw.githubusercontent.com\/Nek0-hinata\/loon_plugin\/main\/web\/Rain_Forecast.html/);
  assert.match(plugin, /hostname=raw.githubusercontent.com/);
  assert.doesNotMatch(plugin, /cyapi|caiyunapp/);
  assert.match(plugin, /argument=\[\{latitude\},\{longitude\},\{location_name\},\{model\}\]/);
  const diagnostic = fs.readFileSync(path.join(__dirname, '../plugins/Caiyun_Radar_Diagnostics.lpx'), 'utf8');
  assert.doesNotMatch(diagnostic, /vip_info|user_detail|v2\\\/user/);
});

