# 车辆运输管理系统 UI 设计合同

## UI Direction

Product type: 车队经营管理后台 / 私有部署业务系统。

Reference styles: Notion/Airtable 的信息组织，Linear/Vercel 的克制层级。

Visual keywords: 清晰、可信、耐看、紧凑、表格友好、中文可读。

Component base: 保留现有静态 HTML、CSS、原生 JavaScript，不引入新 UI 库。

Avoid: 大面积营销感渐变、装饰性卡片堆叠、过度毛玻璃、随机按钮颜色、只适合演示的空白页面。

## Brand And Tone

- 系统面向泵车、混凝土罐车、调度、会计和经营者，不做花哨展示。
- 页面第一目标是降低录入、查账、审核和回款动作的认知负担。
- 文案用业务语言：运输台账、客户欠账、待审核、正式记录、证照到期。
- 危险动作必须用清晰的危险色和确认流程，不用含糊按钮。

## Color Tokens

- Background: `#eef3f6`，配浅色业务系统背景。
- Surface: 白色或半透明白，用于 header、panel、table。
- Text: `#17212b`，主正文。
- Muted: `#657383`，说明文字。
- Primary: `#0f766e`，主按钮、重点状态和焦点。
- Primary strong: `#0b5c57`，主按钮 hover 和强调。
- Accent: `#b57927`，计算、导入、次级业务动作。
- Danger: `#b42318`，删除、退出、过期、驳回。
- Success: `#1f7a4d`，通过、启用、正常状态。

## Typography

- 字体栈保持系统字体：`-apple-system`, `BlinkMacSystemFont`, `SF Pro Text`, `PingFang SC`, `Microsoft YaHei`, `Arial`, `sans-serif`。
- 基准字号 15px，表格和辅助文字可用 13px。
- 中文按钮和表头使用 700-800 字重，但不要通过负字距制造紧张感。
- 卡片内标题小于页面标题，避免每个区域都像首页大标题。

## Layout

- 页面最大宽度为 1440px，桌面端保留左右 24px 内边距。
- 圆角以 8px 为主，表单控件 6px，附件小标签 4px。
- 面板之间使用 14px-18px 间距，避免卡片套卡片。
- 主页面按“总览 -> 常用入口 -> 动态/欠账 -> 到期提醒”的顺序组织。
- 表单按业务分区，长表单优先用 fieldset 或视觉小节分组。

## Controls

- Primary button: 只用于保存、提交、登录、导出等主动作。
- Secondary button: 计算、导入、复制等辅助但有业务价值动作。
- Ghost button: 返回、清空、切换、查看等低风险动作。
- Danger button: 删除、退出、恢复演示数据、禁用等需要谨慎的动作。
- 所有按钮保持稳定高度，不因文字变化导致布局跳动。

## Tables

- 表头必须清晰、稳定、可扫描。
- 金额、欠款、应收、已收等财务字段尽量右对齐。
- 状态使用 badge，不只依赖文字颜色。
- 操作按钮要区分主次，避免每个按钮视觉权重相同。
- 空状态要说明下一步，例如“请先添加车辆”或“去录入运输”。

## Forms

- 输入框和下拉框最小高度 40px，移动端保持可点击。
- 表单标签使用短业务名，placeholder 只做示例，不替代表单标签。
- 文件上传、证照、保险等复杂区块必须分组显示。
- 重要提交动作放在表单底部，并与清空、计算类动作区分。

## Responsive

- 1180px 以下统计卡片和快捷入口降列。
- 760px 以下 header、section head、panel head 改为纵向布局。
- 表格允许横向滚动，但关键字段放在左侧。
- 手机端按钮允许换行，占满可用宽度时仍保持清晰。

## Motion And Effects

- 动效只用于 hover、active、toast、focus，时间控制在 0.16s-0.2s。
- 支持 `prefers-reduced-motion`，不要依赖动画传达关键状态。
- 毛玻璃可以保留在主 shell，但用户管理和表格区域应优先可读性。

## Verification Expectations

- 修改后至少运行现有 Node 测试。
- 需要启动 `node web_server.mjs --host 127.0.0.1 --port 8765` 做浏览器检查。
- 检查桌面和移动宽度下：登录页、总览、每日运输、车辆管理、用户管理。
- 不应出现中文文字重叠、按钮溢出、表格不可滚动、控制台关键错误。
