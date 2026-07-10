import readline from "node:readline";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  DATA_PATH,
  customerBalances,
  deleteRecord,
  listRecords,
  listVehicles,
  loadData,
  monthlySummary,
  recordCustomerPayment,
  recordSalary,
  recordTransportJob,
  recordVehicleExpense,
  textSummary,
  upsertCustomer,
  upsertVehicle,
} from "./fleet_core.mjs";
import { approveInsurancePolicyDraft, createInsurancePolicyDraft, generateBusinessReport, handleFeishuWebhookPreview } from "./fleet_agent.mjs";

const SERVER_NAME = "vehicle-transport-management";
const SERVER_VERSION = "0.1.0";
const PROTOCOL_VERSION = "2025-06-18";

function schema(properties, required = []) {
  return { type: "object", properties, required, additionalProperties: false };
}

export const TOOLS = {
  agent_business_report: {
    description: "企业化 Agent 安全工具：只读生成老板经营日报/月报、欠账风险、车辆成本和证照到期提醒，不修改正式业务数据。",
    inputSchema: schema({
      month: { type: "string", description: "月份，格式 YYYY-MM；默认本月" },
      question: { type: "string", description: "老板的经营问题，可为空" },
    }),
  },
  agent_create_insurance_policy_draft: {
    description: "企业化 Agent 安全工具：根据保单 OCR/文本生成车辆保险更新草稿，待管理员确认后才可写入正式车辆档案。",
    inputSchema: schema({
      filename: { type: "string", description: "保单附件文件名或来源名" },
      text: { type: "string", description: "OCR 或人工粘贴的保单文本" },
    }, ["text"]),
  },
  agent_approve_insurance_policy_draft: {
    description: "企业化 Agent 审批工具：管理员确认保单草稿后，将草稿中的保险字段写入匹配车辆档案。",
    inputSchema: schema({
      draft_id: { type: "string", description: "Agent 保单草稿 ID" },
    }, ["draft_id"]),
  },
  agent_feishu_webhook_preview: {
    description: "企业化 Agent 飞书试点预览工具：模拟飞书消息入口，生成经营报告或保单识别草稿；不发送外部消息。",
    inputSchema: schema({
      text: { type: "string", description: "飞书消息文本" },
      month: { type: "string", description: "经营报告月份 YYYY-MM" },
      filename: { type: "string", description: "保单文件名" },
      policy_text: { type: "string", description: "保单 OCR 文本" },
      open_id: { type: "string", description: "飞书用户 open_id" },
      name: { type: "string", description: "飞书用户名" },
    }),
  },
  fleet_summary: {
    description: "查看指定月份的运输经营摘要、费用、工资、毛利润和客户欠账排行。",
    inputSchema: schema({ month: { type: "string", description: "月份，格式 YYYY-MM；默认本月" } }),
  },
  list_vehicles: {
    description: "列出车辆档案，可按状态、类型或关键词过滤。",
    inputSchema: schema({
      search: { type: "string", description: "车牌、司机、型号关键词" },
      status: { type: "string", description: "正常、维修中、停用" },
      type: { type: "string", description: "混凝土罐车或泵车" },
    }),
  },
  upsert_vehicle: {
    description: "新增或更新车辆档案。更新时传 id 或 vehicle_id。v4.1 起支持年审 + 三类保险 + 4 张年审照片。",
    inputSchema: schema({
      id: { type: "string" },
      vehicle_id: { type: "string" },
      plate: { type: "string", description: "车牌号" },
      vehicle_plate: { type: "string" },
      type: { type: "string", description: "混凝土罐车或泵车" },
      model: { type: "string" },
      driver: { type: "string" },
      status: { type: "string", description: "正常、维修中、停用" },
      start_date: { type: "string", description: "YYYY-MM-DD" },
      note: { type: "string" },
      // v4.1 新增
      inspection_expiry: { type: "string", description: "年审到期日 YYYY-MM-DD" },
      inspection_photos: {
        type: "array",
        description: "最多 4 张年审照片文件名（已通过 /api/upload 上传）",
        items: { type: "string" },
        maxItems: 4,
      },
      compulsory_company: { type: "string", description: "强制险保险公司" },
      compulsory_policy_no: { type: "string", description: "强制险保单号" },
      compulsory_pdf: { type: "string", description: "强制险 PDF 文件名" },
      commercial_company: { type: "string", description: "商业险保险公司" },
      commercial_policy_no: { type: "string", description: "商业险保单号" },
      commercial_pdf: { type: "string", description: "商业险 PDF 文件名" },
      excess_company: { type: "string", description: "超配（超额）险公司" },
      excess_policy_no: { type: "string", description: "超配险保单号" },
      excess_pdf: { type: "string", description: "超配险 PDF 文件名" },
    }),
  },
  list_customers: {
    description: "列出客户档案，默认包含累计应收、已收和欠款。",
    inputSchema: schema({
      search: { type: "string", description: "客户名、联系人、电话关键词" },
      include_balances: { type: "boolean", description: "是否附带欠账汇总，默认 true" },
    }),
  },
  upsert_customer: {
    description: "新增或更新客户档案。更新时传 id 或 customer_id。",
    inputSchema: schema({
      id: { type: "string" },
      customer_id: { type: "string" },
      name: { type: "string", description: "客户名称" },
      customer_name: { type: "string" },
      contact: { type: "string" },
      phone: { type: "string" },
      credit_limit: { type: "number" },
      note: { type: "string" },
    }),
  },
  record_transport_job: {
    description: "登记每日运输或泵送记录。可用 vehicle_id/vehicle_plate 和 customer_id/customer_name 定位。支持单据编号、公里数和付款方式。",
    inputSchema: schema({
      id: { type: "string", description: "传入则更新同 id 记录" },
      date: { type: "string", description: "YYYY-MM-DD，默认今天" },
      document_no: { type: "string", description: "单据编号" },
      vehicle_id: { type: "string" },
      vehicle_plate: { type: "string" },
      customer_id: { type: "string" },
      customer_name: { type: "string" },
      create_customer_if_missing: { type: "boolean" },
      customer_contact: { type: "string" },
      customer_phone: { type: "string" },
      driver: { type: "string" },
      work_type: { type: "string", description: "混凝土运输、泵送服务、运输+泵送等" },
      site: { type: "string", description: "施工单位" },
      project: { type: "string", description: "工程名称" },
      trips: { type: "number" },
      volume: { type: "number", description: "方量 m³" },
      material_volume: { type: "number", description: "带料方量" },
      pump_hours: { type: "number" },
      odometer: { type: "number", description: "本次出车结束时的车辆公里数（v4.1 新增）" },
      unit_price: { type: "number" },
      material_unit_price: { type: "number", description: "带料单价" },
      amount: { type: "number", description: "应收金额；不传则按（方量 × 单价）+（带料方量 × 带料单价）计算" },
      paid: { type: "number", description: "当场收款" },
      payment_method: { type: "string", description: "付款方式：合同 或 现金（v4.1 新增）" },
      note: { type: "string" },
    }),
  },
  list_transport_jobs: {
    description: "查询运输台账，可按月份或关键词过滤。",
    inputSchema: schema({ month: { type: "string" }, search: { type: "string" } }),
  },
  record_vehicle_expense: {
    description: "登记油费、维修费、保养、保险、过路费等车辆费用。",
    inputSchema: schema({
      id: { type: "string" },
      date: { type: "string" },
      vehicle_id: { type: "string" },
      vehicle_plate: { type: "string" },
      expense_type: { type: "string", description: "油费、维修费、保养费、轮胎、保险/年检等" },
      amount: { type: "number" },
      liters: { type: "number" },
      odometer: { type: "number" },
      vendor: { type: "string" },
      note: { type: "string" },
    }),
  },
  list_vehicle_expenses: {
    description: "查询车辆费用明细，可按月份或关键词过滤。",
    inputSchema: schema({ month: { type: "string" }, search: { type: "string" } }),
  },
  record_customer_payment: {
    description: "登记客户后续回款，用于冲减客户欠账。",
    inputSchema: schema({
      id: { type: "string" },
      date: { type: "string" },
      customer_id: { type: "string" },
      customer_name: { type: "string" },
      amount: { type: "number" },
      method: { type: "string", description: "现金、微信、支付宝、银行转账、承兑/抵账等" },
      note: { type: "string" },
    }),
  },
  list_customer_payments: {
    description: "查询客户回款记录。",
    inputSchema: schema({ month: { type: "string" }, search: { type: "string" } }),
  },
  record_salary: {
    description: "登记或更新人员工资记录。",
    inputSchema: schema({
      id: { type: "string" },
      month: { type: "string", description: "YYYY-MM，默认本月" },
      name: { type: "string" },
      role: { type: "string" },
      base: { type: "number" },
      bonus: { type: "number" },
      deduction: { type: "number" },
      paid: { type: "number" },
      note: { type: "string" },
    }),
  },
  list_salaries: {
    description: "查询工资记录。",
    inputSchema: schema({ month: { type: "string" }, search: { type: "string" } }),
  },
  customer_balance_report: {
    description: "查看全部客户欠账排行。",
    inputSchema: schema({ only_debt: { type: "boolean", description: "只返回仍欠款客户，默认 true" } }),
  },
  export_data: {
    description: "导出当前完整 JSON 数据，方便备份或检查。",
    inputSchema: schema({}),
  },
  delete_record: {
    description: "删除记录。为保护历史台账，已有业务关联的车辆和客户不能删除。",
    inputSchema: schema(
      {
        record_type: { type: "string", description: "vehicle、customer、job、expense、salary、payment" },
        id: { type: "string" },
      },
      ["record_type", "id"],
    ),
  },
};

