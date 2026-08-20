# Loon 配置与插件

这个仓库维护一份经过脱敏与安全整理的 Loon 配置模板，以及覆盖 4KHD、Jable、XVideos、Pornhub 和 PixiBB 的合并去广告、防强制跳转插件。

## 目录

- `config/Loon_Enhanced.example.lcf`：可公开维护的配置模板，不含订阅凭据或 CA 私钥。
- `plugins/Web_NoAds.lpx`：合并五个目标站点的去广告、防强制跳转规则。
- `docs/SECURITY.md`：敏感信息、DNS 与 MITM 安全注意事项。

## 使用配置

1. 把 `config/Loon_Enhanced.example.lcf` 复制为本地文件，例如 `Loon_Enhanced.local.lcf`。
2. 只在本地文件中替换三条 `example.invalid` 订阅占位符。
3. 在 Loon 内生成并安装 MITM CA；不要把 `ca-p12` 或 `ca-passphrase` 提交到 Git。
4. 导入配置并检查节点筛选结果，尤其是 `US`、`HK`、`JP` 等地区组。

`*.local.lcf`、证书、私钥和 `secrets/` 已由 `.gitignore` 排除。

## 安装合并插件

合并本仓库 PR 后，可使用以下稳定地址：

```text
https://raw.githubusercontent.com/Nek0-hinata/loon_plugin/main/plugins/Web_NoAds.lpx
```

启用插件后，确认 Loon MITM 证书已受系统信任，并删除或停用原来的三个独立插件，避免重复改写。首次访问 4KHD 时，插件会注销旧 Service Worker，并在需要时自动刷新一次以解除旧控制。如仍停留在 `pfec.uuss.uk`，返回 4KHD 再打开一次；只有仍然循环跳转时才需要清除一次对应网站数据。

## 安装 PixiBB 油猴脚本

油猴脚本位于 `userscripts/PixiBB_NoRedirect.user.js`。发布到主分支后，可在 Tampermonkey 中打开以下地址安装：

```text
https://raw.githubusercontent.com/Nek0-hinata/loon_plugin/main/userscripts/PixiBB_NoRedirect.user.js
```

脚本只覆盖 `hub.pixibb.com` 和 `sexy.pixibb.com`：通过站点自身的冷却 Cookie 停止全页点击广告，并精确拦截两个推广中转路径；不会改写视频 iframe、Plyr、播放器脚本或媒体接口。它可独立使用，也可与 Loon 合并插件同时启用。

## 维护原则

- 所有变更通过分支和 PR 审查。
- 禁止提交订阅 URL、代理密码、MITM 私钥、API Token 或真实证书。
- 目标站点更换静态脚本或广告域名后，重新审计公开 HTML/JS，再更新插件规则。
