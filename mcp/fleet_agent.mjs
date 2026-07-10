import fs from "node:fs";
import path from "node:path";
import {
  DATA_PATH,
  customerBalances,
  listRecords,
  listVehicles,
  loadData,
  money,
  monthlySummary,
  number,
  saveData,
} from "./fleet_core.mjs";

const AGENT_TASKS_PATH = globalThis.process?.env?.FLEET_AGENT_TASKS_PATH || path.join(path.dirname(DATA_PATH), "agent-tasks.json");

const INSURANCE_TYPES = {
  compulsory: { label: "强制险", field: "compulsoryInsurance" },
  commercial: { label: "商业险", field: "commercialInsurance" },
  excess: { label: "超赔险", field: "excessInsurance" },
};

export function loadAgentTasks() {
  if (!fs.existsSync(AGENT_TASKS_PATH)) return { tasks: [] };
  try {
    const parsed = JSON.parse(fs.readFileSync(AGENT_TASKS_PATH, "utf8"));
    return { tasks: Array.isArray(parsed.tasks) ? parsed.tasks : [] };
  } catch {
    return { tasks: [] };
  }
}

function saveAgentTasks(data) {
  fs.mkdirSync(path.dirname(AGENT_TASKS_PATH), { recursive: true });
  const tempPath = `${AGENT_TASKS_PATH}.tmp`;
  fs.writeFileSync(tempPath, `${JSON.stringify({ tasks: Array.isArray(data.tasks) ? data.tasks : [] }, null, 2)}\n`, "utf8");
  fs.renameSync(tempPath, AGENT_TASKS_PATH);
}

function newTaskId(prefix = "agt") {
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
}

