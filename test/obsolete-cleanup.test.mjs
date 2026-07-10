import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const webServer = fs.readFileSync(new URL("../web_server.mjs", import.meta.url), "utf8");
const fleetCore = fs.readFileSync(new URL("../mcp/fleet_core.mjs", import.meta.url), "utf8");
const appJs = fs.readFileSync(new URL("../app.js", import.meta.url), "utf8");

function exists(relativePath) {
  return fs.existsSync(new URL(`../${relativePath}`, import.meta.url));
}

test("obsolete stock-in write endpoints and core mutators are removed", () => {
  assert.doesNotMatch(webServer, /\/api\/stock-in-drafts/);
  assert.doesNotMatch(webServer, /createStockInDraft|approveStockInDraft|rejectStockInDraft/);
  assert.doesNotMatch(fleetCore, /export function createStockInDraft/);
  assert.doesNotMatch(fleetCore, /export function approveStockInDraft/);
  assert.doesNotMatch(fleetCore, /export function rejectStockInDraft/);
});

test("legacy stock data read compatibility remains intact", () => {
  assert.match(fleetCore, /"stockInDrafts"/);
  assert.match(fleetCore, /"stockIns"/);
  assert.match(appJs, /stockInDrafts/);
  assert.match(appJs, /stockIns/);
  assert.match(appJs, /function deriveExpenseDrafts/);
  assert.match(appJs, /function mergeExpenses/);
});

test("unused legacy assets and Windows launch scripts are removed", () => {
  assert.equal(exists("assets/vehicle-transport-logo-v2.png"), false);
  assert.equal(exists("assets/vehicle-transport-nav-logo.png"), false);
  assert.equal(exists("start-web.cmd"), false);
  assert.equal(exists("start-mcp.cmd"), false);
});
