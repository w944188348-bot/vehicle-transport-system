import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const webServer = fs.readFileSync(new URL("../web_server.mjs", import.meta.url), "utf8");
const indexHtml = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");

test("web server version is fixed for this patch release", () => {
  assert.match(webServer, /const VERSION = "v5\.1";/);
});

test("main app shell and assets avoid stale browser cache", () => {
  assert.match(indexHtml, /<script src="app\.js\?v=20260709-docno-cache" defer><\/script>/);
  assert.match(webServer, /function staticHeaders/);
  assert.match(webServer, /"cache-control": "no-store, max-age=0"/);
  assert.match(webServer, /staticHeaders\(path\.extname\(target\)\)/);
});

test("user upsert audit records actor and target roles separately", () => {
  assert.match(webServer, /actorRole: user\.role/);
  assert.match(webServer, /targetRole: saved\.role/);
  assert.doesNotMatch(webServer, /users\.upsert", \{ userId: user\.id, targetUserId: saved\.id, role: saved\.role \}/);
});

test("web server exposes authenticated enterprise Agent endpoints", () => {
  assert.match(webServer, /generateBusinessReport/);
  assert.match(webServer, /createInsurancePolicyDraft/);
  assert.match(webServer, /handleFeishuWebhookPreview/);
  assert.match(webServer, /url\.pathname === "\/api\/agent\/report"/);
  assert.match(webServer, /url\.pathname === "\/api\/agent\/insurance-drafts"/);
  assert.match(webServer, /url\.pathname\.startsWith\("\/api\/agent\/insurance-drafts\/"\) && url\.pathname\.endsWith\("\/approve"\)/);
  assert.match(webServer, /url\.pathname === "\/api\/agent\/feishu-preview"/);
  assert.match(webServer, /appendAudit\(req, "agent\.business_report"/);
  assert.match(webServer, /appendAudit\(req, "agent\.insurance_policy_draft"/);
  assert.match(webServer, /appendAudit\(req, "agent\.insurance_policy_draft\.approve"/);
  assert.match(webServer, /requireRole\(req, res, \["admin", "dispatcher", "accountant"\]\)/);
  assert.match(webServer, /requireRole\(req, res, \["admin"\]\)/);
});
