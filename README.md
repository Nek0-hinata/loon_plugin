# Loon 配置与插件

这个仓库维护一份经过脱敏与安全整理的 Loon 配置模板，以及覆盖 4KHD、Jable、XVideos、Pornhub 和 PixiBB 的合并去广告、防强制跳转插件。

## 目录

- `config/Loon_Enhanced.example.lcf`：可公开维护的配置模板，不含订阅凭据或 CA 私钥。
- `plugins/Web_NoAds.lpx`：合并五个目标站点的去广告、防强制跳转规则。
- `plugins/JD_Price_HTMLSafe.lpx` 与 `scripts/JD_Price.js`：保留慢慢买京东比价功能的 HTML 拼接修正版。
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

## 京东比价 HTML 修正版

此版本基于可莉分发的 `JD_Price.js`，保留原作者署名。修复范围是价格字段、错误提示的 HTML 转义与正文插入：支持带属性或大写的 `body`，跳过注释和脚本中的伪 `body`，保留 `$&` 等字面文本。无法确认正文插入点时保持原响应。

令牌捕获、慢慢买 V1/V2 请求、价格筛选和显示样式沿用上游逻辑。它不会改变比价所需的第三方请求行为。

本地使用时，将 `scripts/JD_Price.js` 保存为 Loon 可引用的本地脚本 `JD_Price.js`，再导入 `plugins/JD_Price_HTMLSafe.lpx`；其中两个 `script-path` 均须解析到该本地文件。启用修正版时停用原 `JD_Price.lpx`，避免重复比价。单独导入插件不会自动把电脑上的 JS 文件传入 Loon。如果 Loon 未解析到本地脚本，请在该插件的两处脚本引用中选择已保存的 `JD_Price.js`。

自动检查：`node --test tests/jd-price-html.test.cjs`。测试使用合成数据与模拟价格响应，不调用真实慢慢买接口，也不代表手机运行验证。

## 维护原则

- 所有变更通过分支和 PR 审查。
- 禁止提交订阅 URL、代理密码、MITM 私钥、API Token 或真实证书。
- 目标站点更换静态脚本或广告域名后，重新审计公开 HTML/JS，再更新插件规则。
