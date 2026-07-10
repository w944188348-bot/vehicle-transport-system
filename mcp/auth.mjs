import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { ROOT_DIR } from "./fleet_core.mjs";

const USERS_PATH = path.join(ROOT_DIR, "data", "users.json");
const SECRET_PATH = path.join(ROOT_DIR, "data", "auth-secret.key");
const BOOTSTRAP_PATH = path.join(ROOT_DIR, "data", "bootstrap-admin.txt");
const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export const ROLES = ["admin", "dispatcher", "driver", "accountant", "viewer"];

function ensureDataDir() {
  fs.mkdirSync(path.join(ROOT_DIR, "data"), { recursive: true });
}

export function readJsonFile(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

export function writeJsonFile(filePath, value) {
  ensureDataDir();
  const tempPath = `${filePath}.tmp`;
  fs.writeFileSync(tempPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  fs.renameSync(tempPath, filePath);
}

export function getAuthSecret() {
  ensureDataDir();
  if (!fs.existsSync(SECRET_PATH)) {
    fs.writeFileSync(SECRET_PATH, crypto.randomBytes(32).toString("hex"), { encoding: "utf8", mode: 0o600 });
  }
  return fs.readFileSync(SECRET_PATH, "utf8").trim();
}

export function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.scryptSync(String(password), salt, 64).toString("hex");
  return `scrypt$${salt}$${hash}`;
}

export function verifyPassword(password, stored) {
  const [scheme, salt, hash] = String(stored || "").split("$");
  if (scheme !== "scrypt" || !salt || !hash) return false;
  const candidate = crypto.scryptSync(String(password), salt, 64);
  const expected = Buffer.from(hash, "hex");
  return expected.length === candidate.length && crypto.timingSafeEqual(expected, candidate);
}

export function loadUsers() {
  ensureDataDir();
  const users = readJsonFile(USERS_PATH, []);
  if (Array.isArray(users) && users.length > 0) return users;

  const password = crypto.randomBytes(9).toString("base64url");
  const now = new Date().toISOString();
  const bootstrapAdmin = {
    id: "u_admin",
    name: "系统管理员",
    phone: "admin",
    role: "admin",
    status: "active",
    defaultVehicleId: "",
    passwordHash: hashPassword(password),
    createdAt: now,
    lastLoginAt: "",
  };
  writeJsonFile(USERS_PATH, [bootstrapAdmin]);
  fs.writeFileSync(
    BOOTSTRAP_PATH,
    [
      "车辆运输系统初始管理员",
      "账号: admin",
      `密码: ${password}`,
      `生成时间: ${now}`,
      "首次登录后请立即新增正式管理员并删除此文件。",
      "",
    ].join("\n"),
    { encoding: "utf8", mode: 0o600 },
  );
  return [bootstrapAdmin];
}

export function saveUsers(users) {
  writeJsonFile(USERS_PATH, users);
}

export function publicUser(user) {
  if (!user) return null;
  const { passwordHash, ...safe } = user;
  return safe;
}

function base64urlJson(value) {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function sign(payload, secret = getAuthSecret()) {
  return crypto.createHmac("sha256", secret).update(payload).digest("base64url");
}

export function createToken(user) {
  const header = base64urlJson({ alg: "HS256", typ: "JWT" });
  const now = Date.now();
  const payload = base64urlJson({ sub: user.id, role: user.role, iat: now, exp: now + TOKEN_TTL_MS });
  return `${header}.${payload}.${sign(`${header}.${payload}`)}`;
}

export function verifyToken(token) {
  const parts = String(token || "").split(".");
  if (parts.length !== 3) return null;
  const [header, payload, signature] = parts;
  const expected = sign(`${header}.${payload}`);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  let parsed;
  try {
    parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (!parsed.exp || Date.now() > Number(parsed.exp)) return null;
  const user = loadUsers().find((item) => item.id === parsed.sub && item.status !== "disabled");
  return publicUser(user);
}

export function parseCookies(req) {
  return Object.fromEntries(String(req.headers.cookie || "")
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const index = part.indexOf("=");
      if (index < 0) return [part, ""];
      return [part.slice(0, index), decodeURIComponent(part.slice(index + 1))];
    }));
}

export function userFromRequest(req) {
  const auth = String(req.headers.authorization || "");
  const bearer = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  const cookieToken = parseCookies(req).fleet_token || "";
  return verifyToken(bearer || cookieToken);
}

export function hasRole(user, allowedRoles = []) {
  return Boolean(user && allowedRoles.includes(user.role));
}

export function cookieForToken(token) {
  return `fleet_token=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${Math.floor(TOKEN_TTL_MS / 1000)}`;
}

export function clearCookie() {
  return "fleet_token=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0";
}

export function login(phone, password) {
  const users = loadUsers();
  const user = users.find((item) => item.phone === phone && item.status !== "disabled");
  if (!user || !verifyPassword(password, user.passwordHash)) return null;
  user.lastLoginAt = new Date().toISOString();
  saveUsers(users);
  return { user: publicUser(user), token: createToken(user) };
}

export function listUsers() {
  return loadUsers().map(publicUser);
}

export function upsertUser(input) {
  const users = loadUsers();
  const now = new Date().toISOString();
  const phone = String(input.phone || "").trim();
  if (!phone) throw new Error("账号/手机号不能为空");
  const role = ROLES.includes(input.role) ? input.role : "viewer";
  const existingIndex = users.findIndex((item) => item.id === input.id || item.phone === phone);
  if (existingIndex >= 0) {
    const user = users[existingIndex];
    user.name = input.name || user.name || phone;
    user.phone = phone;
    user.role = role;
    user.status = input.status === "disabled" ? "disabled" : "active";
    user.defaultVehicleId = input.defaultVehicleId || input.default_vehicle_id || user.defaultVehicleId || "";
    if (input.password) user.passwordHash = hashPassword(input.password);
    users[existingIndex] = user;
    saveUsers(users);
    return publicUser(user);
  }
  if (!input.password) throw new Error("新用户必须设置密码");
  const user = {
    id: input.id || `u_${crypto.randomBytes(5).toString("hex")}`,
    name: input.name || phone,
    phone,
    role,
    status: input.status === "disabled" ? "disabled" : "active",
    defaultVehicleId: input.defaultVehicleId || input.default_vehicle_id || "",
    passwordHash: hashPassword(input.password),
    createdAt: now,
    lastLoginAt: "",
  };
  users.push(user);
  saveUsers(users);
  return publicUser(user);
}

export function disableUser(userId) {
  const users = loadUsers();
  const user = users.find((item) => item.id === userId);
  if (!user) throw new Error("用户不存在");
  if (user.role === "admin" && users.filter((item) => item.role === "admin" && item.status !== "disabled").length <= 1) {
    throw new Error("不能禁用最后一个管理员");
  }
  user.status = "disabled";
  saveUsers(users);
  return publicUser(user);
}

export function deleteUser(userId) {
  const users = loadUsers();
  const user = users.find((item) => item.id === userId);
  if (!user) throw new Error("用户不存在");
  if (user.role === "admin" && users.filter((item) => item.role === "admin" && item.status !== "disabled").length <= 1) {
    throw new Error("不能删除最后一个管理员");
  }
  const remainingUsers = users.filter((item) => item.id !== userId);
  saveUsers(remainingUsers);
  return publicUser(user);
}

export function enableUser(userId) {
  const users = loadUsers();
  const user = users.find((item) => item.id === userId);
  if (!user) throw new Error("用户不存在");
  user.status = "active";
  saveUsers(users);
  return publicUser(user);
}
