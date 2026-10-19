# Loon 配置与插件

本仓库提供 Loon 配置示例、网页去广告与防推广跳转插件，以及保留京东比价功能的 HTML 修正版。配置示例不包含个人订阅凭据或证书私钥。

## 网页插件订阅

适用于 Loon 3.5.0 及以上版本。在 Loon 的插件管理中，通过 URL 添加：

```text
https://raw.githubusercontent.com/Nek0-hinata/loon_plugin/main/plugins/Web_NoAds.lpx
```

插件通过远程 HTTPS 地址引用 `scripts/Web_NoAds.js`，无需另行导入本地脚本。后续通过 Loon 的资源更新功能获取插件和脚本；不是每次打开网页都即时下载。更新后重新加载网页。

如果原来使用本地版，请停用旧插件及重复的同站点规则，再通过上述 URL 添加远程插件。仅更新原来的本地 JS 不会建立远程插件订阅。使用前需在 Loon 中配置并信任 MITM 证书。

### 功能与开关

在“网页去广告合集”设置中，可分别控制 4KHD、Jable、XVideos、Pornhub 和 PixiBB，默认全部开启。PixiBB 覆盖 `hub.pixibb.com`、`sexy.pixibb.com` 与 `cosplay.pixibb.com`。

- 4KHD 保留搜索功能并修正已识别的图片地址，同时阻止广告脚本。
- PixiBB 移除已识别的推广脚本、赞助横幅和广告 iframe，保护正常播放器资源。
- 每站开关同时控制本插件对本站的请求拦截和正文处理。其他插件、主配置和独立油猴脚本需分别管理。
- 本插件没有无条件的全局广告域名拒绝，不保证拦截所有动态广告。关闭开关后需重新加载页面；MITM 主机名仍由插件统一声明。

当前插件不处理 MissAV 或 18Comic。遇到无法安全解析的 HTML 时，保留原响应。

## 其他文件

- `config/Loon_Enhanced.example.lcf`：配置示例。复制为本地文件后填写自己的订阅，并在 Loon 内生成证书；不要将填写后的文件上传到仓库。
- `plugins/JD_Price_HTMLSafe.lpx` 与 `scripts/JD_Price.js`：京东比价 HTML 修正版。保留上游署名、价格请求及显示功能，修正外部字段转义和正文插入。此插件目前仍引用本地 `JD_Price.js`，需同时导入这两个文件，并停用旧版京东比价插件。
- `userscripts/PixiBB_NoRedirect.user.js`：可选的独立油猴脚本，覆盖 hub 与 sexy 子站；其设置独立于 Loon 插件。
- [安全与维护说明](docs/SECURITY.md)：配置、DNS、证书与资源过滤边界。
- [图片与资源测试报告](docs/WEB_RESOURCE_TEST_2026-10-19.md)：公开静态页面核对结果及验证限制。

## 验证与维护

```text
node --test tests/web-noads.test.cjs tests/jd-price-html.test.cjs
```

本地检查覆盖站点开关、图片修正、搜索及播放器资源保护、京东比价 HTML 拼接，不代表手机端显示或真实播放验证。

变更通过分支和 PR 维护。不要提交机场订阅凭据、节点密码、Token、Cookie、证书或私钥。`*.local.lcf`、证书、`secrets/` 和本地测试下载目录已由 `.gitignore` 排除。
