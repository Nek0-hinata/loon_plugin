# Loon 配置与插件

这个仓库维护一份经过脱敏与安全整理的 Loon 配置模板，以及针对 4KHD 的去广告、防强制跳转插件。

## 目录

- `config/Loon_Enhanced.example.lcf`：可公开维护的配置模板，不含订阅凭据或 CA 私钥。
- `plugins/4KHD_NoAds.lpx`：阻止 4KHD Service Worker 广告注入、Popunder 和图片强制新开页。
- `plugins/MissAV_NoAds.lpx`：移除 MissAV 播放器点击弹窗、页面广告，并拦截广告跳转域名。
- `plugins/18Comic_NoAds.lpx`：清理 18Comic 弹层、横幅、浮动及底部广告，并阻止跨域强制弹窗。
- `docs/SECURITY.md`：敏感信息、DNS 与 MITM 安全注意事项。

## 使用配置

1. 把 `config/Loon_Enhanced.example.lcf` 复制为本地文件，例如 `Loon_Enhanced.local.lcf`。
2. 只在本地文件中替换三条 `example.invalid` 订阅占位符。
3. 在 Loon 内生成并安装 MITM CA；不要把 `ca-p12` 或 `ca-passphrase` 提交到 Git。
4. 导入配置并检查节点筛选结果，尤其是 `US`、`HK`、`JP` 等地区组。

`*.local.lcf`、证书、私钥和 `secrets/` 已由 `.gitignore` 排除。

## 安装 4KHD 插件

合并本仓库 PR 后，可使用以下稳定地址：

```text
https://raw.githubusercontent.com/Nek0-hinata/loon_plugin/main/plugins/4KHD_NoAds.lpx
```

启用插件后，确认 Loon MITM 证书已受系统信任。彻底关闭浏览器后重新打开 4KHD；首次访问会注销旧 Service Worker。如仍有旧跳转，清除一次 `4khd.com` 的网站数据。

## 安装 MissAV 插件

合并本仓库 PR 后，可使用以下稳定地址：

```text
https://raw.githubusercontent.com/Nek0-hinata/loon_plugin/main/plugins/MissAV_NoAds.lpx
```

启用插件并确认 MITM 证书受系统信任，然后彻底关闭并重新打开浏览器。插件只针对已确认的 `/pop` 播放器弹窗和广告域名，不会禁止站内正常页面跳转。

## 安装 18Comic 插件

合并对应 PR 后，可使用以下稳定地址：

```text
https://raw.githubusercontent.com/Nek0-hinata/loon_plugin/main/plugins/18Comic_NoAds.lpx
```

启用插件并确认 MITM 证书受系统信任，然后彻底关闭并重新打开浏览器。该插件保留 `18comic.vip` 站内新页面，只阻止脚本新开的跨域页面。

## 维护原则

- 所有变更通过分支和 PR 审查。
- 禁止提交订阅 URL、代理密码、MITM 私钥、API Token 或真实证书。
- 4KHD 更换静态脚本或广告域名后，重新审计公开 HTML/JS，再更新插件规则。
