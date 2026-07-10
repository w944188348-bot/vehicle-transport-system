import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { approveExpenseDraft, approvePaymentDraft, approveSalaryDraft, approveTransportJobDraft, createExpenseDraft, createPaymentDraft, createSalaryDraft, createTransportJobDraft, rejectExpenseDraft, rejectPaymentDraft, rejectSalaryDraft, rejectTransportJobDraft, ROOT_DIR, DATA_PATH, loadData, normalizeData, saveData } from "./mcp/fleet_core.mjs";
import { approveInsurancePolicyDraft, createInsurancePolicyDraft, generateBusinessReport, handleFeishuWebhookPreview } from "./mcp/fleet_agent.mjs";
import { clearCookie, cookieForToken, deleteUser, disableUser, enableUser, hasRole, listUsers, loadUsers, login, upsertUser, userFromRequest } from "./mcp/auth.mjs";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".pdf": "application/pdf",
};

const ATTACHMENT_KINDS = {
  photo: { exts: [".jpg", ".jpeg", ".png", ".webp"], mimePrefix: "image/" },
  pdf: { exts: [".pdf"], mimePrefix: "application/pdf" },
};
const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024; // 5MB
const ATTACHMENTS_DIR = path.join(ROOT_DIR, "data", "attachments");
const BACKUP_DIR = path.join(ROOT_DIR, "data", "backups");
const AUDIT_LOG = path.join(ROOT_DIR, "data", "audit.log");
const VERSION = "v5.1";

function parseArgs() {
  const args = globalThis.process?.argv?.slice(2) || [];
  const options = { host: "127.0.0.1", port: 8765 };
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === "--host") options.host = args[i + 1] || options.host;
    if (args[i] === "--port") options.port = Number(args[i + 1] || options.port);
  }
  return options;
}

