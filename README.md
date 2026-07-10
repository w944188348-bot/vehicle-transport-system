# 商砼站车辆运输管理系统

一个面向 **商砼站、混凝土搅拌站、混凝土运输车队** 的轻量级自托管管理系统。系统覆盖泵车、混凝土罐车、每日运输台账、客户欠款、车辆费用、人员工资、审核流和经营汇总，并提供浏览器页面、本地 HTTP API 和 MCP 工具，方便后续接入本地 Agent 或企业工作流。

> English name: Vehicle Transport Management System

本项目适合私有部署。源码可以公开分享，但真实业务数据、客户资料、车辆档案、合同、发票、凭据和部署记录不应该提交到仓库。

## 适用场景

- 商砼站 / 混凝土站管理泵车、罐车和司机。
- 记录每日运输、泵送、方量、趟数、公里数、超时时间和现场收款。
- 按客户统计应收、已收、欠款和预收款。
- 管理油费、维修费、保险、保养、过路费等支出。
- 管理人员档案和月度工资。
- 会计提交草稿，管理员审核通过后进入正式记录。
- 老板查看月度经营总览、欠账排行、车辆使用和到期提醒。
- 通过 MCP 工具让 Agent 查询、录入或汇总业务数据。

## 主要功能

- 车辆管理：记录泵车、混凝土罐车、司机、年审、强制险、商业险、超赔险等信息。
- 每日运输：记录施工单位、工程名称、车辆、司机、方量、趟数、泵送/运输收入、付款方式等。
- 客户管理：维护客户档案、合同附件、报价配置、欠款和回款。
- 支出费用：记录油费、维修费、保养、保险、过路费等费用。
- 人员及工资：维护人员档案，按月登记工资。
- 审核管理：支持运输、费用、工资、回款等草稿审核。
- 通知与提交草稿：区分待审草稿和驳回通知。
- 月度总览：展示收入、回款、费用、工资、毛利润、欠账排行和到期提醒。
- 数据备份：支持 JSON 导入导出和月度 CSV 导出。
- MCP 工具：可供本地 Agent 或自动化流程调用。
- 企业 Agent 辅助：只读生成经营报告，保单文本生成保险更新草稿，管理员确认后才写入车辆保险字段。

## 目录结构

```text
.
├── app.js                         # 浏览器端主逻辑
├── index.html                     # 主页面
├── login.html                     # 登录页
├── users.html                     # 用户管理页
├── styles.css                     # 页面样式
├── web_server.mjs                 # 本地 HTTP 服务和 API 路由
├── mcp/
│   ├── auth.mjs                   # 本地认证逻辑
│   ├── fleet_core.mjs             # 核心数据读写和业务计算
│   ├── fleet_mcp_server.mjs       # MCP stdio 服务
│   ├── fleet_agent.mjs            # Agent 报告和草稿能力
│   └── fleet_agent_cli.mjs        # Agent 命令行入口
├── test/                          # 自动测试
└── data/.gitkeep                  # 运行数据目录占位文件
```

## 环境要求

- Node.js，需要支持 ES modules。
- 现代浏览器，例如 Chrome、Edge、Safari。

当前仓库不需要安装 npm 依赖，使用的是 Node.js 内置模块和 `node:test`。

## 本地启动

在仓库根目录运行：

```bash
node web_server.mjs --host 127.0.0.1 --port 8765
```

然后打开：

```text
http://127.0.0.1:8765
```

使用本地 HTTP 服务启动时，系统会读写 `data/` 目录下的运行数据。首次使用时，系统可能会在 `data/` 下生成本地认证密钥和一次性管理员凭据文件。这些文件只属于本地部署，不要提交到 Git，也不要截图公开。

也可以直接用浏览器打开 `index.html`，但这种方式只使用浏览器本地存储，不会和 HTTP API 或 MCP 服务共享数据。

## 数据安全

仓库只保留 `data/.gitkeep`，其他 `data/` 运行文件默认被 `.gitignore` 排除。

不要提交或公开：

- 真实客户、员工、车辆、合同、发票、付款和附件数据
- 自动生成的认证文件
- cookie、token、密钥、密码哈希和部署凭据
- 私有部署路径、备份路径、主机名和内网地址
- 运行日志、数据库快照、压缩包和临时发布文件

演示、截图、测试和 issue 里请使用虚拟数据。

## MCP 工具

MCP 服务入口是：

```text
mcp/fleet_mcp_server.mjs
```

主要工具包括：

- `fleet_summary`：查看月度经营摘要。
- `list_vehicles` / `upsert_vehicle`：查询或维护车辆。
- `list_customers` / `upsert_customer`：查询或维护客户。
- `record_transport_job` / `list_transport_jobs`：录入或查询每日运输。
- `record_vehicle_expense` / `list_vehicle_expenses`：录入或查询车辆费用。
- `record_customer_payment` / `list_customer_payments`：登记或查询客户回款。
- `record_salary` / `list_salaries`：登记或查询工资。
- `customer_balance_report`：查看客户欠款排行。
- `export_data`：导出完整本地数据。
- `delete_record`：删除支持的记录，并保护有关联的车辆和客户。
- `agent_business_report`：只读生成经营报告。
- `agent_create_insurance_policy_draft`：根据保单 OCR 文本或提取文本生成保险更新草稿。
- `agent_approve_insurance_policy_draft`：管理员确认后，将保险草稿写入车辆保险字段。
- `agent_feishu_webhook_preview`：模拟内部消息触发的 Agent 动作，不外发正式消息。

示例配置见 [hermes-mcp-config.example.json](hermes-mcp-config.example.json)。实际部署时，请复制到仓库外部并改成自己的本地路径。

## Agent 命令行示例

生成本月经营报告：

```bash
node mcp/fleet_agent_cli.mjs report --month 2026-07
```

根据保单 OCR 文本生成保险更新草稿：

```bash
node mcp/fleet_agent_cli.mjs insurance-draft --file ./policy-ocr.txt --filename policy.pdf
```

确认已审核的保单草稿：

```bash
node mcp/fleet_agent_cli.mjs approve-insurance-draft --draft-id agt_xxx
```

使用临时数据运行 Agent 预检查：

```bash
node mcp/fleet_agent_preflight.mjs
```

Agent 能力遵循“先生成草稿，再人工确认”的原则。经营报告只读；保单识别只生成草稿；正式写入车辆保险字段必须经过管理员确认。

## 验证命令

语法检查：

```bash
node --check app.js
node --check web_server.mjs
node --check mcp/fleet_core.mjs
node --check mcp/fleet_mcp_server.mjs
```

完整测试：

```bash
node --test test/*.mjs mcp/fleet_core.test.mjs
```

如果修改了页面，建议本地启动服务后用浏览器检查相关页面。

## 开源边界

这个仓库是源码版，不包含真实业务数据和私有部署历史。公开版本移除了 PPT、演示图和大图片素材，页面使用纯 CSS 标识，方便源码审查和二次开发。

如果你要用于真实商砼站或混凝土站，请先在本地或私有服务器部署，并做好 `data/` 目录备份和访问控制。

## 贡献

请阅读 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 安全

请阅读 [SECURITY.md](SECURITY.md)。不要在 issue、PR、截图或示例文件里包含真实业务数据、运行数据或部署凭据。

## 许可证

MIT License。详见 [LICENSE](LICENSE)。
