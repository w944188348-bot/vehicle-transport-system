import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

test("Agent v0.2 preflight validates the full draft approval loop on temp data", () => {
  const output = execFileSync(process.execPath, ["mcp/fleet_agent_preflight.mjs"], {
    cwd: new URL("..", import.meta.url),
    encoding: "utf8",
  });

  assert.match(output, /Agent v0\.2 预上线验证通过/);
  assert.match(output, /使用临时数据/);
  assert.match(output, /经营报告只读/);
  assert.match(output, /保单草稿确认前不写车辆档案/);
  assert.match(output, /管理员确认后只写车辆保险字段/);
  assert.match(output, /任务留痕状态正确/);
});
