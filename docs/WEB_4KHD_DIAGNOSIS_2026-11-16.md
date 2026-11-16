# 4KHD 插件排障：2026-11-16

## 已复现的问题

基于 `main` 的 `96d22c1a2c2a9ee41ae9d5c2bf09961ed5382885` 检查。旧版 LPX 只拦截 `/interstitial.js`、`/js/a1000d.js`；正文注入也只识别 `/interstitial.js` 注册的 Service Worker。

当前公开首页、两个详情页和搜索页的 `<head>` 已改为以下独立加载器：

```js
const s = document.createElement('script');
s.src = location.hostname.endsWith('.4khd.com') ? '/worker.js' : '/scss.js';
s.async = true;
document.head.appendChild(s);
```

公开 `/interstitial.js` 只剩注册 `/worker.js` 的短入口。读取的 `/worker.js`、`/scss.js` 包含 Service Worker 注册、请求处理、缓存以及广告配置处理。原有规则不匹配两个新路径，也不注销它们的已有注册，因此会漏过新的广告处理链。这里只读取公开 HTML、脚本和响应头，未执行远端混淆脚本或截图。

## 修复

- LPX 与脚本同时补齐 `/worker.js`、`/scss.js` 的精确路径拦截，保留旧路径和站点独立开关。
- 注销同源的 `/interstitial.js`、`/worker.js`、`/scss.js` 注册，覆盖 active、waiting、installing 状态和版本查询参数；仍先完成注销与已知缓存清理，再按原逻辑刷新。
- 在正文中移除上述已核实的独立内联加载器及同源广告脚本标签，避免命中浏览器或 Worker 缓存的脚本再次注册。包含额外逻辑的内联脚本、其他来源和其他路径的脚本保持完整。
- 保留 `/js/config.js`，让已安装的 Worker 有机会完成本次响应并运行清理代码；保留已有图片修复、搜索表单与正常页面资源。

## 验证

新增回归检查在旧版产生 3 项预期失败：新路径拦截、当前加载器移除、新 Worker 注册清理；修复后全部通过。

```sh
node --check scripts/Web_NoAds.js
node tests/web-noads.test.cjs
node tests/jd-price-html.test.cjs
node tests/rain-forecast.test.cjs
```

分别通过 26、10、9 项检查，共 45 项。网页测试包括全部 32 种站点开关组合、搜索事件保留、图片修复边界、正常播放器资源和不相关 Worker 保护。

对当前公开响应进行改写前后对照：

| 响应样本 | HTTP | 保留图片标签 | 修正图片引用 | 已识别加载器 |
| --- | --- | ---: | ---: | --- |
| 首页 | 200 | 12 | 12 | 移除 |
| 详情页 1 | 200 | 29 | 50 | 移除 |
| 详情页 2 | 200 | 29 | 50 | 移除 |
| `/search/test` | 200 | 5 | 5 | 移除 |
| `/?s=test`，服务器重定向至 `/search/test` | 200 | 5 | 5 | 移除 |

最后两项为同一搜索内容的两种入口。每个响应的两个表单、所有 input/button 和 link 标签均保持完整；关闭 4KHD 时原响应保持完整。JSON-LD 等脚本正文按原有边界保留，不进行全局字符串替换。

从首页和两个详情页各抽取一个图片地址，分别检查原始与修正后的地址，共 6 次 HEAD 请求均为 HTTP 200，类型为 `image/jpeg`。因此本次未复现图床不可达；该抽样不代表所有图片或手机网络均正常。

## 手机更新与限制

合并修复后，在 Loon 中同时更新“网页去广告合集”插件和其远程脚本资源，再关闭原网页标签并重新打开。只更新 LPX，或者只更新 JS，均会遗漏一部分修复。保留正常的 MITM 配置和已信任证书。

若旧 Worker 仍控制页面，修复会尝试注销注册、清理 `my-cache` 和 `img-cache` 并刷新。若页面已经卡在 Worker 的 503/清理页，正文注入可能无法执行；此时仅清除浏览器中该站点的网站数据后重开，可能需要重新登录。不要求清除其他网站数据。

未在 iOS/Loon 实机运行；静态响应检查与 VM 测试不能替代手机端实际显示、广告消失和搜索交互验证。其他插件或主配置中的规则仍可能独立影响本站。
