# 降雨预报助手

这个 Loon 插件提供独立的未来降水地图与逐小时预报，可与彩云天气普通版及 `ColorfulClouds_remove_ads.lpx` 去广告插件同时使用。当前交付的是备用页面，**尚未解锁或替换彩云 App 内的原生 3h / 48h 降水地图**。

## 安装与打开

适用于 Loon 3.5.0 及以上版本。在 Loon 的插件管理中，通过 URL 添加：

```text
https://raw.githubusercontent.com/Nek0-hinata/loon_plugin/main/plugins/Rain_Forecast.lpx
```

1. 启用插件、重写与 MITM，并确认已在 iOS 设置中信任 Loon 的 MITM 证书。无需把 API Key、会员 Token 或 Cookie 填入插件。
2. 在插件详情点击打开链接，或使用 Safari 打开下方页面。`#!openUrl` 在不同版本界面中的显示位置可能不同，可始终使用页面地址。
3. 默认显示北京。可以在插件参数中设置默认 WGS84 坐标，也可以在页面搜索城市、输入坐标或点击“我的位置”。浏览器里手动选择的地点优先于插件默认值，保存在此页面的本地存储中；要更改地点，可直接在页面重新选择。
4. 拖动 Windy 地图底部时间轴，或点击地图内播放按钮查看未来雨带。下面的数值预报支持 24 / 48 个逐小时时段。

页面地址：

```text
https://raw.githubusercontent.com/Nek0-hinata/loon_plugin/main/web/Rain_Forecast.html
```

页面文件由同一仓库公开提供。Loon 只对上述**精确文件路径**改写 HTML 响应类型，并注入插件的默认地点设置；不会改写其他 GitHub 文件。没有开启插件时，GitHub Raw 可能显示 HTML 源码或禁止执行脚本，属于预期行为。若看到源码，检查插件是否启用、MITM 证书是否受信任，以及主配置是否跳过了 `raw.githubusercontent.com` 的 MITM。

插件与脚本通过远程 HTTPS 获取。更新仓库后，在 Loon 中更新插件及脚本资源，再刷新页面。页面本身的响应设为 `no-store`。保留已有彩云去广告插件即可，两者处理的请求路径不同。

## 数据的含义

