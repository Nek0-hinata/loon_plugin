/* Rain Forecast v1.0.0 — own-page rendering and optional read-only diagnostics. */
(function () {
  "use strict";
  var PAGE = /^https:\/\/raw\.githubusercontent\.com\/Nek0-hinata\/loon_plugin\/main\/web\/Rain_Forecast\.html(?:\?.*)?$/;
  var NATIVE = /^https:\/\/(?:api|wrapper)\.(?:cyapi\.cn|caiyunapp\.com)\/v\d+\/(radar|nafp|satellite)(?:[/?]|$)/;
  var CONFIG = /<script id="rain-config" type="application\/json">[\s\S]*?<\/script>/;

  function coordinate(value, limit, fallback) {
    if (value === null || value === undefined || String(value).trim() === "") return fallback;
    var number = Number(value);
    return Number.isFinite(number) && Math.abs(number) <= limit ? number : fallback;
  }

  function config(argument) {
    var a = argument && typeof argument === "object" ? argument : {};
    return {
      latitude: coordinate(a.latitude, 90, 39.9042),
      longitude: coordinate(a.longitude, 180, 116.4074),
      name: typeof a.location_name === "string" ? a.location_name.slice(0, 80) : "北京",
      model: ["ecmwf", "gfs", "icon"].indexOf(a.model) >= 0 ? a.model : "ecmwf"
    };
  }

  function safeJSON(value) {
    return JSON.stringify(value).replace(/[<>&\u2028\u2029]/g, function (c) {
      return "\\u" + ("0000" + c.charCodeAt(0).toString(16)).slice(-4);
    });
  }

  // Field names are allowlisted: dynamic keys and all scalar values are omitted.
  var FIELDS = /^(status|result|data|radar|images|past|nowcast|forecast|frames|time|timestamp|path|url|bounds|station|timezone|tzshift|code|message|error|host|version|generated|precipitation|precipitation_2h|precipitation_probability|minutely|hourly)$/;
  function shape(value, depth) {
    if (value === null) return "null";
    if (Array.isArray(value)) return { type: "array", length: value.length, item: depth > 0 && value.length ? shape(value[0], depth - 1) : undefined };
    if (typeof value !== "object") return typeof value;
    if (depth <= 0) return "object";
    var fields = {};
    var omitted = 0;
    Object.keys(value).slice(0, 60).forEach(function (key) {
      if (FIELDS.test(key)) fields[key] = shape(value[key], depth - 1);
      else omitted++;
    });
    return { type: "object", fields: fields, omitted: omitted };
  }

  function render(request, response, argument, log) {
    var url = request && request.url || "";
    if (!response) return {};
    var match = NATIVE.exec(url);
    if (match) {
      var record = { category: match[1], status: Number(response.status) || 0 };
      try {
        record.schema = typeof response.body === "string" && response.body.length <= 1048576
          ? shape(JSON.parse(response.body), 5) : "body unavailable or too large";
      } catch (_) { record.schema = "not JSON"; }
      if (log) log("[Rain Forecast] Native schema " + JSON.stringify(record));
      return {}; // Preserve the original body, headers and HTTP status exactly.
    }
    if (!PAGE.test(url) || Number(response.status) !== 200 || typeof response.body !== "string") return {};
    if (response.body.indexOf("<!-- loon-rain-forecast:v1 -->") < 0 || !CONFIG.test(response.body)) return {};
    var body = response.body.replace(CONFIG, function () {
      return '<script id="rain-config" type="application/json">' + safeJSON(config(argument)) + '</script>';
    });
    var headers = {};
    Object.keys(response.headers || {}).forEach(function (key) {
      if (!/^(content-type|content-length|content-encoding|content-disposition|content-security-policy(?:-report-only)?|cache-control|etag|last-modified|referrer-policy|permissions-policy)$/i.test(key)) headers[key] = response.headers[key];
    });
    headers["Content-Type"] = "text/html; charset=utf-8";
    headers["Cache-Control"] = "no-store";
    headers["Referrer-Policy"] = "no-referrer";
    headers["Permissions-Policy"] = "geolocation=(self)";
    headers["Content-Security-Policy"] = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; connect-src https://api.open-meteo.com https://geocoding-api.open-meteo.com; frame-src https://embed.windy.com; base-uri 'none'; form-action 'none'; object-src 'none'";
    return { headers: headers, body: body };
  }

  if (typeof module !== "undefined" && module.exports) module.exports = { render: render, config: config, shape: shape };
  if (typeof $done === "function") {
    var output = {};
    try {
      output = render(typeof $request === "undefined" ? {} : $request,
        typeof $response === "undefined" ? null : $response,
        typeof $argument === "undefined" ? null : $argument,
        function (message) { console.log(message); });
    } catch (_) { /* On unexpected input, leave the upstream response intact. */ }
    $done(output);
  }
}());
