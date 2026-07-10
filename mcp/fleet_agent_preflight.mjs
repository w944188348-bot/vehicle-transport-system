import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "vts-agent-preflight-"));
const dataPath = path.join(tmp, "fleet-data.json");
const tasksPath = path.join(tmp, "agent-tasks.json");

process.env.FLEET_DATA_PATH = dataPath;
process.env.FLEET_AGENT_TASKS_PATH = tasksPath;

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function printPass(items) {
  console.log("# Agent v0.2 预上线验证通过");
  console.log("");
  console.log(`- 使用临时数据：${tmp}`);
  for (const item of items) console.log(`- ${item}`);
}

try {
  const [core, agent, mcp] = await Promise.all([
    import("./fleet_core.mjs"),
    import("./fleet_agent.mjs"),
    import("./fleet_mcp_server.mjs"),
  ]);

  core.upsertVehicle({
    id: "v_preflight_1",
    plate: "皖A12345",
    compulsory_company: "旧保险公司",
    compulsory_policy_no: "OLD-POLICY",
    compulsory_expiry: "2026-01-01",
  });
  core.upsertCustomer({ id: "c_preflight_1", name: "预上线客户" });
  core.recordTransportJob({
    vehicle_id: "v_preflight_1",
    customer_id: "c_preflight_1",
    date: "2026-07-09",
    trips: 2,
    volume: 20,
    unit_price: 80,
    paid: 600,
  });
  core.recordVehicleExpense({
    vehicle_id: "v_preflight_1",
    date: "2026-07-09",
    type: "油费",
    itemName: "柴油",
    amount: 300,
  });

  const beforeReport = fs.readFileSync(dataPath, "utf8");
  const report = agent.generateBusinessReport({
    month: "2026-07",
    actor: { id: "preflight", name: "预上线验证" },
    channel: "preflight",
  });
  const afterReport = fs.readFileSync(dataPath, "utf8");
  assert.equal(afterReport, beforeReport, "经营报告不应修改正式业务数据");
  assert.match(report.markdown, /2026-07 车辆运输经营月报/);
  assert.equal(report.summary.revenue, 1600);

  const beforeDraft = fs.readFileSync(dataPath, "utf8");
  const draftResult = agent.createInsurancePolicyDraft({
    filename: "preflight-policy.pdf",
    text: [
      "机动车交通事故责任强制保险单",
      "号牌号码：皖A12345",
      "保险公司：中国人民财产保险股份有限公司",
      "保单号：PDAA202607090001",
      "保险期间：自2026年07月10日零时起至2027年07月09日二十四时止",
    ].join("\n"),
    actor: { id: "accountant-preflight", name: "预上线会计" },
    channel: "preflight",
  });
  const afterDraft = fs.readFileSync(dataPath, "utf8");
  assert.equal(afterDraft, beforeDraft, "保单草稿创建不应修改车辆档案");
  assert.equal(draftResult.draft.requiresApproval, true);
  assert.equal(draftResult.draft.matchedVehicleId, "v_preflight_1");

  const approved = agent.approveInsurancePolicyDraft({
    draftId: draftResult.draft.id,
    actor: { id: "admin-preflight", name: "预上线管理员", role: "admin" },
    channel: "preflight",
  });
  const data = core.loadData();
  const vehicle = data.vehicles.find((item) => item.id === "v_preflight_1");
  assert.equal(approved.status, "approved");
  assert.equal(vehicle.compulsoryInsurance.company, "中国人民财产保险股份有限公司");
  assert.equal(vehicle.compulsoryInsurance.policyNo, "PDAA202607090001");
  assert.equal(vehicle.compulsoryInsurance.expiry, "2027-07-09");
  assert.equal(vehicle.compulsoryInsurance.pdfFile, "preflight-policy.pdf");
  assert.equal(data.jobs.length, 1, "审批保单不能新增或删除运输记录");
  assert.equal(data.expenses.length, 1, "审批保单不能新增或删除费用记录");

  const tasks = readJson(tasksPath).tasks;
  const reportTask = tasks.find((item) => item.type === "business_report");
  const draftTask = tasks.find((item) => item.id === draftResult.draft.id);
  assert.equal(reportTask.status, "completed");
  assert.equal(draftTask.status, "approved");
  assert.equal(draftTask.requiresApproval, false);
  assert.equal(draftTask.output.approval.approvedByRole, "admin");

  assert.ok(mcp.TOOLS.agent_business_report, "MCP 应暴露经营报告工具");
  assert.ok(mcp.TOOLS.agent_create_insurance_policy_draft, "MCP 应暴露保单草稿工具");
  assert.ok(mcp.TOOLS.agent_approve_insurance_policy_draft, "MCP 应暴露保单审批工具");
  assert.equal(agent.safeAgentToolNames().includes("record_transport_job"), false);
  assert.equal(agent.safeAgentToolNames().includes("delete_record"), false);

  printPass([
    "经营报告只读。",
    "保单草稿确认前不写车辆档案。",
    "管理员确认后只写车辆保险字段。",
    "任务留痕状态正确。",
    "MCP Agent 工具边界正确。",
  ]);
} catch (error) {
  console.error("# Agent v0.2 预上线验证失败");
  console.error(error?.stack || error?.message || String(error));
  process.exitCode = 1;
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