const handlers = {
  agent_business_report: (args) => {
    const result = generateBusinessReport({ ...args, channel: "mcp", actor: { id: "mcp-agent", name: "MCP Agent" } });
    return [result.markdown, result];
  },
  agent_create_insurance_policy_draft: (args) => {
    const result = createInsurancePolicyDraft({ ...args, channel: "mcp", actor: { id: "mcp-agent", name: "MCP Agent" } });
    return [result.markdown, result];
  },
  agent_approve_insurance_policy_draft: (args) => {
    const result = approveInsurancePolicyDraft({ ...args, channel: "mcp", actor: { id: "mcp-agent", name: "MCP Agent", role: "admin" } });
    return [result.markdown, result];
  },
  agent_feishu_webhook_preview: (args) => {
    const result = handleFeishuWebhookPreview(args);
    return [result.markdown, result];
  },
  fleet_summary: (args) => {
    const summary = monthlySummary(args.month);
    return [textSummary(summary), summary];
  },
  list_vehicles: listVehicles,
  upsert_vehicle: upsertVehicle,
  list_customers: (args) => listRecords("customers", args),
  upsert_customer: upsertCustomer,
  record_transport_job: recordTransportJob,
  list_transport_jobs: (args) => listRecords("jobs", args),
  record_vehicle_expense: recordVehicleExpense,
  list_vehicle_expenses: (args) => listRecords("expenses", args),
  record_customer_payment: recordCustomerPayment,
  list_customer_payments: (args) => listRecords("payments", args),
  record_salary: recordSalary,
  list_salaries: (args) => listRecords("salaries", args),
  customer_balance_report: (args) => {
    let rows = customerBalances();
    if (args.only_debt !== false) rows = rows.filter((row) => row.balance > 0);
    return rows;
  },
  export_data: () => ({ dataPath: DATA_PATH, data: loadData() }),
  delete_record: deleteRecord,
};

