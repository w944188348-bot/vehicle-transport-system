# 车辆运输系统无效/历史代码审查

日期：2026-07-09

本次先做静态引用和功能入口审查；随后按用户确认执行了低风险清理。结论按风险分为“已清理”“保留兼容”“非运行时代码”。

## 已清理

### 旧入库草稿写入接口

位置：

- `web_server.mjs`：`/api/stock-in-drafts`、`/api/stock-in-drafts/:id/approve`、`/api/stock-in-drafts/:id/reject`
- `mcp/fleet_core.mjs`：`createStockInDraft()`、`approveStockInDraft()`、`rejectStockInDraft()`

判断：

- 前端 `index.html` 已无入库页签和入库表单。
- `app.js` 不再调用 `/api/stock-in-drafts`。
- MCP 工具列表也没有入库工具。
- 当前只剩后端 API 仍可被外部调用，属于历史流程残留。

执行结果：

- 已移除这三个 Web 路由和三个核心写函数。
- 已保留 `stockIns` / `stockInDrafts` 的读取兼容，避免旧数据导入后丢失。
- 已新增 `test/obsolete-cleanup.test.mjs`，防止旧写入入口回流。

### 未使用的旧 Logo 资源

位置：

- `assets/vehicle-transport-logo-v2.png`
- `assets/vehicle-transport-nav-logo.png`

判断：

- 私有产品分支曾使用图片 Logo；公开导出分支已改为纯 CSS 圆形文字标识。
- 测试里明确断言导航不再使用 `vehicle-transport-nav-logo`。
- 全仓库除测试断言外没有运行时引用这两个旧资源。

执行结果：

- 已删除这两个 PNG。
- 公开导出分支不再依赖 PNG Logo。

### Windows 启动脚本

位置：

- `start-web.cmd`
- `start-mcp.cmd`

判断：

- README 已标注为历史 Windows 启动脚本。
- 推荐直接运行 `node web_server.mjs --host 127.0.0.1 --port 8765`。

执行结果：

- 已删除 `start-web.cmd` 和 `start-mcp.cmd`。
- README 已只保留 Node 直启口径。

## 保留兼容，不建议现在删

### `stockIns` / `stockInDrafts` 数据集合和前端归并逻辑

位置：

- `app.js`：`deriveExpenseDrafts()`、`mergeExpenses()`、`syncState()` 中的 `stockInDrafts` / `stockIns`
- `mcp/fleet_core.mjs`：`COLLECTIONS` 中的 `stockInDrafts` / `stockIns`

判断：

- 虽然入库 UI 已移除，但旧数据文件或导入备份里可能仍有 `stockIns` / `stockInDrafts`。
- 当前前端会把旧入库记录归并展示为费用记录，这是数据兼容层。

建议：

- 暂时保留。
- 只有在完成一次数据迁移并确认所有正式数据中不再存在旧入库集合后，才考虑删除。

### 浏览器 `localStorage` 兜底

位置：

- `app.js`：`loadBrowserState()`、`saveAndRefresh()`、`syncState()` 等

判断：

- 当前主要运行方式是 Web 服务 + `data/fleet-data.json`。
- 但 README 仍说明直接打开 `index.html` 时会使用 `localStorage`。
- API 不可用或无权限保存失败时也会暂存到浏览器。

建议：

- 暂时保留。
- 如果后续产品明确不支持双击 HTML / 离线浏览器模式，再统一移除。

### v4.1 / v4.2 / v4.3 注释和字段兼容

位置：

- `app.js`、`mcp/fleet_core.mjs`、`mcp/fleet_mcp_server.mjs` 中多处 `v4.1` 注释和旧字段兼容。

判断：

- 多数是历史字段兼容说明，例如车辆附件、公里数、付款方式、年审/保险字段。
- 这些字段仍在当前业务中使用。

建议：

- 不作为废弃代码删除。
- 后续可以只做注释清理，把“v4.1 新增”改成当前业务语义，降低阅读噪音。

## 非运行时代码/产物

### `output/`

判断：

- 包含 Playwright 截图、审查截图、PPT 预览图等生成产物。
- 当前已被项目规则列为未跟踪项，不应纳入普通代码提交。

执行结果：

- 已按用户本轮“清理所有无用的代码和不需要的东西”要求删除本地未跟踪 `output/`。
- 未纳入 git 提交。

### `docs/skills/`

判断：

- 项目规则已说明这是当前已知未跟踪项。
- 看起来是项目内技能草稿，不属于车辆系统运行时代码。

执行结果：

- 已按用户本轮清理要求删除本地未跟踪 `docs/skills/`。
- 未纳入 git 提交。

### PPT 与演示图片

位置：

- `docs/车辆运输系统-v5.0-使用说明与功能亮点.pptx`
- `docs/车辆运输系统-v5.0-发布会版产品介绍.pptx`
- `assets/presentation/`

判断：

- 不参与运行时页面。
- 属于交付/演示资料。

建议：

- 当前公开导出分支只保留运行源码，PPT、演示截图和大图片素材迁移到私有发布资料目录。

## 已执行清理顺序

1. 删除旧入库写入接口和核心函数，但保留旧数据读取归并。
2. 删除未使用旧 Logo 资源。
3. 删除 Windows `.cmd` 历史脚本。
4. 删除未跟踪 `output/` 和 `docs/skills/`。
5. 保留 PPT 和演示素材；这些是交付资料，不是无效运行代码。
