# AGENTS.md — Splatoon Raider 配装器

## 项目概况
Splatoon 主题配装（Build）编辑器。前端为 vanilla JS 单页应用，**无框架、无构建工具、无 package.json/npm scripts**。后端为 Cloudflare Workers + D1。线上域名 `https://www.jun910.top`。

## 命令
```bash
npx serve .                 # 本地开发 HTTP（必须用 HTTP，file:// 下 Canvas/本地图片会失败）
node tests/rules.test.js    # 核心规则单元测试
node --check app.js core.js data.js library.js showcase.js lanyard-physics.js admin.js mobile-menu.js worker.js _auth.js _plugins.js   # 语法检查（改完必跑）
npx wrangler dev            # 后端本地（需 .dev.vars + 本地库）
npx wrangler d1 execute splatoon-raider-db --local|--remote --file=schema.sql   # 建表（改表结构后执行）
npx wrangler deploy         # 部署到 jun910.top（上线唯一途径；git push 只做 GitHub 备份）
npx wrangler secret put ADMIN_PASSWORD / TOKEN_SECRET   # 部署后若 secret 丢失要重设
npx wrangler secret list    # 登录失败第一步查这里
```

## 架构
- 前端：`index.html`+`app.js`（主页/配装编辑器）、`core.js`（存储/规则/分享编码/DOM `el()`）、`data.js`（VERSION 5 种子，`window.RAIDER_SEED`）、`library/weapon-library/treasure-library.html+js`（数据管理页）、`showcase.html/js`（最终展示）、`admin.html/js`（审核后台）、`lanyard-physics.js`（挂坠 Verlet 物理）、`mobile-menu.js`（≤720px 汉堡菜单）。
- 后端：`worker.js`（`/api/*` 手动分发，其余走 `env.ASSETS`）、`_auth.js`（HMAC token/cookie）、`_plugins.js`（零件校验）。
- 数据库 `splatoon-raider-db`：表 `plugins`（status: pending/approved/rejected，action: create/update/delete，origin_id）+ `plugin_history`。
- 在线流程：库页列表读 `GET /api/plugins`（approved 未软删）；添加/编辑/删除/批量全部**提交 pending**，管理员在 admin.html 通过后生效。

## 数据模型
- catalog/build 存 localStorage：`splatoon-raider-v5-catalog` / `splatoon-raider-v5-build`。
- **`data.js` 的 `VERSION`（=5）绝不能改**：改版本号会清空所有用户数据。
- 不要用导出的 JSON 覆盖 `data.js`；种子与运行时 catalog 是两层来源。
- 品质字段：前端存图片路径（`seed.qualityBorders`），后端 DB 存枚举 key（white/green/purple/gold/rainbow）。

## 关键坑（改代码前必读）
- **`replaceChildren(...arr)` 必须展开数组**：`replaceChildren(arr)` 会变字符串 → `[object HTMLButtonElement]` 乱码。
- **D1 写用 `.run()`，读用 `.all()/.first()`**：漏写会"返回成功但没入库"。
- **Workers assets 模式不认 `functions/` 目录**：路由全在 `worker.js` 手动分发。
- **`styles.css` 有两个 `:root`**（第二个全量覆盖第一个）+ 大量历史覆盖层。新样式**追加到文件末尾**，用足够高的优先级压过旧规则（带 id 的 `!important` 才能赢同 id 旧规则）。
- **库页 `.library-page` class 必须同时在 `<body>` 上**：所有 `<dialog>` 是 `<body>` 直下（不在 `<main>` 内），`.library-page .dialog` 覆盖和 `--library-a/b/c` 变量继承都依赖 body 上的 class。四个库页面 body 目前都带 `library-page library-page--<page>`。
- **品质边框 PNG 不对称**：512px 图内可见边框从 (118,139) 到 (394,416)，上留白大于下留白。因此零件图要 `transform: translateY(8%)`（composite 预览）/`translateY(7%)`（零件卡）与可见边框对齐；成本角标按比例定位（`calc(139/512*100%)`/`calc(118/512*100%)`）。
- **可拖拽交互里的 `<img>` 必须 `draggable="false"` + `pointer-events:none`**（否则原生图片拖拽吞掉事件）；铺满视口的 canvas 必须 `pointer-events:none`。
- `button` 内不能嵌套 `div`（浏览器 DOM 修正导致乱码）。
- Secret 存 Cloudflare Secret（`ADMIN_PASSWORD`/`TOKEN_SECRET`），本地 `.dev.vars`（gitignore）；**不写进代码/git**。
- `.assetsignore` 排除了 `*.glb`、`worker.js`、`schema.sql` 等（不随线上部署，本地 `wrangler dev` 仍可用）。
- 本地库 `--local` 与线上 `--remote` 不互通，测试别灌线上。
- `mobile-nav` 壳必须加载在 `mobile-menu.js` 之前；`hidden` 属性要用 `display:block !important` 压过。
- `.bento-face` 必须自带背景（否则透明）。

## 风格约定
- 页面切换有入场动画；手机端（≤720px）用汉堡菜单替代轮盘/Dock。
- 列表数据共享库用 `fetch('/api/plugins')`，失败回退本地 catalog（离线模式直改 localStorage）。
- 部署/验证后 `git` 状态与线上以 `wrangler deploy` 为准，git push 仅备份。