function toolResult(text, structuredContent, isError = false) {
  const result = { content: [{ type: "text", text }], isError };
  if (structuredContent !== undefined) result.structuredContent = structuredContent;
  return result;
}

export function callTool(name, args = {}) {
  if (!handlers[name]) {
    return toolResult(`未知工具: ${name}`, { error: "unknown_tool", name }, true);
  }
  try {
    const value = handlers[name](args || {});
    if (Array.isArray(value) && value.length === 2 && typeof value[0] === "string") {
      return toolResult(value[0], value[1]);
    }
    return toolResult(JSON.stringify(value, null, 2), value);
  } catch (error) {
    return toolResult(error.message || String(error), { error: error.name || "Error", message: error.message || String(error) }, true);
  }
}

export function handleRequest(request) {
  const method = request.method;
  const id = request.id;
  if (method === "initialize") {
    const clientVersion = request.params?.protocolVersion || PROTOCOL_VERSION;
    return {
      jsonrpc: "2.0",
      id,
      result: {
        protocolVersion: clientVersion,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
      },
    };
  }
  if (method === "notifications/initialized") return null;
  if (method === "ping") return { jsonrpc: "2.0", id, result: {} };
  if (method === "tools/list") {
    return {
      jsonrpc: "2.0",
      id,
      result: {
        tools: Object.entries(TOOLS).map(([name, config]) => ({
          name,
          description: config.description,
          inputSchema: config.inputSchema,
        })),
      },
    };
  }
  if (method === "tools/call") {
    return {
      jsonrpc: "2.0",
      id,
      result: callTool(request.params?.name || "", request.params?.arguments || {}),
    };
  }
  if (id === undefined || id === null) return null;
  return { jsonrpc: "2.0", id, error: { code: -32601, message: `Method not found: ${method}` } };
}

function writeMessage(message) {
  globalThis.process.stdout.write(`${JSON.stringify(message)}\n`);
}

export function startStdio() {
  const rl = readline.createInterface({ input: globalThis.process.stdin, crlfDelay: Infinity });
  rl.on("line", (line) => {
    const payload = line.replace(/^\uFEFF/, "");
    if (!payload.trim()) return;
    try {
      const response = handleRequest(JSON.parse(payload));
      if (response) writeMessage(response);
    } catch (error) {
      globalThis.process.stderr.write(`${error.stack || error}\n`);
      writeMessage({ jsonrpc: "2.0", id: null, error: { code: -32700, message: `Parse or server error: ${error.message}` } });
    }
  });
}

function isDirectRun() {
  const entry = globalThis.process?.argv?.[1];
  if (!entry) return false;
  const current = fileURLToPath(import.meta.url);
  const requested = path.resolve(entry);
  try {
    return fs.realpathSync(current) === fs.realpathSync(requested);
  } catch {
    return current === requested;
  }
}

if (isDirectRun()) {
  startStdio();
}
