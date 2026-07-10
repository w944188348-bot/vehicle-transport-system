import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const authMjs = fs.readFileSync(new URL("../mcp/auth.mjs", import.meta.url), "utf8");
const webServer = fs.readFileSync(new URL("../web_server.mjs", import.meta.url), "utf8");

test("auth layer has true user deletion separate from disabling", () => {
  assert.match(authMjs, /export function deleteUser/);
  assert.match(authMjs, /users\.filter\(\(item\) => item\.id !== userId\)/);
  assert.match(authMjs, /不能删除最后一个管理员/);
});

test("user API separates disable and delete routes with actor safety", () => {
  assert.match(webServer, /POST" && url\.pathname\.startsWith\("\/api\/users\/"\) && url\.pathname\.endsWith\("\/disable"\)/);
  assert.match(webServer, /DELETE" && url\.pathname\.startsWith\("\/api\/users\/"\)/);
  assert.match(webServer, /不能删除当前登录用户/);
  assert.match(webServer, /users\.delete/);
  assert.match(webServer, /users\.disable/);
});

test("draft delete API lets submitters remove their own pending drafts", () => {
  assert.match(webServer, /function deleteDraftRecord/);
  assert.match(webServer, /DELETE" && url\.pathname\.startsWith\("\/api\/job-drafts\/"\)/);
  assert.match(webServer, /DELETE" && url\.pathname\.startsWith\("\/api\/expense-drafts\/"\)/);
  assert.match(webServer, /DELETE" && url\.pathname\.startsWith\("\/api\/salary-drafts\/"\)/);
  assert.match(webServer, /DELETE" && url\.pathname\.startsWith\("\/api\/payment-drafts\/"\)/);
  assert.match(webServer, /draft\.createdBy !== user\.id/);
  assert.match(webServer, /不能删除他人提交的草稿/);
  assert.match(webServer, /drafts\.delete/);
});
