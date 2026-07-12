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

插件依据 2026-07-12 获取的公开静态资源编写，核心目标包括：

- `/interstitial.js`
- `/js/config.js`
- `/js/a1000d.js`
- `pemsrv.com`、`magsrv.com`、`afcdn.net`
- `pfec.uuss.uk`、`online.ssuu.uk`

站点更换资源路径、广告域名或混淆代码后，需要重新进行静态审计。不要通过全局禁止所有外域跳转来修复，否则会破坏正常下载链接和图床。
