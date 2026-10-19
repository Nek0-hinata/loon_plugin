# 安全与维护说明

## 不得提交的内容

- 机场或代理订阅 URL，以及其中的 UUID、Token、密码和编码参数。
- `[Mitm]` 下的 `ca-p12`、`ca-passphrase` 或导出的证书私钥。
- GitHub Token、API Key、Cookie、设备标识或真实代理节点密码。

如果这些内容曾进入 Git 历史，仅从最新文件中删除是不够的：应立即轮换凭据，并清理历史后再继续使用仓库。

## DNS

公开模板采用 DoH，并使用 `hijack-dns = *:53` 劫持 App 自定义 UDP 53 查询。模板不配置 `dns-server = system`，因此不会主动把系统 UDP DNS 当作回退解析器。

这不能拦截所有未知的 App 内置 DoH/DoT；HTTPDNS 规则只能覆盖已知服务。DNS 检测页面显示配置的 AliDNS 或 DNSPod 并不等于泄露，若同时出现运营商/路由器 DNS 才需要进一步排查。

## IPv6、STUN 与 QUIC

- `ip-mode = v4-only` 会拒绝 IPv6，降低 IPv6 旁路风险，但牺牲 IPv6 网络兼容性。
- `disable-stun = true` 降低 WebRTC 暴露真实地址的风险，可能影响网页通话和 P2P。
- 模板默认拒绝所有 QUIC，让应用回退到可按规则路由的 TCP/TLS；需要国内 HTTP/3 时可自行评估后调整。

## 代理证书

模板把 `skip-cert-verify` 设为 `false`。若订阅节点因此不可用，应优先要求服务商修复证书，或使用证书/公钥指纹固定，不建议长期跳过验证。

## 4KHD 插件维护

插件依据 2026-08-16 获取的公开静态资源复核，核心目标包括：

- `/interstitial.js`
- `/js/config.js`
- `/js/a1000d.js`
- `pemsrv.com`、`magsrv.com`、`afcdn.net`
- `pfec.uuss.uk`、`online.ssuu.uk`

当前 `/interstitial.js` 同时作为旧 Service Worker 的脚本：页面处理失败时，它会返回包含 `location.href="https://pfec.uuss.uk"` 的 503 HTML。不要直接拒绝它运行期间依赖的 `/js/config.js`，否则会主动触发这条失败路径，并连带破坏 `/?s=关键词` 到 `/search/关键词` 的正常搜索流程。插件保留 `config.js` 仅用于让已安装的旧 Service Worker 完成最后一次页面处理；随后页面注入会注销旧注册、清理其缓存并在需要时自动刷新一次。新的 `/interstitial.js` 和广告渲染器 `/js/a1000d.js` 仍会被阻止。

2026-10-19 复核发现，这个脚本还承担正常图片地址转换：公开 HTML 中的 `i0.wp.com/pic.4khd.com/-…/AAAAA…/*.webp` 需要转换为 `i0.wp.com/yt4.googleusercontent.com/-…/AAAAA…/*.webp`，并还原路径中的 `l/AAAAA` 与 `AsHYQ` 标记。过去只停用整个脚本会丢失这项必要功能。本插件现在仅在 4KHD 的图片属性、原图链接及图片预览元数据中执行已核实的转换，保留原始尺寸和查询参数；不会执行远端混淆脚本或恢复它的广告、统计、域名测速功能，也不添加图片域名的 MITM 或全局重定向规则。测试范围见 [图片与资源测试报告](WEB_RESOURCE_TEST_2026-10-19.md)。

## PixiBB 插件维护

2026-09-13 重新检查的公开静态 HTML 显示，`hub.pixibb.com`、`sexy.pixibb.com` 与 `cosplay.pixibb.com` 使用同一类独立推广脚本：整页点击监听通过 `window.open()` 轮流打开 `/promotion/sexy-cosplay/` 与 `/promotion/sexy-girls/`，已检查的中转页再通过 `window.location.href` 跳到 `happylength.com`。开启 PixiBB 时，插件移除同时包含 `pixibb_ad_cooldown`、`adUrls`、`initAdListeners`、`window.open(targetUrl,...)` 的已识别推广脚本，拦截两个中转路径，并在页面内保护弹窗及推广链接点击。只隐藏带 `sponsored` 标记且目标为 `filmxy.vip/ref/` 的已核实横幅，不隐藏其外围内容区域。

本次检查的 sexy、cosplay 视频页保留了 `myvidplay.com` iframe、`cdn.plyr.io`、站内 `premium-video-player.js` 与 `/wp-json/pixibb/v1/video-direct`。这些资源及此前记录的 `playmogo.com` 不进入广告拦截范围。核对了改写前后的链接、iframe 和播放器脚本，未执行视频播放或付费账号功能操作。

2026-10-19 补充移除 PixiBB 正文里带 `data-aa` 广告位的 `ad.a-ads.com` iframe，仍由 PixiBB 开关控制。不添加该域名的全局拒绝或 MITM 声明，保留播放器 iframe 和正常页面容器。

插件在 Loon 3.5.0 中使用 `[Argument]` 与脚本的 `enable={参数名}` 实现五站独立开关，移除了无条件的全局广告域名拒绝。共享域名过滤现在作用于启用网页的资源标签及弹窗，不是全设备流量拒绝。关闭开关后不会再执行本站的请求或响应脚本；已加载页面需要重新加载，其他插件或油猴脚本仍按其自身设置运行。插件不主动发起网络请求、不保存用户数据，也不设置持久推广冷却 Cookie。

站点更换资源路径、广告域名或混淆代码后，需要重新进行静态审计。不要通过全局禁止所有外域跳转来修复，否则会破坏正常下载链接和图床。
