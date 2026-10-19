# Loon 配置与插件

这个仓库维护一份经过脱敏与安全整理的 Loon 配置模板，以及覆盖 4KHD、Jable、XVideos、Pornhub 和 PixiBB 的合并去广告、防强制跳转插件。

## 目录

- `config/Loon_Enhanced.example.lcf`：可公开维护的配置模板，不含订阅凭据或 CA 私钥。
- `plugins/Web_NoAds.lpx` 与 `scripts/Web_NoAds.js`：合并五个目标站点的去广告、防推广跳转，可在插件内分别开关。
- `plugins/JD_Price_HTMLSafe.lpx` 与 `scripts/JD_Price.js`：保留慢慢买京东比价功能的 HTML 拼接修正版。
- `docs/SECURITY.md`：敏感信息、DNS 与 MITM 安全注意事项。

## 使用配置

1. 把 `config/Loon_Enhanced.example.lcf` 复制为本地文件，例如 `Loon_Enhanced.local.lcf`。
2. 只在本地文件中替换三条 `example.invalid` 订阅占位符。
3. 在 Loon 内生成并安装 MITM CA；不要把 `ca-p12` 或 `ca-passphrase` 提交到 Git。
4. 导入配置并检查节点筛选结果，尤其是 `US`、`HK`、`JP` 等地区组。

`*.local.lcf`、证书、私钥和 `secrets/` 已由 `.gitignore` 排除。

## 安装合并插件

适用于 Loon 3.5.0。将 `scripts/Web_NoAds.js` 保存到 Loon 可引用的本地脚本中，名称保持 `Web_NoAds.js`，再导入或替换 `plugins/Web_NoAds.lpx`。**两个文件都需要传入 Loon，单独导入 LPX 不会自动安装 JS。** 仓库为私有时，GitHub raw 地址不能供 Loon 匿名下载，使用本地文件即可。

在“网页去广告合集”的插件设置中，分别控制 **4KHD、Jable、XVideos、Pornhub、PixiBB**，默认全部开启。PixiBB 开关同时控制 `hub.pixibb.com`、`sexy.pixibb.com`、`cosplay.pixibb.com`。保存后重新加载网页，已打开页面里的旧脚本不会被开关自动撤回。

开关同时控制本站的广告请求拦截与正文净化。为了让各站点真正独立，已移除原来的全局广告域名 REJECT；改为在开启的网页中移除已识别的广告资源、隐藏广告及阻止推广弹窗，保留第一方广告接口的请求拦截。这不会全局拒绝所有动态跨域广告连接。其他插件、主配置的去广告规则及独立油猴脚本不受这些开关控制。

PixiBB 会移除已核实的整页点击推广脚本，隐藏带 `sponsored` 标记的 Filmxy 推荐横幅和已知推广链接，并拦截推广弹窗、点击和两个推广中转路径。视频 iframe、Plyr、`premium-video-player.js`、`/wp-json/pixibb/v1/video-direct` 均保持原样。插件不写入持久冷却 Cookie，因此不会用长效 Cookie 干扰后续关闭开关。

启用插件后，确认 Loon MITM 证书已受系统信任，并停用旧版本及重复站点插件。站点开关控制本插件的改写行为，MITM 主机名列表仍由插件统一声明。首次访问 4KHD 时，只注销已识别的广告 Service Worker，并在缓存清理后按需刷新；`config.js` 继续放行。

### 从旧版更新：4KHD 搜索与 MissAV 排版

请同时替换 LPX 和 JS，并停用旧版 `Web_NoAds`、独立站点去广告插件及重复油猴脚本后重新加载页面。只关闭现版的站点开关，无法关闭其他插件中的旧规则。

- **4KHD**：旧版拒绝 `/js/config.js` 会触发旧广告 Service Worker 的失败跳转，影响搜索。现版保留该文件及原生搜索表单，放行 `/?s=关键词`、`/search/关键词`，并清理已识别的旧广告 Service Worker。若更新后仍被旧页面控制，可仅清除 4KHD 的网站数据再访问；这会清除该站登录状态和本地设置。
- **4KHD 图片**：2026-10-19 补回被停用的站点脚本中必要的图片地址转换，仅修正页面中已识别的图片、原图链接与图片预览地址，保留尺寸、查询参数和延迟加载。需要更新本地 `Web_NoAds.js` 并重新加载页面；此次图片修复不需要清除网站数据。
- **MissAV**：现版不包含该站的改写、去广告或 MITM 声明。旧版针对 `@click="pop()"` 的替换会吞掉相邻空白，破坏播放器容器标签，因此不要继续叠加启用旧版。若只启用现版仍出现异常，需要结合实际域名与页面检查其他规则、资源加载和站点本身。

检查：`node --test tests/web-noads.test.cjs`，包含五站点的 32 种开关组合、请求拦截、PixiBB 推广及视频保护。另核对公开静态页面，未执行真实播放或手机 UI 测试。参数及脚本格式依据 [Loon 插件文档](https://nsloon.app/docs/Plugin/) 和 [旧版 Script 文档](https://nsloon.app/docs/Script/)。

[2026-10-19 图片与资源测试报告](docs/WEB_RESOURCE_TEST_2026-10-19.md)记录本次修复、16 个公开页面的正文对照、图片资源抽查，以及 Jable/MissAV 防护验证和 Pornhub 个别详情页原样放行的限制。

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
