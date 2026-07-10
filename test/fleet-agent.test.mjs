import { after, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "vts-agent-test-"));
const dataPath = path.join(tmp, "fleet-data.json");
const tasksPath = path.join(tmp, "agent-tasks.json");
process.env.FLEET_DATA_PATH = dataPath;
process.env.FLEET_AGENT_TASKS_PATH = tasksPath;

const coreModulePromise = import("../mcp/fleet_core.mjs");
const agentModulePromise = import("../mcp/fleet_agent.mjs");
const mcpModulePromise = import("../mcp/fleet_mcp_server.mjs");

function resetTempFiles() {
  fs.rmSync(dataPath, { force: true });
  fs.rmSync(tasksPath, { force: true });
}

async function withTempAgentData(fn) {
  resetTempFiles();
  const [core, agent, mcp] = await Promise.all([coreModulePromise, agentModulePromise, mcpModulePromise]);
  await fn({ core, agent, mcp, tmp, dataPath, tasksPath });
}

after(() => {
  delete process.env.FLEET_DATA_PATH;
  delete process.env.FLEET_AGENT_TASKS_PATH;
  fs.rmSync(tmp, { recursive: true, force: true });
});

test("Agent 经营报告只读生成老板月报并写任务留痕", async () => {
  await withTempAgentData(async ({ core, agent, dataPath, tasksPath }) => {
    core.upsertVehicle({ id: "v1", plate: "皖A12345", compulsory_expiry: "2026-07-20" });
    core.upsertCustomer({ id: "c1", name: "城北搅拌站" });
    core.recordTransportJob({
      vehicle_id: "v1",
      customer_id: "c1",
      date: "2026-07-08",
      trips: 2,
      volume: 40,
      unit_price: 50,
      paid: 500,
    });
    core.recordVehicleExpense({ vehicle_id: "v1", date: "2026-07-08", type: "油费", itemName: "柴油", amount: 300 });

    const before = fs.readFileSync(dataPath, "utf8");
    const result = agent.generateBusinessReport({ month: "2026-07", actor: { id: "boss", name: "老板" }, channel: "web" });
    const after = fs.readFileSync(dataPath, "utf8");

    assert.equal(after, before, "经营报告不能修改正式业务数据");
    assert.match(result.markdown, /# 2026-07 车辆运输经营月报/);
    assert.match(result.markdown, /本月应收：¥2,000.00/);
    assert.match(result.markdown, /客户总欠账：¥1,500.00/);
    assert.match(result.markdown, /需要人工确认/);
    assert.equal(result.task.status, "completed");
    assert.equal(result.sources.dataPath, dataPath);
    assert.equal(JSON.parse(fs.readFileSync(tasksPath, "utf8")).tasks.length, 1);
  });
});

test("Agent 保单识别生成车辆更新草稿但不直接保存车辆档案", async () => {
  await withTempAgentData(async ({ core, agent, dataPath, tasksPath }) => {
    core.upsertVehicle({ id: "v1", plate: "皖A12345", compulsory_company: "旧公司", compulsory_policy_no: "OLD", compulsory_expiry: "2026-01-01" });
    const before = fs.readFileSync(dataPath, "utf8");

    const result = agent.createInsurancePolicyDraft({
      filename: "policy.pdf",
      text: [
        "机动车交通事故责任强制保险单",
        "号牌号码：皖A12345",
        "保险公司：中国人民财产保险股份有限公司",
        "保单号：PDAA202607090001",
        "保险期间：自2026年07月10日零时起至2027年07月09日二十四时止",
      ].join("\n"),
      actor: { id: "accountant", name: "会计" },
      channel: "web",
    });
    const after = fs.readFileSync(dataPath, "utf8");

    assert.equal(after, before, "保单识别不能直接修改正式车辆档案");
    assert.equal(result.draft.status, "draft");
    assert.equal(result.draft.requiresApproval, true);
    assert.equal(result.draft.matchedVehicleId, "v1");
    assert.equal(result.draft.proposedVehiclePatch.compulsoryInsurance.company, "中国人民财产保险股份有限公司");
    assert.equal(result.draft.proposedVehiclePatch.compulsoryInsurance.policyNo, "PDAA202607090001");
    assert.equal(result.draft.proposedVehiclePatch.compulsoryInsurance.expiry, "2027-07-09");
    assert.match(result.markdown, /待管理员确认/);
    assert.equal(JSON.parse(fs.readFileSync(tasksPath, "utf8")).tasks[0].type, "insurance_policy_draft");
  });
});

test("Agent 保单草稿经确认后写入车辆保险字段并更新任务状态", async () => {
  await withTempAgentData(async ({ core, agent, tasksPath }) => {
    core.upsertVehicle({ id: "v1", plate: "皖A12345", compulsory_company: "旧公司", compulsory_policy_no: "OLD", compulsory_expiry: "2026-01-01" });
    const draftResult = agent.createInsurancePolicyDraft({
      filename: "policy.pdf",
      text: [
        "机动车交通事故责任强制保险单",
        "号牌号码：皖A12345",
        "保险公司：中国人民财产保险股份有限公司",
        "保单号：PDAA202607090001",
        "保险期间：自2026年07月10日零时起至2027年07月09日二十四时止",
      ].join("\n"),
      actor: { id: "accountant", name: "会计" },
      channel: "web",
    });

    const approved = agent.approveInsurancePolicyDraft({
      draftId: draftResult.draft.id,
      actor: { id: "admin", name: "管理员", role: "admin" },
      channel: "web",
    });
    const vehicle = core.loadData().vehicles.find((item) => item.id === "v1");
    const task = JSON.parse(fs.readFileSync(tasksPath, "utf8")).tasks.find((item) => item.id === draftResult.draft.id);

    assert.equal(approved.status, "approved");
    assert.equal(approved.vehicle.id, "v1");
    assert.equal(vehicle.compulsoryInsurance.company, "中国人民财产保险股份有限公司");
    assert.equal(vehicle.compulsoryInsurance.policyNo, "PDAA202607090001");
    assert.equal(vehicle.compulsoryInsurance.expiry, "2027-07-09");
    assert.equal(vehicle.compulsoryInsurance.pdfFile, "policy.pdf");
    assert.equal(task.status, "approved");
    assert.equal(task.requiresApproval, false);
    assert.equal(task.output.approval.approvedByName, "管理员");
  });
});

test("Agent 安全工具清单不暴露直接正式写入和删除工具", async () => {
  await withTempAgentData(async ({ agent }) => {
    const tools = agent.safeAgentToolNames();

    assert.ok(tools.includes("agent_business_report"));
    assert.ok(tools.includes("agent_create_insurance_policy_draft"));
    assert.ok(tools.includes("fleet_summary"));
    assert.ok(tools.includes("list_vehicles"));
    assert.ok(!tools.includes("record_transport_job"));
    assert.ok(!tools.includes("record_vehicle_expense"));
    assert.ok(!tools.includes("record_customer_payment"));
    assert.ok(!tools.includes("record_salary"));
    assert.ok(!tools.includes("upsert_vehicle"));
    assert.ok(!tools.includes("delete_record"));
  });
});

test("MCP 暴露 Agent 安全工具并能生成经营报告", async () => {
  await withTempAgentData(async ({ core, mcp }) => {
    core.upsertVehicle({ id: "v1", plate: "皖A12345" });
    core.upsertCustomer({ id: "c1", name: "城北搅拌站" });
    core.recordTransportJob({ vehicle_id: "v1", customer_id: "c1", date: "2026-07-09", volume: 10, unit_price: 80 });

    assert.ok(mcp.TOOLS.agent_business_report);
    assert.ok(mcp.TOOLS.agent_create_insurance_policy_draft);
    const result = mcp.callTool("agent_business_report", { month: "2026-07" });

    assert.equal(result.isError, false);
    assert.match(result.content[0].text, /2026-07 车辆运输经营月报/);
    assert.match(result.content[0].text, /本月应收：¥800.00/);
    assert.equal(result.structuredContent.summary.revenue, 800);
  });
});

test("MCP 可以确认 Agent 保单草稿写入车辆档案", async () => {
  await withTempAgentData(async ({ core, agent, mcp }) => {
    core.upsertVehicle({ id: "v1", plate: "皖A12345" });
    const draftResult = agent.createInsurancePolicyDraft({
      filename: "policy.pdf",
      text: "机动车交通事故责任强制保险单\n号牌号码：皖A12345\n保险公司：中国人民财产保险股份有限公司\n保单号：PDAA202607090001\n保险期间：自2026年07月10日零时起至2027年07月09日二十四时止",
    });

    assert.ok(mcp.TOOLS.agent_approve_insurance_policy_draft);
    const result = mcp.callTool("agent_approve_insurance_policy_draft", { draft_id: draftResult.draft.id });

    assert.equal(result.isError, false);
    assert.match(result.content[0].text, /已确认写入车辆保险字段/);
    assert.equal(core.loadData().vehicles[0].compulsoryInsurance.policyNo, "PDAA202607090001");
  });
});

test("Agent CLI 可以生成本月经营报告", async () => {
  await withTempAgentData(async ({ core, dataPath, tasksPath }) => {
    core.upsertVehicle({ id: "v1", plate: "皖A12345" });
    core.upsertCustomer({ id: "c1", name: "城北搅拌站" });
    core.recordTransportJob({ vehicle_id: "v1", customer_id: "c1", date: "2026-07-09", volume: 8, unit_price: 100 });

    const output = execFileSync(
      process.execPath,
      ["mcp/fleet_agent_cli.mjs", "report", "--month", "2026-07"],
      {
        cwd: new URL("..", import.meta.url),
        env: { ...process.env, FLEET_DATA_PATH: dataPath, FLEET_AGENT_TASKS_PATH: tasksPath },
        encoding: "utf8",
      },
    );

    assert.match(output, /2026-07 车辆运输经营月报/);
    assert.match(output, /本月应收：¥800.00/);
  });
});

test("Agent CLI 可以确认保单草稿", async () => {
  await withTempAgentData(async ({ core, agent, dataPath, tasksPath }) => {
    core.upsertVehicle({ id: "v1", plate: "皖A12345" });
    const draftResult = agent.createInsurancePolicyDraft({
      filename: "policy.pdf",
      text: "机动车交通事故责任强制保险单\n号牌号码：皖A12345\n保险公司：中国人民财产保险股份有限公司\n保单号：PDAA202607090001\n保险期间：自2026年07月10日零时起至2027年07月09日二十四时止",
    });

    const output = execFileSync(
      process.execPath,
      ["mcp/fleet_agent_cli.mjs", "approve-insurance-draft", "--draft-id", draftResult.draft.id],
      {
        cwd: new URL("..", import.meta.url),
        env: { ...process.env, FLEET_DATA_PATH: dataPath, FLEET_AGENT_TASKS_PATH: tasksPath },
        encoding: "utf8",
      },
    );

    assert.match(output, /已确认写入车辆保险字段/);
    assert.equal(core.loadData().vehicles[0].compulsoryInsurance.policyNo, "PDAA202607090001");
  });
});
