import fs from "node:fs";
import path from "node:path";
import { approveInsurancePolicyDraft, createInsurancePolicyDraft, generateBusinessReport } from "./fleet_agent.mjs";

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const args = { command };
  for (let i = 0; i < rest.length; i += 1) {
    const item = rest[i];
    if (!item.startsWith("--")) continue;
    const key = item.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    const next = rest[i + 1];
    if (!next || next.startsWith("--")) args[key] = true;
    else {
      args[key] = next;
      i += 1;
    }
  }
  return args;
}

function usage() {
  return [
    "车辆运输企业 Agent CLI",
    "",
    "用法:",
    "  node mcp/fleet_agent_cli.mjs report --month 2026-07",
    "  node mcp/fleet_agent_cli.mjs insurance-draft --file ./policy-ocr.txt --filename policy.pdf",
    "  node mcp/fleet_agent_cli.mjs approve-insurance-draft --draft-id agt_xxx",
    "",
    "说明:",
    "  report 只读生成经营报告。",
    "  insurance-draft 从 OCR 文本生成车辆保险更新草稿，待管理员确认，不直接修改车辆档案。",
    "  approve-insurance-draft 确认写入匹配车辆的保险字段，应只由管理员执行。",
  ].join("\n");
}

function readTextFile(filePath) {
  if (!filePath) throw new Error("缺少 --file OCR 文本路径");
  const target = path.resolve(filePath);
  return fs.readFileSync(target, "utf8");
}

function main() {
  const args = parseArgs(globalThis.process.argv.slice(2));
  if (!args.command || args.help) {
    console.log(usage());
    return;
  }
  if (args.command === "report") {
    const result = generateBusinessReport({
      month: args.month,
      question: args.question || "",
      channel: "cli",
      actor: { id: "cli", name: "Agent CLI" },
    });
    console.log(result.markdown);
    return;
  }
  if (args.command === "insurance-draft") {
    const text = readTextFile(args.file);
    const result = createInsurancePolicyDraft({
      filename: args.filename || path.basename(args.file),
      text,
      channel: "cli",
      actor: { id: "cli", name: "Agent CLI" },
    });
    console.log(result.markdown);
    return;
  }
  if (args.command === "approve-insurance-draft") {
    const result = approveInsurancePolicyDraft({
      draftId: args.draftId,
      channel: "cli",
      actor: { id: "cli-admin", name: "Agent CLI 管理员", role: "admin" },
    });
    console.log(result.markdown);
    return;
  }
  throw new Error(`未知命令: ${args.command}\n\n${usage()}`);
}

try {
  main();
} catch (error) {
  console.error(error.message || String(error));
  globalThis.process.exitCode = 1;
}