- **地图**：使用 [Windy 官方嵌入地图](https://embed.windy.com/config/map) 的 `rain` 降水预报图层，默认 ECMWF，可在插件中选 GFS / ICON。保留 Windy 原有时间轴、来源与署名，地图内图例和单位以 Windy 显示为准。不是把历史雷达帧向未来平移。
- **逐小时数值**：使用 [Open-Meteo Forecast API](https://open-meteo.com/en/docs)，自动选择该地区的天气模式。它与 Windy 的选定模式不一定一致，因此两个视图可能存在差异。
- **时间和单位**：显示所选地点的当地时间。降水量是每个时间点**此前一小时**的累计值，单位 mm，包含雨、阵雨与雪水当量；不是瞬时降雨强度。仅选取结束时间在当前时刻之后的时段，首段可能部分已经过去。48 时段不是精确从当前分钟开始的连续 48 小时。
- **缺失或失败**：缺失值显示为 `—`，不按零降水计算；部分数据累计显示 `≥`。请求失败时显示错误，刷新失败只保留同一地点的上一份数据，并标注获取时间。切换地点时先清除旧数值。获取时间不代表模式起报时间。
- **精度**：这些来源适合查看未来雨带和小时级趋势，不能等同于彩云分钟级雷达外推。中国地区不会把全球模式的小时级数据插值后伪称为真实分钟级预测。
- **使用范围**：Open-Meteo 的免 Key 公共服务面向个人、非商业使用，受其调用限制约束。页面在打开、切换地点或手动刷新时请求数据，不轮询；商业使用需按数据方条款办理。

官方参考：[Windy 嵌入设置](https://embed.windy.com/config/map)、[Open-Meteo 数据与时段说明](https://open-meteo.com/en/docs)、[Open-Meteo 使用条款](https://open-meteo.com/en/terms)。

## 原生地图接入进展

2026-10-20 调研时，用户使用最新版彩云天气普通版，未提供确切版本号或该版本的地图接口响应。旧脚本中常见的 `nafp/origin_images`、`satellite` 规则不能证明覆盖截图中的短时降水地图；会员信息重写也不能证明取得了未来帧。

同时实测 [RainViewer 公开接口](https://api.rainviewer.com/public/weather-maps.json) 返回历史帧，`radar.nowcast` 为空，其[官方迁移说明](https://www.rainviewer.com/api/transition-faq.html)也说明停止公开未来帧。因此本版本没有将 RainViewer 当成未来预报源。

彩云公开的[雷达预报接口](https://docs.caiyunapp.com/weather-api/v1/6-radar.html)需要相应 API 权限，不能把普通天气 API Token 或 App 会员状态当作已获接口权限。接入其他来源的原生地图还需核对客户端使用的索引格式、图像投影、边界、时间戳、颜色和鉴权。未取得手机端证据前，不发布猜测字段或拼接假预测帧的替换规则。

### 可选：只读接口诊断

如果继续适配原生图，可另行安装诊断插件：

```text
https://raw.githubusercontent.com/Nek0-hinata/loon_plugin/main/plugins/Caiyun_Radar_Diagnostics.lpx
```

安装并启用后，打开彩云 App 的降水图、切换 3h / 48h，查看 Loon 中“彩云降水接口结构”的脚本日志，筛选以 `[Rain Forecast] Native schema` 开头的行。诊断仅覆盖已知的 `api` / `wrapper` 域名下 `radar`、`nafp`、`satellite` 路径。新版若使用其他路径或无法 MITM，可能没有日志；这不等于没有相关请求。

日志只含接口类别、HTTP 状态和白名单字段的类型/数组长度；不包含请求头、查询参数、完整 URL、坐标、字段内容或凭据。它不会更改原响应，也不会保存或上传日志。诊断完成后可停用或删除此插件。

继续适配时，先提供精确 App 版本号及上述经过裁剪的日志即可。**不要分享完整抓包、Token、Cookie 或 Authorization 头。** 结构日志可能仍不足以判断图像投影和时间含义，需进一步核对；当前不承诺原生替换可行。

## 隐私与网络

备用页面不会读取彩云账户、会员凭据或 App 位置。默认坐标来自插件参数；点击定位后才向浏览器申请位置权限。所选地点只保存在浏览器 `localStorage`，查询时坐标会发往 Windy 和 Open-Meteo，搜索词会发往 Open-Meteo 的城市搜索接口。不会把地点写入仓库。地图内数据由 Windy 自行加载。

备用插件仅声明 `raw.githubusercontent.com` 的 MITM；独立诊断插件才声明彩云接口域名。没有强制修改代理节点、DNS 或全局路由。Windy 或 Open-Meteo 如果在当前网络不可达，可以用现有 Loon 分流规则选择可达线路；插件不会擅自改变这些设置。

## 验证

```text
node --test tests/*.test.cjs
```

测试覆盖响应作用域、HTML 配置转义、原生诊断不泄露字段值、单次 `$done`、时段语义、缺失值、过期与异常数据、地图图层和坐标验证。另做移动浏览器预览及真实数据源连通性核对。普通浏览器验证不能替代 iPhone 上的 Loon 导入、MITM 和 App 实测，交付时需单独注明结果。

可选的浏览器交互检查需要安装 Playwright 和 Chromium。默认使用 `/usr/bin/chromium`，可通过 `RAIN_CHROMIUM_PATH` 指定浏览器：

```text
node tests/rain-forecast.browser.cjs
node tests/rain-forecast.browser.cjs --live
```

第一条使用模拟数据检查搜索、失败恢复、定位触发和地点切换时的并发请求；第二条实际访问数据源，检查未来时段、Windy 播放按钮与时间轴推进。实时检查依赖外部服务及当前网络。[本次验证记录](RAIN_FORECAST_VALIDATION_2026-10-20.md)列明实际通过的检查与未验证事项。