function sendJson(res, status, payload) {
  const body = Buffer.from(JSON.stringify(payload, null, 2), "utf8");
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": body.length,
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function staticHeaders(ext) {
  const headers = {
    "content-type": MIME[ext] || "application/octet-stream",
    "cache-control": "no-store, max-age=0",
    "x-content-type-options": "nosniff",
  };
  return headers;
}

// v4.1 收紧：只允许本机 + 局域网 + Tailscale + 私网
// 用于限制 /api/upload 和 /api/attachments/* 这两个新端点
function normalizeIp(addr) {
  if (!addr) return "";
  return String(addr).replace(/^::ffff:/, "");
}

function isTrustedIp(req) {
  const ip = normalizeIp(req.socket.remoteAddress);
  if (ip === "127.0.0.1" || ip === "::1") return true;
  if (ip.startsWith("192.168.") || ip.startsWith("10.")) return true;
  const ts = ip.match(/^100\.(\d+)\./);
  if (ts && Number(ts[1]) >= 64 && Number(ts[1]) <= 127) return true;
  const m = ip.match(/^172\.(\d+)\./);
  if (m && Number(m[1]) >= 16 && Number(m[1]) <= 31) return true;
  return false;
}

function serveFile(req, res) {
  const url = new URL(req.url, "http://127.0.0.1");
  const pathname = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
  const target = path.normalize(path.join(ROOT_DIR, pathname));
  if (!target.startsWith(ROOT_DIR)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }
  if (!fs.existsSync(target) || fs.statSync(target).isDirectory()) {
    res.writeHead(404);
    res.end("Not found");
    return;
  }
  res.writeHead(200, staticHeaders(path.extname(target)));
  fs.createReadStream(target).pipe(res);
}

function safeVehicleId(input) {
  return String(input || "").replace(/[^a-zA-Z0-9_]/g, "").slice(0, 32);
}

function timestampForFilename() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

// v4.1.1 商业化交付最低数据保护：写入前自动备份，避免一次 POST /api/data 覆盖导致不可恢复。
function backupDataBeforeWrite() {
  if (!fs.existsSync(DATA_PATH)) return null;
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const backupPath = path.join(BACKUP_DIR, `fleet-data.${timestampForFilename()}.json`);
  fs.copyFileSync(DATA_PATH, backupPath);
  pruneOldBackups(30);
  return backupPath;
}

function pruneOldBackups(keep = 30) {
  if (!fs.existsSync(BACKUP_DIR)) return;
  const backups = fs.readdirSync(BACKUP_DIR)
    .filter((name) => /^fleet-data\..+\.json$/.test(name))
    .map((name) => ({ name, path: path.join(BACKUP_DIR, name), mtime: fs.statSync(path.join(BACKUP_DIR, name)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
  for (const item of backups.slice(keep)) {
    fs.unlinkSync(item.path);
  }
}

function appendAudit(req, action, extra = {}) {
  fs.mkdirSync(path.dirname(AUDIT_LOG), { recursive: true });
  const row = {
    ts: new Date().toISOString(),
    action,
    ip: normalizeIp(req.socket.remoteAddress),
    userAgent: req.headers["user-agent"] || "",
    ...extra,
  };
  fs.appendFileSync(AUDIT_LOG, `${JSON.stringify(row)}\n`, "utf8");
}

function currentUser(req) {
  return userFromRequest(req);
}

function unauthorized(res) {
  return sendJson(res, 401, { ok: false, error: "unauthorized" });
}

function forbidden(res) {
  return sendJson(res, 403, { ok: false, error: "forbidden" });
}

function requireUser(req, res) {
  const user = currentUser(req);
  if (!user) {
    unauthorized(res);
    return null;
  }
  return user;
}

function requireRole(req, res, roles) {
  const user = requireUser(req, res);
  if (!user) return null;
  if (!hasRole(user, roles)) {
    forbidden(res);
    return null;
  }
  return user;
}

function deleteDraftRecord(req, res, url, prefix, collection, draftType) {
  const user = requireUser(req, res);
  if (!user) return;
  try {
    const draftId = decodeURIComponent(url.pathname.slice(prefix.length));
    const data = loadData();
    const drafts = data[collection] || [];
    const index = drafts.findIndex((draft) => draft.id === draftId);
    if (index < 0) throw new Error("未找到提交草稿");
    const draft = drafts[index];
    if (draft.status === "approved") throw new Error("已审核草稿不能删除");
    if (!hasRole(user, ["admin"]) && draft.createdBy !== user.id) throw new Error("不能删除他人提交的草稿");
    const backupPath = backupDataBeforeWrite();
    drafts.splice(index, 1);
    saveData(data);
    appendAudit(req, "drafts.delete", { userId: user.id, role: user.role, draftType, draftId, backup: backupPath ? path.basename(backupPath) : null });
    sendJson(res, 200, { ok: true, version: VERSION, backup: backupPath ? path.basename(backupPath) : null, data: loadData() });
  } catch (error) {
    try { appendAudit(req, "drafts.delete.failed", { userId: user.id, draftType, error: error.message || String(error) }); } catch (_) {}
    sendJson(res, 400, { ok: false, error: error.message || String(error) });
  }
}

function redirectToLogin(res) {
  res.writeHead(302, { location: "/login.html" });
  res.end();
}

// POST /api/upload
// body: { entity_id, kind: 'photo'|'pdf', filename, content_b64 }
// 返回: { ok, filename, url, size }
async function handleUpload(req, res) {
  if (!isTrustedIp(req)) {
    return sendJson(res, 403, { ok: false, error: "forbidden: not in trusted network" });
  }
  const user = requireRole(req, res, ["admin", "dispatcher", "accountant"]);
  if (!user) return;
  const raw = await readBody(req);
  let payload;
  try {
    payload = JSON.parse(raw);
  } catch (error) {
    return sendJson(res, 400, { ok: false, error: "invalid json" });
  }
  const { entity_id, vehicle_id, kind, filename, content_b64 } = payload || {};
  const ownerId = entity_id || vehicle_id;
  if (!ownerId || !kind || !filename || !content_b64) {
    return sendJson(res, 400, { ok: false, error: "missing fields: entity_id/kind/filename/content_b64" });
  }
  const allowed = ATTACHMENT_KINDS[kind];
  if (!allowed) {
    return sendJson(res, 400, { ok: false, error: "bad kind: must be photo or pdf" });
  }
  const ext = path.extname(String(filename)).toLowerCase();
  if (!allowed.exts.includes(ext)) {
    return sendJson(res, 400, { ok: false, error: `bad extension for ${kind}: ${allowed.exts.join(", ")}` });
  }
  if (content_b64.length > MAX_ATTACHMENT_BYTES * 2) {
    return sendJson(res, 413, { ok: false, error: "file too large (>5MB)" });
  }
  const buf = Buffer.from(content_b64, "base64");
  if (buf.length === 0 || buf.length > MAX_ATTACHMENT_BYTES) {
    return sendJson(res, 413, { ok: false, error: "file too large (>5MB) or empty" });
  }
  // magic bytes 校验
  if (kind === "pdf" && buf.slice(0, 4).toString("utf8") !== "%PDF") {
    return sendJson(res, 400, { ok: false, error: "pdf magic bytes missing" });
  }
  if (kind === "photo") {
    const isJpeg = buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
    const isPng = buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
    const isWebp = buf.slice(0, 4).toString("utf8") === "RIFF" && buf.slice(8, 12).toString("utf8") === "WEBP";
    if (!isJpeg && !isPng && !isWebp) {
      return sendJson(res, 400, { ok: false, error: "image magic bytes invalid" });
    }
  }
  const safeVid = safeVehicleId(ownerId);
  if (!safeVid) {
    return sendJson(res, 400, { ok: false, error: "bad vehicle_id" });
  }
  const ts = Date.now();
  const rand = crypto.randomBytes(3).toString("hex");
  const safeName = `${safeVid}__${kind}__${ts}__${rand}${ext}`;
  fs.mkdirSync(ATTACHMENTS_DIR, { recursive: true });
  const target = path.normalize(path.join(ATTACHMENTS_DIR, safeName));
  if (!target.startsWith(ATTACHMENTS_DIR + path.sep)) {
    return sendJson(res, 400, { ok: false, error: "bad path" });
  }
  fs.writeFileSync(target, buf);
  return sendJson(res, 200, {
    ok: true,
    filename: safeName,
    url: `/api/attachments/${safeName}`,
    size: buf.length,
  });
}

// GET /api/attachments/:filename
async function handleAttachment(req, res, filename) {
  if (!isTrustedIp(req)) {
    res.writeHead(403);
    res.end("forbidden");
    return;
  }
  if (!requireUser(req, res)) return;
  if (!filename || filename.includes("/") || filename.includes("\\") || filename.startsWith(".") || !/^[\w.-]+$/.test(filename)) {
    res.writeHead(400);
    res.end("bad filename");
    return;
  }
  const target = path.normalize(path.join(ATTACHMENTS_DIR, filename));
  if (!target.startsWith(ATTACHMENTS_DIR + path.sep)) {
    res.writeHead(400);
    res.end("bad path");
    return;
  }
  if (!fs.existsSync(target) || fs.statSync(target).isDirectory()) {
    res.writeHead(404);
    res.end("not found");
    return;
  }
  const ext = path.extname(filename).toLowerCase();
  const mime = MIME[ext] || "application/octet-stream";
  res.writeHead(200, { "content-type": mime, "content-length": fs.statSync(target).size });
  fs.createReadStream(target).pipe(res);
}

async function handle(req, res) {
  const url = new URL(req.url, "http://127.0.0.1");
  if (req.method === "GET" && url.pathname === "/api/health") {
    sendJson(res, 200, { ok: true, version: VERSION });
    return;
  }
  if (req.method === "POST" && url.pathname === "/api/auth/login") {
    try {
      loadUsers();
      const payload = JSON.parse(await readBody(req));
      const result = login(String(payload.phone || "").trim(), String(payload.password || ""));
      if (!result) {
        appendAudit(req, "auth.login.failed", { phone: String(payload.phone || "").trim() });
        return sendJson(res, 401, { ok: false, error: "账号或密码错误" });
      }
      appendAudit(req, "auth.login.success", { userId: result.user.id, role: result.user.role });
      const body = Buffer.from(JSON.stringify({ ok: true, user: result.user }, null, 2), "utf8");
      res.writeHead(200, {
        "content-type": "application/json; charset=utf-8",
        "content-length": body.length,
        "set-cookie": cookieForToken(result.token),
      });
      res.end(body);
    } catch (error) {
      sendJson(res, 400, { ok: false, error: error.message || String(error) });
    }
    return;
  }
  if (req.method === "POST" && url.pathname === "/api/auth/logout") {
    const user = currentUser(req);
    if (user) appendAudit(req, "auth.logout", { userId: user.id, role: user.role });
    res.writeHead(200, { "content-type": "application/json; charset=utf-8", "set-cookie": clearCookie() });
    res.end(JSON.stringify({ ok: true }));
    return;
  }
  if (req.method === "GET" && url.pathname === "/api/auth/me") {
    const user = requireUser(req, res);
    if (!user) return;
    sendJson(res, 200, { ok: true, user });
    return;
  }
  if (req.method === "GET" && url.pathname === "/api/users") {
    const user = requireRole(req, res, ["admin"]);
    if (!user) return;
    sendJson(res, 200, { ok: true, users: listUsers() });
    return;
  }
  if (req.method === "POST" && url.pathname === "/api/users") {
    const user = requireRole(req, res, ["admin"]);
    if (!user) return;
    try {
      const payload = JSON.parse(await readBody(req));
      const saved = upsertUser(payload);
      appendAudit(req, "users.upsert", {
        userId: user.id,
        actorRole: user.role,
        targetUserId: saved.id,
        targetRole: saved.role,
      });
      sendJson(res, 200, { ok: true, user: saved });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: error.message || String(error) });
    }
    return;
  }
  if (req.method === "POST" && url.pathname.startsWith("/api/users/") && url.pathname.endsWith("/disable")) {
    const user = requireRole(req, res, ["admin"]);
    if (!user) return;
    try {
      const prefix = "/api/users/";
      const suffix = "/disable";
      const targetUserId = decodeURIComponent(url.pathname.slice(prefix.length, -suffix.length));
      const disabled = disableUser(targetUserId);
      appendAudit(req, "users.disable", { userId: user.id, targetUserId: disabled.id });
      sendJson(res, 200, { ok: true, user: disabled });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: error.message || String(error) });
    }
    return;
  }
  if (req.method === "DELETE" && url.pathname.startsWith("/api/users/")) {
    const user = requireRole(req, res, ["admin"]);
    if (!user) return;
    try {
      const targetUserId = decodeURIComponent(url.pathname.slice("/api/users/".length));
      if (targetUserId === user.id) throw new Error("不能删除当前登录用户");
      const deleted = deleteUser(targetUserId);
      appendAudit(req, "users.delete", { userId: user.id, targetUserId: deleted.id });
      sendJson(res, 200, { ok: true, user: deleted });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: error.message || String(error) });
    }
    return;
  }
  if (req.method === "POST" && url.pathname.startsWith("/api/users/") && url.pathname.endsWith("/enable")) {
    const user = requireRole(req, res, ["admin"]);
    if (!user) return;
    try {
      const prefix = "/api/users/";
      const suffix = "/enable";
      const targetUserId = decodeURIComponent(url.pathname.slice(prefix.length, -suffix.length));
      const enabled = enableUser(targetUserId);
      appendAudit(req, "users.enable", { userId: user.id, targetUserId: enabled.id });
      sendJson(res, 200, { ok: true, user: enabled });
    } catch (error) {
      sendJson(res, 400, { ok: false, error: error.message || String(error) });
    }
    return;
  }
  if (req.method === "POST" && url.pathname === "/api/jobs/create") {
    const user = requireRole(req, res, ["admin", "dispatcher", "driver", "accountant"]);
    if (!user) return;
    try {
      const payload = JSON.parse(await readBody(req));
      const backupPath = backupDataBeforeWrite();
      const draft = createTransportJobDraft({ ...payload, driver: payload.driver || user.name || user.phone }, user);
      appendAudit(req, "jobs.draft.create", { userId: user.id, role: user.role, draftId: draft.id, legacyEndpoint: true, backup: backupPath ? path.basename(backupPath) : null });
      sendJson(res, 200, { ok: true, version: VERSION, backup: backupPath ? path.basename(backupPath) : null, draft, data: loadData() });
    } catch (error) {
      try { appendAudit(req, "jobs.draft.create.failed", { userId: user.id, error: error.message || String(error), legacyEndpoint: true }); } catch (_) {}
      sendJson(res, 400, { ok: false, error: error.message || String(error) });
    }
    return;
  }
  if (req.method === "POST" && url.pathname === "/api/job-drafts") {
    const user = requireRole(req, res, ["admin", "dispatcher", "driver", "accountant"]);
    if (!user) return;
    try {
      const payload = JSON.parse(await readBody(req));
      const backupPath = backupDataBeforeWrite();
      const draft = createTransportJobDraft(payload, user);
      appendAudit(req, "jobs.draft.create", { userId: user.id, role: user.role, draftId: draft.id, backup: backupPath ? path.basename(backupPath) : null });
      sendJson(res, 200, { ok: true, version: VERSION, backup: backupPath ? path.basename(backupPath) : null, draft, data: loadData() });
    } catch (error) {
      try { appendAudit(req, "jobs.draft.create.failed", { userId: user.id, error: error.message || String(error) }); } catch (_) {}
      sendJson(res, 400, { ok: false, error: error.message || String(error) });
    }
    return;
  }
  if (req.method === "DELETE" && url.pathname.startsWith("/api/job-drafts/")) {
    return deleteDraftRecord(req, res, url, "/api/job-drafts/", "jobDrafts", "job");
  }
  if (req.method === "POST" && url.pathname.startsWith("/api/job-drafts/") && url.pathname.endsWith("/approve")) {
    const user = requireRole(req, res, ["admin"]);
    if (!user) return;
    try {
      const prefix = "/api/job-drafts/";
      const suffix = "/approve";
      const draftId = decodeURIComponent(url.pathname.slice(prefix.length, -suffix.length));
      const backupPath = backupDataBeforeWrite();
      const result = approveTransportJobDraft(draftId, user);
      appendAudit(req, "jobs.draft.approve", { userId: user.id, draftId: result.draft.id, jobId: result.job.id, backup: backupPath ? path.basename(backupPath) : null });
      sendJson(res, 200, { ok: true, version: VERSION, backup: backupPath ? path.basename(backupPath) : null, ...result, data: loadData() });
    } catch (error) {
      try { appendAudit(req, "jobs.draft.approve.failed", { userId: user.id, error: error.message || String(error) }); } catch (_) {}
      sendJson(res, 400, { ok: false, error: error.message || String(error) });
    }
    return;
  }
  if (req.method === "POST" && url.pathname.startsWith("/api/job-drafts/") && url.pathname.endsWith("/reject")) {
    const user = requireRole(req, res, ["admin"]);
    if (!user) return;
    try {
      const prefix = "/api/job-drafts/";
      const suffix = "/reject";
      const draftId = decodeURIComponent(url.pathname.slice(prefix.length, -suffix.length));
      const payload = JSON.parse(await readBody(req) || "{}");
      const backupPath = backupDataBeforeWrite();
      const draft = rejectTransportJobDraft(draftId, user, payload.reason || "");
      appendAudit(req, "jobs.draft.reject", { userId: user.id, draftId: draft.id, backup: backupPath ? path.basename(backupPath) : null });
      sendJson(res, 200, { ok: true, version: VERSION, backup: backupPath ? path.basename(backupPath) : null, draft, data: loadData() });
    } catch (error) {
      try { appendAudit(req, "jobs.draft.reject.failed", { userId: user.id, error: error.message || String(error) }); } catch (_) {}
      sendJson(res, 400, { ok: false, error: error.message || String(error) });
    }
    return;
  }
  if (req.method === "GET" && url.pathname === "/api/data") {
    const user = requireUser(req, res);
    if (!user) return;
    sendJson(res, 200, loadData());
    return;
  }
  if (req.method === "POST" && url.pathname === "/api/agent/report") {
    const user = requireRole(req, res, ["admin", "dispatcher", "accountant"]);
    if (!user) return;
    try {
      const payload = JSON.parse((await readBody(req)) || "{}");
      const result = generateBusinessReport({ ...payload, channel: "web", actor: user });
      appendAudit(req, "agent.business_report", { userId: user.id, role: user.role, taskId: result.task.id, month: result.summary.month });
      sendJson(res, 200, { ok: true, version: VERSION, ...result });
    } catch (error) {
      try { appendAudit(req, "agent.business_report.failed", { userId: user.id, error: error.message || String(error) }); } catch (_) {}
      sendJson(res, 400, { ok: false, error: error.message || String(error) });
    }
    return;
  }
  if (req.method === "POST" && url.pathname === "/api/agent/insurance-drafts") {
    const user = requireRole(req, res, ["admin", "dispatcher", "accountant"]);
    if (!user) return;
    try {
      const payload = JSON.parse((await readBody(req)) || "{}");
      const result = createInsurancePolicyDraft({ ...payload, channel: "web", actor: user });
      appendAudit(req, "agent.insurance_policy_draft", {
        userId: user.id,
        role: user.role,
        taskId: result.task.id,
        plate: result.extracted.plate,
        matchedVehicleId: result.draft.matchedVehicleId,
      });
      sendJson(res, 200, { ok: true, version: VERSION, ...result });
    } catch (error) {
      try { appendAudit(req, "agent.insurance_policy_draft.failed", { userId: user.id, error: error.message || String(error) }); } catch (_) {}
      sendJson(res, 400, { ok: false, error: error.message || String(error) });
    }
    return;
  }
  if (req.method === "POST" && url.pathname.startsWith("/api/agent/insurance-drafts/") && url.pathname.endsWith("/approve")) {
    const user = requireRole(req, res, ["admin"]);
    if (!user) return;
    try {
      const prefix = "/api/agent/insurance-drafts/";
      const suffix = "/approve";
      const draftId = decodeURIComponent(url.pathname.slice(prefix.length, -suffix.length));
      const backupPath = backupDataBeforeWrite();
      const result = approveInsurancePolicyDraft({ draftId, channel: "web", actor: user });
      appendAudit(req, "agent.insurance_policy_draft.approve", {
        userId: user.id,
        role: user.role,
        taskId: result.task.id,
        vehicleId: result.vehicle.id,
        backup: backupPath ? path.basename(backupPath) : null,
      });
      sendJson(res, 200, { ok: true, version: VERSION, backup: backupPath ? path.basename(backupPath) : null, ...result, data: loadData() });
    } catch (error) {
      try { appendAudit(req, "agent.insurance_policy_draft.approve.failed", { userId: user.id, error: error.message || String(error) }); } catch (_) {}
      sendJson(res, 400, { ok: false, error: error.message || String(error) });
    }
    return;
  }
  if (req.method === "POST" && url.pathname === "/api/agent/feishu-preview") {
    const user = requireRole(req, res, ["admin", "dispatcher", "accountant"]);
    if (!user) return;
    try {
      const payload = JSON.parse((await readBody(req)) || "{}");
      const result = handleFeishuWebhookPreview({ ...payload, user_id: payload.user_id || user.id, name: payload.name || user.name || user.phone });
      appendAudit(req, "agent.feishu_preview", { userId: user.id, role: user.role, taskId: result.task?.id || result.draft?.id || "" });
      sendJson(res, 200, { ok: true, version: VERSION, ...result });
    } catch (error) {
      try { appendAudit(req, "agent.feishu_preview.failed", { userId: user.id, error: error.message || String(error) }); } catch (_) {}
      sendJson(res, 400, { ok: false, error: error.message || String(error) });
    }
    return;
  }
  if (req.method === "POST" && url.pathname === "/api/expense-drafts") {
    const user = requireRole(req, res, ["admin", "accountant"]);
    if (!user) return;
    try {
      const payload = JSON.parse(await readBody(req));
      const backupPath = backupDataBeforeWrite();
      const draft = createExpenseDraft(payload, user);
      appendAudit(req, "expenses.draft.create", { userId: user.id, role: user.role, draftId: draft.id, backup: backupPath ? path.basename(backupPath) : null });
      sendJson(res, 200, { ok: true, version: VERSION, backup: backupPath ? path.basename(backupPath) : null, draft, data: loadData() });
    } catch (error) {
      try { appendAudit(req, "expenses.draft.create.failed", { userId: user.id, error: error.message || String(error) }); } catch (_) {}
      sendJson(res, 400, { ok: false, error: error.message || String(error) });
    }
    return;
  }
  if (req.method === "DELETE" && url.pathname.startsWith("/api/expense-drafts/")) {
    return deleteDraftRecord(req, res, url, "/api/expense-drafts/", "expenseDrafts", "expense");
  }
  if (req.method === "POST" && url.pathname.startsWith("/api/expense-drafts/") && url.pathname.endsWith("/approve")) {
    const user = requireRole(req, res, ["admin"]);
    if (!user) return;
    try {
      const prefix = "/api/expense-drafts/";
      const suffix = "/approve";
      const draftId = decodeURIComponent(url.pathname.slice(prefix.length, -suffix.length));
      const backupPath = backupDataBeforeWrite();
      const result = approveExpenseDraft(draftId, user);
      appendAudit(req, "expenses.draft.approve", { userId: user.id, draftId: result.draft.id, expenseId: result.expense.id, backup: backupPath ? path.basename(backupPath) : null });
      sendJson(res, 200, { ok: true, version: VERSION, backup: backupPath ? path.basename(backupPath) : null, ...result, data: loadData() });
    } catch (error) {
      try { appendAudit(req, "expenses.draft.approve.failed", { userId: user.id, error: error.message || String(error) }); } catch (_) {}
      sendJson(res, 400, { ok: false, error: error.message || String(error) });
    }
    return;
  }
  if (req.method === "POST" && url.pathname.startsWith("/api/expense-drafts/") && url.pathname.endsWith("/reject")) {
    const user = requireRole(req, res, ["admin"]);
    if (!user) return;
    try {
      const prefix = "/api/expense-drafts/";
      const suffix = "/reject";
      const draftId = decodeURIComponent(url.pathname.slice(prefix.length, -suffix.length));
      const payload = JSON.parse(await readBody(req) || "{}");
      const backupPath = backupDataBeforeWrite();
      const draft = rejectExpenseDraft(draftId, user, payload.reason || "");
      appendAudit(req, "expenses.draft.reject", { userId: user.id, draftId: draft.id, backup: backupPath ? path.basename(backupPath) : null });
      sendJson(res, 200, { ok: true, version: VERSION, backup: backupPath ? path.basename(backupPath) : null, draft, data: loadData() });
    } catch (error) {
      try { appendAudit(req, "expenses.draft.reject.failed", { userId: user.id, error: error.message || String(error) }); } catch (_) {}
      sendJson(res, 400, { ok: false, error: error.message || String(error) });
    }
    return;
  }
  if (req.method === "POST" && url.pathname === "/api/salary-drafts") {
    const user = requireRole(req, res, ["admin", "accountant"]);
    if (!user) return;
    try {
      const payload = JSON.parse(await readBody(req));
      const backupPath = backupDataBeforeWrite();
      const draft = createSalaryDraft(payload, user);
      appendAudit(req, "salaries.draft.create", { userId: user.id, role: user.role, draftId: draft.id, backup: backupPath ? path.basename(backupPath) : null });
      sendJson(res, 200, { ok: true, version: VERSION, backup: backupPath ? path.basename(backupPath) : null, draft, data: loadData() });
    } catch (error) {
      try { appendAudit(req, "salaries.draft.create.failed", { userId: user.id, error: error.message || String(error) }); } catch (_) {}
      sendJson(res, 400, { ok: false, error: error.message || String(error) });
    }
    return;
  }
  if (req.method === "POST" && url.pathname === "/api/payment-drafts") {
    const user = requireRole(req, res, ["admin", "accountant"]);
    if (!user) return;
    try {
      const payload = JSON.parse(await readBody(req));
      const backupPath = backupDataBeforeWrite();
      const draft = createPaymentDraft(payload, user);
      appendAudit(req, "payments.draft.create", { userId: user.id, role: user.role, draftId: draft.id, backup: backupPath ? path.basename(backupPath) : null });
      sendJson(res, 200, { ok: true, version: VERSION, backup: backupPath ? path.basename(backupPath) : null, draft, data: loadData() });
    } catch (error) {
      try { appendAudit(req, "payments.draft.create.failed", { userId: user.id, error: error.message || String(error) }); } catch (_) {}
      sendJson(res, 400, { ok: false, error: error.message || String(error) });
    }
    return;
  }
  if (req.method === "DELETE" && url.pathname.startsWith("/api/payment-drafts/")) {
    return deleteDraftRecord(req, res, url, "/api/payment-drafts/", "paymentDrafts", "payment");
  }
  if (req.method === "POST" && url.pathname.startsWith("/api/payment-drafts/") && url.pathname.endsWith("/approve")) {
    const user = requireRole(req, res, ["admin"]);
    if (!user) return;
    try {
      const prefix = "/api/payment-drafts/";
      const suffix = "/approve";
      const draftId = decodeURIComponent(url.pathname.slice(prefix.length, -suffix.length));
      const backupPath = backupDataBeforeWrite();
      const result = approvePaymentDraft(draftId, user);
      appendAudit(req, "payments.draft.approve", { userId: user.id, draftId: result.draft.id, paymentId: result.payment.id, backup: backupPath ? path.basename(backupPath) : null });
      sendJson(res, 200, { ok: true, version: VERSION, backup: backupPath ? path.basename(backupPath) : null, ...result, data: loadData() });
    } catch (error) {
      try { appendAudit(req, "payments.draft.approve.failed", { userId: user.id, error: error.message || String(error) }); } catch (_) {}
      sendJson(res, 400, { ok: false, error: error.message || String(error) });
    }
    return;
  }
  if (req.method === "POST" && url.pathname.startsWith("/api/payment-drafts/") && url.pathname.endsWith("/reject")) {
    const user = requireRole(req, res, ["admin"]);
    if (!user) return;
    try {
      const prefix = "/api/payment-drafts/";
      const suffix = "/reject";
      const draftId = decodeURIComponent(url.pathname.slice(prefix.length, -suffix.length));
      const payload = JSON.parse(await readBody(req) || "{}");
      const backupPath = backupDataBeforeWrite();
      const draft = rejectPaymentDraft(draftId, user, payload.reason || "");
      appendAudit(req, "payments.draft.reject", { userId: user.id, draftId: draft.id, backup: backupPath ? path.basename(backupPath) : null });
      sendJson(res, 200, { ok: true, version: VERSION, backup: backupPath ? path.basename(backupPath) : null, draft, data: loadData() });
    } catch (error) {
      try { appendAudit(req, "payments.draft.reject.failed", { userId: user.id, error: error.message || String(error) }); } catch (_) {}
      sendJson(res, 400, { ok: false, error: error.message || String(error) });
    }
    return;
  }
  if (req.method === "DELETE" && url.pathname.startsWith("/api/salary-drafts/")) {
    return deleteDraftRecord(req, res, url, "/api/salary-drafts/", "salaryDrafts", "salary");
  }
  if (req.method === "POST" && url.pathname.startsWith("/api/salary-drafts/") && url.pathname.endsWith("/approve")) {
    const user = requireRole(req, res, ["admin"]);
    if (!user) return;
    try {
      const prefix = "/api/salary-drafts/";
      const suffix = "/approve";
      const draftId = decodeURIComponent(url.pathname.slice(prefix.length, -suffix.length));
      const backupPath = backupDataBeforeWrite();
      const result = approveSalaryDraft(draftId, user);
      appendAudit(req, "salaries.draft.approve", { userId: user.id, draftId: result.draft.id, salaryId: result.salary.id, backup: backupPath ? path.basename(backupPath) : null });
      sendJson(res, 200, { ok: true, version: VERSION, backup: backupPath ? path.basename(backupPath) : null, ...result, data: loadData() });
    } catch (error) {
      try { appendAudit(req, "salaries.draft.approve.failed", { userId: user.id, error: error.message || String(error) }); } catch (_) {}
      sendJson(res, 400, { ok: false, error: error.message || String(error) });
    }
    return;
  }
  if (req.method === "POST" && url.pathname.startsWith("/api/salary-drafts/") && url.pathname.endsWith("/reject")) {
    const user = requireRole(req, res, ["admin"]);
    if (!user) return;
    try {
      const prefix = "/api/salary-drafts/";
      const suffix = "/reject";
      const draftId = decodeURIComponent(url.pathname.slice(prefix.length, -suffix.length));
      const payload = JSON.parse(await readBody(req) || "{}");
      const backupPath = backupDataBeforeWrite();
      const draft = rejectSalaryDraft(draftId, user, payload.reason || "");
      appendAudit(req, "salaries.draft.reject", { userId: user.id, draftId: draft.id, backup: backupPath ? path.basename(backupPath) : null });
      sendJson(res, 200, { ok: true, version: VERSION, backup: backupPath ? path.basename(backupPath) : null, draft, data: loadData() });
    } catch (error) {
      try { appendAudit(req, "salaries.draft.reject.failed", { userId: user.id, error: error.message || String(error) }); } catch (_) {}
      sendJson(res, 400, { ok: false, error: error.message || String(error) });
    }
    return;
  }
  if (req.method === "POST" && url.pathname === "/api/data") {
    const user = requireRole(req, res, ["admin", "dispatcher"]);
    if (!user) return;
    try {
      const data = normalizeData(JSON.parse(await readBody(req)));
      const backupPath = backupDataBeforeWrite();
      saveData(data);
      appendAudit(req, "api.data.replace", {
        userId: user.id,
        role: user.role,
        backup: backupPath ? path.basename(backupPath) : null,
        counts: Object.fromEntries(Object.entries(data).map(([key, value]) => [key, Array.isArray(value) ? value.length : 0])),
      });
      sendJson(res, 200, { ok: true, version: VERSION, backup: backupPath ? path.basename(backupPath) : null, data });
    } catch (error) {
      try { appendAudit(req, "api.data.replace.failed", { userId: user.id, error: error.message || String(error) }); } catch (_) {}
      sendJson(res, 400, { ok: false, error: error.message || String(error) });
    }
    return;
  }
  if (req.method === "POST" && url.pathname === "/api/upload") {
    try {
      await handleUpload(req, res);
    } catch (error) {
      sendJson(res, 500, { ok: false, error: error.message || String(error) });
    }
    return;
  }
  if (req.method === "GET" && url.pathname.startsWith("/api/attachments/")) {
    const filename = decodeURIComponent(url.pathname.slice("/api/attachments/".length));
    handleAttachment(req, res, filename).catch((error) => {
      sendJson(res, 500, { ok: false, error: error.message || String(error) });
    });
    return;
  }
  if (req.method === "GET") {
    if ((url.pathname === "/" || url.pathname === "/index.html") && !currentUser(req)) {
      redirectToLogin(res);
      return;
    }
    serveFile(req, res);
    return;
  }
  res.writeHead(405);
  res.end("Method not allowed");
}

export function createFleetWebServer() {
  return http.createServer((req, res) => {
    handle(req, res).catch((error) => sendJson(res, 500, { ok: false, error: error.message || String(error) }));
  });
}

export function startFleetWebServer(options = parseArgs()) {
  const server = createFleetWebServer();
  server.listen(options.port, options.host, () => {
    console.log(`车辆运输管理系统已启动: http://${options.host}:${options.port}`);
  });
  return server;
}

if (globalThis.process?.argv?.[1] && fileURLToPath(import.meta.url) === path.resolve(globalThis.process.argv[1])) {
  startFleetWebServer();
}