function appendAgentTask(task) {
  const data = loadAgentTasks();
  const saved = {
    id: task.id || newTaskId(),
    type: task.type || "agent_task",
    status: task.status || "received",
    channel: task.channel || "web",
    actor: task.actor || {},
    input: task.input || {},
    output: task.output || {},
    error: task.error || "",
    requiresApproval: Boolean(task.requiresApproval),
    createdAt: task.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  data.tasks.push(saved);
  saveAgentTasks(data);
  return saved;
}

function replaceAgentTask(taskId, updater) {
  const data = loadAgentTasks();
  const index = data.tasks.findIndex((task) => task.id === taskId);
  if (index < 0) throw new Error("未找到 Agent 任务草稿");
  const current = data.tasks[index];
  const next = updater(current);
  data.tasks[index] = { ...next, updatedAt: new Date().toISOString() };
  saveAgentTasks(data);
  return data.tasks[index];
}

function dateKey(value) {
  return String(value || "").slice(0, 10);
}

function daysUntil(value, now = new Date()) {
  if (!value) return null;
  const target = new Date(`${dateKey(value)}T00:00:00+08:00`);
  if (Number.isNaN(target.getTime())) return null;
  return Math.ceil((target.getTime() - now.getTime()) / 86400000);
}

function expiryAlerts(data, now = new Date()) {
  const alerts = [];
  const push = (vehicle, label, expiry) => {
    const days = daysUntil(expiry, now);
    if (days === null || days > 30) return;
    alerts.push({
      vehicleId: vehicle.id,
      plate: vehicle.plate,
      label,
      expiry,
      days,
      level: days < 0 ? "overdue" : "soon",
    });
  };
  for (const vehicle of data.vehicles) {
    push(vehicle, "年审", vehicle.inspectionExpiry);
    push(vehicle, "强制险", vehicle.compulsoryInsurance?.expiry);
    push(vehicle, "商业险", vehicle.commercialInsurance?.expiry);
    push(vehicle, "超赔险", vehicle.excessInsurance?.expiry);
  }
  return alerts.sort((a, b) => a.days - b.days);
}

function topVehicleCosts(month) {
  const rows = listRecords("expenses", { month });
  const totals = new Map();
  for (const row of rows) {
    const key = row.vehiclePlate || row.vehicleId || "未关联车辆";
    totals.set(key, number(totals.get(key)) + number(row.amount));
  }
  return [...totals.entries()]
    .map(([plate, amount]) => ({ plate, amount }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 5);
}

function topVehicleUsage(month) {
  const rows = listRecords("jobs", { month });
  const totals = new Map();
  for (const row of rows) {
    const key = row.vehiclePlate || row.vehicleId || "未关联车辆";
    const current = totals.get(key) || { plate: key, jobs: 0, trips: 0, volume: 0 };
    current.jobs += 1;
    current.trips += number(row.trips);
    current.volume += number(row.volume);
    totals.set(key, current);
  }
  return [...totals.values()].sort((a, b) => b.trips - a.trips).slice(0, 5);
}

export function generateBusinessReport(args = {}) {
  const month = args.month || new Date().toISOString().slice(0, 7);
  const data = loadData();
  const summary = monthlySummary(month);
  const debts = customerBalances(data).filter((row) => row.balance > 0).slice(0, 5);
  const alerts = expiryAlerts(data);
  const vehicleCosts = topVehicleCosts(month);
  const vehicleUsage = topVehicleUsage(month);
  const generatedAt = new Date().toISOString();
  const actionItems = [];
  if (summary.totalCustomerDebt > 0) actionItems.push("客户欠账仍需人工核对后再催收，Agent 不会自动外发催款信息。");
  if (alerts.length > 0) actionItems.push("车辆证照/保险到期项需管理员确认后安排续保或年审。");
  if (summary.grossProfit < 0) actionItems.push("本月估算毛利润为负，建议复核费用、工资和结算方量口径。");
  if (actionItems.length === 0) actionItems.push("当前没有必须立即处理的高风险事项，建议继续按日补齐运输和回款记录。");

  const debtLines = debts.map((row, index) => `${index + 1}. ${row.customer.name}：欠账 ${money(row.balance)}，最近运输 ${row.lastDate || "无记录"}`);
  const alertLines = alerts.slice(0, 8).map((row, index) => {
    const status = row.days < 0 ? `已过期 ${Math.abs(row.days)} 天` : `剩 ${row.days} 天`;
    return `${index + 1}. ${row.plate} ${row.label} ${row.expiry}（${status}）`;
  });
  const costLines = vehicleCosts.map((row, index) => `${index + 1}. ${row.plate}：${money(row.amount)}`);
  const usageLines = vehicleUsage.map((row, index) => `${index + 1}. ${row.plate}：${row.jobs} 单，${row.trips} 趟，${row.volume} 方`);

  const markdown = [
    `# ${month} 车辆运输经营月报`,
    "",
    "## 结论",
    `本月应收：${money(summary.revenue)}；已收：${money(summary.received)}；客户总欠账：${money(summary.totalCustomerDebt)}；估算毛利润：${money(summary.grossProfit)}。`,
    "",
    "## 关键数字",
    `- 运输记录：${summary.transportJobs} 条`,
    `- 车辆数量：${summary.vehicleCount} 台`,
    `- 客户数量：${summary.customerCount} 个`,
    `- 车辆费用：${money(summary.vehicleExpenses)}`,
    `- 人员工资：${money(summary.salaryDue)}`,
    "",
    "## 客户欠账风险",
    debtLines.length ? debtLines.join("\n") : "暂无客户欠账。",
    "",
    "## 车辆使用排行",
    usageLines.length ? usageLines.join("\n") : "本月暂无运输记录。",
    "",
    "## 车辆成本排行",
    costLines.length ? costLines.join("\n") : "本月暂无车辆费用。",
    "",
    "## 证照与保险提醒",
    alertLines.length ? alertLines.join("\n") : "未来 30 天暂无车辆证照或保险到期提醒。",
    "",
    "## 需要人工确认",
    actionItems.map((item) => `- ${item}`).join("\n"),
    "",
    "## 数据来源",
    `- 数据文件：${DATA_PATH}`,
    `- 生成时间：${generatedAt}`,
    "- 说明：本报告只读现有经营数据，不会自动入账、删改记录或外发客户消息。",
  ].join("\n");

  const task = appendAgentTask({
    type: "business_report",
    status: "completed",
    channel: args.channel || "web",
    actor: args.actor || {},
    input: { month, question: args.question || "" },
    output: { summary, alerts: alerts.slice(0, 8), actionItems },
  });

  return {
    task,
    markdown,
    summary,
    alerts,
    actionItems,
    sources: { dataPath: DATA_PATH, generatedAt },
  };
}

function normalizeDate(input) {
  const text = String(input || "").trim();
  if (!text) return "";
  const cn = text.match(/(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/);
  if (cn) return `${cn[1]}-${cn[2].padStart(2, "0")}-${cn[3].padStart(2, "0")}`;
  const slash = text.match(/(\d{4})[./-](\d{1,2})[./-](\d{1,2})/);
  if (slash) return `${slash[1]}-${slash[2].padStart(2, "0")}-${slash[3].padStart(2, "0")}`;
  return "";
}

function firstMatch(text, patterns) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return match[1].trim();
  }
  return "";
}

function detectInsuranceType(text) {
  if (/交强险|强制保险|交通事故责任强制保险|机动车交通事故责任强制保险/.test(text)) return "compulsory";
  if (/超赔险|超额险|超赔|超额/.test(text)) return "excess";
  if (/商业险|商业保险|机动车商业保险/.test(text)) return "commercial";
  return "commercial";
}

export function extractInsurancePolicy(text = "", filename = "") {
  const normalizedText = String(text || "").replace(/\r/g, "\n");
  const plate = firstMatch(normalizedText, [
    /(?:号牌号码|车牌号|车牌|牌照号码)\s*[:：]?\s*([京津沪渝冀豫云辽黑湘皖鲁新苏浙赣鄂桂甘晋蒙陕吉闽贵粤青藏川宁琼使领][A-Z][A-Z0-9挂学警港澳]{5,6})/i,
    /([京津沪渝冀豫云辽黑湘皖鲁新苏浙赣鄂桂甘晋蒙陕吉闽贵粤青藏川宁琼使领][A-Z][A-Z0-9挂学警港澳]{5,6})/i,
  ]).toUpperCase();
  const company = firstMatch(normalizedText, [
    /(?:保险公司|承保公司|保险人)\s*[:：]?\s*([^\n，,]+)/,
    /(中国[^\n，,]{2,24}保险[^\n，,]*)/,
  ]);
  const policyNo = firstMatch(normalizedText, [
    /(?:保单号|保险单号|保险单号码|单证号)\s*[:：]?\s*([A-Z0-9-]{6,})/i,
  ]).toUpperCase();
  const periodEnd = firstMatch(normalizedText, [
    /(?:至|止期|终止日期|到期日)\s*[:：]?\s*(\d{4}\s*年\s*\d{1,2}\s*月\s*\d{1,2}\s*日)/,
    /(?:至|止期|终止日期|到期日)\s*[:：]?\s*(\d{4}[./-]\d{1,2}[./-]\d{1,2})/,
  ]);
  const periodStart = firstMatch(normalizedText, [
    /(?:自|起期|起保日期)\s*[:：]?\s*(\d{4}\s*年\s*\d{1,2}\s*月\s*\d{1,2}\s*日)/,
    /(?:自|起期|起保日期)\s*[:：]?\s*(\d{4}[./-]\d{1,2}[./-]\d{1,2})/,
  ]);
  const insured = firstMatch(normalizedText, [/(?:被保险人|投保人)\s*[:：]?\s*([^\n，,]+)/]);
  const vin = firstMatch(normalizedText, [/(?:车辆识别代号|车架号|VIN)\s*[:：]?\s*([A-HJ-NPR-Z0-9]{10,20})/i]).toUpperCase();
  const engineNo = firstMatch(normalizedText, [/(?:发动机号|发动机号码)\s*[:：]?\s*([A-Z0-9-]{4,})/i]).toUpperCase();
  const type = detectInsuranceType(normalizedText);
  const expiry = normalizeDate(periodEnd);
  const startDate = normalizeDate(periodStart);
  const present = [plate, company, policyNo, expiry, startDate, insured, vin, engineNo].filter(Boolean).length;
  const confidence = Math.min(0.98, Math.max(0.2, (present + (type ? 1 : 0)) / 8));

  return {
    filename,
    plate,
    insuranceType: type,
    insuranceTypeLabel: INSURANCE_TYPES[type].label,
    company,
    policyNo,
    startDate,
    expiry,
    insured,
    vin,
    engineNo,
    confidence: Number(confidence.toFixed(2)),
  };
}

export function createInsurancePolicyDraft(args = {}) {
  const extracted = extractInsurancePolicy(args.text || "", args.filename || "");
  const vehicles = listVehicles({});
  const matchedVehicle = extracted.plate ? vehicles.find((vehicle) => String(vehicle.plate || "").toUpperCase() === extracted.plate) : null;
  const insuranceConfig = INSURANCE_TYPES[extracted.insuranceType] || INSURANCE_TYPES.commercial;
  const proposedVehiclePatch = {};
  proposedVehiclePatch[insuranceConfig.field] = {
    company: extracted.company,
    policyNo: extracted.policyNo,
    pdfFile: args.filename || "",
    expiry: extracted.expiry,
  };
  const warnings = [];
  if (!matchedVehicle) warnings.push("未匹配到现有车辆，不能自动写入车辆档案。");
  if (!extracted.expiry) warnings.push("未识别到保险到期日，需要人工补齐。");
  if (!extracted.policyNo) warnings.push("未识别到保单号，需要人工补齐。");
  if (extracted.confidence < 0.75) warnings.push("识别置信度偏低，需要人工核对原件。");

  const draft = {
    id: newTaskId("vid"),
    type: "vehicle_insurance_update",
    status: "draft",
    requiresApproval: true,
    matchedVehicleId: matchedVehicle?.id || "",
    matchedPlate: matchedVehicle?.plate || extracted.plate || "",
    extracted,
    proposedVehiclePatch,
    warnings,
  };
  const task = appendAgentTask({
    id: draft.id,
    type: "insurance_policy_draft",
    status: "draft",
    channel: args.channel || "web",
    actor: args.actor || {},
    input: { filename: args.filename || "", textLength: String(args.text || "").length },
    output: { draft },
    requiresApproval: true,
  });
  const markdown = [
    `# 保单识别草稿：${extracted.plate || "未识别车牌"}`,
    "",
    `- 险种：${extracted.insuranceTypeLabel}`,
    `- 保险公司：${extracted.company || "待确认"}`,
    `- 保单号：${extracted.policyNo || "待确认"}`,
    `- 到期日：${extracted.expiry || "待确认"}`,
    `- 匹配车辆：${matchedVehicle ? matchedVehicle.plate : "未匹配"}`,
    `- 置信度：${Math.round(extracted.confidence * 100)}%`,
    "",
    "## 处理状态",
    "已生成车辆保险更新草稿，待管理员确认后才可写入正式车辆档案。",
    "",
    "## 风险提示",
    warnings.length ? warnings.map((item) => `- ${item}`).join("\n") : "- 暂无阻塞风险，但仍需人工核对原保单。",
  ].join("\n");

  return { task, draft, extracted, markdown };
}

export function approveInsurancePolicyDraft(args = {}) {
  const draftId = args.draftId || args.draft_id || args.id;
  if (!draftId) throw new Error("需要 draftId");
  const task = loadAgentTasks().tasks.find((item) => item.id === draftId);
  if (!task) throw new Error("未找到 Agent 保单草稿");
  if (task.type !== "insurance_policy_draft") throw new Error("该任务不是保单草稿");
  if (task.status === "approved") throw new Error("该保单草稿已确认");
  const draft = task.output?.draft;
  if (!draft?.matchedVehicleId) throw new Error("保单草稿未匹配车辆，不能确认写入");
  if (!draft.proposedVehiclePatch || typeof draft.proposedVehiclePatch !== "object") throw new Error("保单草稿缺少车辆更新字段");

  const data = loadData();
  const vehicleIndex = data.vehicles.findIndex((vehicle) => vehicle.id === draft.matchedVehicleId);
  if (vehicleIndex < 0) throw new Error("未找到草稿匹配的车辆");
  const currentVehicle = data.vehicles[vehicleIndex];
  const nextVehicle = {
    ...currentVehicle,
    ...draft.proposedVehiclePatch,
  };
  data.vehicles[vehicleIndex] = nextVehicle;
  saveData(data);

  const now = new Date().toISOString();
  const actor = args.actor || {};
  const approval = {
    approvedBy: actor.id || "",
    approvedByName: actor.name || actor.phone || "",
    approvedByRole: actor.role || "",
    approvedAt: now,
    channel: args.channel || "web",
    vehicleId: nextVehicle.id,
    plate: nextVehicle.plate,
  };
  const updatedTask = replaceAgentTask(draftId, (item) => ({
    ...item,
    status: "approved",
    requiresApproval: false,
    output: {
      ...item.output,
      approval,
    },
  }));
  const markdown = [
    `# 已确认写入车辆保险字段：${nextVehicle.plate}`,
    "",
    `- 车辆：${nextVehicle.plate}`,
    `- 确认人：${approval.approvedByName || "未记录"}`,
    `- 确认时间：${approval.approvedAt}`,
    "- 写入范围：仅更新本草稿识别出的保险字段。",
  ].join("\n");

  return {
    status: "approved",
    task: updatedTask,
    vehicle: nextVehicle,
    approval,
    markdown,
  };
}

export function safeAgentToolNames() {
  return [
    "agent_business_report",
    "agent_create_insurance_policy_draft",
    "agent_approve_insurance_policy_draft",
    "agent_feishu_webhook_preview",
    "fleet_summary",
    "list_vehicles",
    "list_customers",
    "list_transport_jobs",
    "list_vehicle_expenses",
    "list_customer_payments",
    "list_salaries",
    "customer_balance_report",
    "export_data",
  ];
}

export function handleFeishuWebhookPreview(payload = {}) {
  const text = String(payload.text || payload.message || "");
  const actor = { id: payload.open_id || payload.user_id || "feishu-test", name: payload.name || "飞书用户" };
  if (/保单|保险/.test(text) && payload.policy_text) {
    return createInsurancePolicyDraft({
      filename: payload.filename || "feishu-policy.txt",
      text: payload.policy_text,
      channel: "feishu",
      actor,
    });
  }
  return generateBusinessReport({
    month: payload.month || new Date().toISOString().slice(0, 7),
    question: text,
    channel: "feishu",
    actor,
  });
}
