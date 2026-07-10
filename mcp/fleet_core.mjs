import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT_DIR = path.resolve(__dirname, "..");
export const DATA_PATH = globalThis.process?.env?.FLEET_DATA_PATH || path.join(ROOT_DIR, "data", "fleet-data.json");
const COLLECTIONS = ["vehicles", "customers", "personnel", "jobs", "jobDrafts", "expenseDrafts", "expenses", "salaryDrafts", "salaries", "paymentDrafts", "payments", "stockInDrafts", "stockIns"];

export function today() {
  return new Date().toISOString().slice(0, 10);
}

export function currentMonth() {
  return today().slice(0, 7);
}

export function newId(prefix) {
  return `${prefix}_${crypto.randomBytes(5).toString("hex")}`;
}

export function number(value, fallback = 0) {
  if (value === undefined || value === null || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function cleanText(value) {
  return String(value ?? "").trim();
}

function documentNumber(row = {}) {
  return cleanText(row.documentNo || row.document_no || row.ticketNo || row.ticket_no);
}

function sameRecord(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function assertChanged(original, oldValue, newValue) {
  if (original && sameRecord(oldValue, newValue)) throw new Error("无变动");
}

function comparableTransportJob(row = {}) {
  row = row || {};
  return {
    date: cleanText(row.date),
    documentNo: documentNumber(row),
    vehicleId: cleanText(row.vehicleId),
    customerId: cleanText(row.customerId),
    driverId: cleanText(row.driverId),
    driver: cleanText(row.driver),
    workType: cleanText(row.workType || "混凝土运输"),
    site: cleanText(row.site),
    project: cleanText(row.project),
    trips: number(row.trips),
    volume: number(row.volume),
    settlementVolume: number(row.settlementVolume, number(row.volume)),
    materialVolume: number(row.materialVolume),
    pumpHours: number(row.pumpHours),
    odometer: number(row.odometer),
    unitPrice: number(row.unitPrice),
    materialUnitPrice: number(row.materialUnitPrice),
    overtimeUnitPrice: number(row.overtimeUnitPrice),
    amount: number(row.amount),
    paid: number(row.paid),
    paymentMethod: cleanText(row.paymentMethod),
    note: cleanText(row.note),
  };
}

function comparableExpense(row = {}) {
  row = row || {};
  return {
    date: cleanText(row.date),
    vehicleId: cleanText(row.vehicleId),
    type: cleanText(row.type || row.itemName || "其他"),
    itemName: cleanText(row.itemName || row.type),
    quantity: number(row.quantity),
    unit: cleanText(row.unit || "件"),
    unitPrice: number(row.unitPrice),
    amount: number(row.amount),
    liters: number(row.liters),
    odometer: number(row.odometer),
    vendor: cleanText(row.vendor),
    note: cleanText(row.note),
  };
}

function comparablePayment(row = {}) {
  row = row || {};
  return {
    date: cleanText(row.date),
    customerId: cleanText(row.customerId),
    amount: number(row.amount),
    method: cleanText(row.method || "银行转账"),
    invoiceNo: cleanText(row.invoiceNo || row.invoice_no),
    invoicePdfFile: cleanText(row.invoicePdfFile || row.invoice_pdf),
    note: cleanText(row.note),
  };
}

function comparableSalary(row = {}) {
  row = row || {};
  return {
    month: cleanText(row.month),
    personnelId: cleanText(row.personnelId || row.personnel_id),
    name: cleanText(row.name),
    role: cleanText(row.role || "罐车司机"),
    base: number(row.base),
    bonus: number(row.bonus),
    deduction: number(row.deduction),
    paid: number(row.paid),
    note: cleanText(row.note),
  };
}

function hasValue(value) {
  return value !== undefined && value !== null && value !== "";
}

function normalizePriceConfig(input = {}) {
  return {
    distanceNode1: number(input.distanceNode1 ?? input.distance_node_1),
    distanceNode2: number(input.distanceNode2 ?? input.distance_node_2),
    distancePrice1: number(input.distancePrice1 ?? input.distance_price_1),
    distancePrice2: number(input.distancePrice2 ?? input.distance_price_2),
    distanceExtraPrice: number(input.distanceExtraPrice ?? input.distance_extra_price),
    defaultMaterialUnitPrice: number(input.defaultMaterialUnitPrice ?? input.default_material_unit_price),
    defaultOvertimeUnitPrice: number(input.defaultOvertimeUnitPrice ?? input.default_overtime_unit_price),
    defaultPumpUnitPrice: number(input.defaultPumpUnitPrice ?? input.default_pump_unit_price),
    pumpOvertimeUnitPrice: number(input.pumpOvertimeUnitPrice ?? input.pump_overtime_unit_price),
    pumpStartVolume: number(input.pumpStartVolume ?? input.pump_start_volume),
    pumpStartFee: number(input.pumpStartFee ?? input.pump_start_fee),
  };
}

function calculateDistanceUnitPrice(config, distance) {
  const priceConfig = normalizePriceConfig(config);
  const km = number(distance);
  if (!km || !priceConfig.distanceNode1 || !priceConfig.distanceNode2) return 0;
  if (km <= priceConfig.distanceNode1) return priceConfig.distancePrice1;
  if (km <= priceConfig.distanceNode2) return priceConfig.distancePrice2;
  return priceConfig.distancePrice2 + (km - priceConfig.distanceNode2) * priceConfig.distanceExtraPrice;
}

function transportAmount(workType, volume, settlementVolume, unitPrice, materialVolume, materialUnitPrice, overtimeHours, overtimeUnitPrice, priceConfig) {
  const normalizedConfig = normalizePriceConfig(priceConfig);
  const overtimeAmount = overtimeHours * overtimeUnitPrice;
  const materialAmount = materialVolume * materialUnitPrice;
  const usesStartFee = workType === "泵送服务" && normalizedConfig.pumpStartVolume > 0 && normalizedConfig.pumpStartFee > 0;
  const belowStartVolume =
    usesStartFee &&
    ((settlementVolume > 0 && settlementVolume < normalizedConfig.pumpStartVolume) ||
      (volume > 0 && volume < normalizedConfig.pumpStartVolume));
  const baseAmount = belowStartVolume ? normalizedConfig.pumpStartFee : settlementVolume * unitPrice;
  if (workType === "泵送服务") return baseAmount + overtimeAmount;
  return baseAmount + materialAmount + overtimeAmount;
}

export function normalizeData(input) {
  const source = input?.data || input || {};
  return Object.fromEntries(COLLECTIONS.map((key) => [key, Array.isArray(source[key]) ? source[key] : []]));
}

export function loadData() {
  if (!fs.existsSync(DATA_PATH)) {
    const empty = normalizeData({});
    saveData(empty);
    return empty;
  }
  return normalizeData(JSON.parse(fs.readFileSync(DATA_PATH, "utf8")));
}

export function saveData(data) {
  const normalized = normalizeData(data);
  fs.mkdirSync(path.dirname(DATA_PATH), { recursive: true });
  const tempPath = `${DATA_PATH}.tmp`;
  fs.writeFileSync(tempPath, `${JSON.stringify(normalized, null, 2)}\n`, "utf8");
  fs.renameSync(tempPath, DATA_PATH);
}

function findById(items, id) {
  return id ? items.find((item) => item.id === id) : undefined;
}

function resolveVehicle(data, args) {
  const byId = findById(data.vehicles, args.vehicle_id || args.vehicleId);
  if (byId) return byId;
  const plate = String(args.vehicle_plate || args.plate || "").trim();
  const byPlate = plate ? data.vehicles.find((item) => item.plate === plate) : undefined;
  if (byPlate) return byPlate;
  throw new Error("未找到车辆，请提供 vehicle_id 或准确车牌号");
}

function resolveCustomer(data, args) {
  const byId = findById(data.customers, args.customer_id || args.customerId);
  if (byId) return byId;
  const name = String(args.customer_name || args.name || "").trim();
  const byName = name ? data.customers.find((item) => item.name === name) : undefined;
  if (byName) return byName;
  if (name && args.create_customer_if_missing) {
    const customer = {
      id: newId("c"),
      name,
      contact: args.customer_contact || "",
      phone: args.customer_phone || "",
      creditLimit: number(args.credit_limit),
      note: args.customer_note || "",
    };
    data.customers.push(customer);
    return customer;
  }
  throw new Error("未找到客户，请提供 customer_id 或准确客户名称");
}

function resolvePersonnel(data, args) {
  const byId = findById(data.personnel, args.driver_id || args.driverId || args.personnel_id || args.personnelId);
  if (byId) return byId;
  const name = String(args.driver || args.name || "").trim();
  return name ? data.personnel.find((item) => item.name === name) : undefined;
}

function upsert(collection, item, prefix) {
  const data = loadData();
  if (!item.id) item.id = newId(prefix);
  const index = data[collection].findIndex((row) => row.id === item.id);
  if (index >= 0) data[collection][index] = item;
  else data[collection].push(item);
  saveData(data);
  return item;
}

export function upsertVehicle(args) {
  const photos = Array.isArray(args.inspection_photos)
    ? args.inspection_photos.filter(Boolean).slice(0, 4)
    : Array.isArray(args.inspectionPhotos)
      ? args.inspectionPhotos.filter(Boolean).slice(0, 4)
      : [];
  const insurancePair = (company, policyNo, pdfFile, expiry) => ({
    company: company || "",
    policyNo: policyNo || "",
    pdfFile: pdfFile || "",
    expiry: expiry || "",
  });
  const item = {
    id: args.id || args.vehicle_id || newId("v"),
    plate: args.plate || args.vehicle_plate || "",
    type: args.type || "混凝土罐车",
    model: args.model || "",
    driver: args.driver || "",
    status: args.status || "正常",
    startDate: args.start_date || args.startDate || today(),
    note: args.note || "",
    // 新增：年审 + 三类保险（v4.1 增强）
    inspectionExpiry: args.inspection_expiry || args.inspectionExpiry || "",
    inspectionPhotos: photos,
    compulsoryInsurance: insurancePair(
      args.compulsory_company || args.compulsoryInsurance?.company,
      args.compulsory_policy_no || args.compulsoryInsurance?.policyNo,
      args.compulsory_pdf || args.compulsoryInsurance?.pdfFile,
      args.compulsory_expiry || args.compulsoryInsurance?.expiry,
    ),
    commercialInsurance: insurancePair(
      args.commercial_company || args.commercialInsurance?.company,
      args.commercial_policy_no || args.commercialInsurance?.policyNo,
      args.commercial_pdf || args.commercialInsurance?.pdfFile,
      args.commercial_expiry || args.commercialInsurance?.expiry,
    ),
    excessInsurance: insurancePair(
      args.excess_company || args.excessInsurance?.company,
      args.excess_policy_no || args.excessInsurance?.policyNo,
      args.excess_pdf || args.excessInsurance?.pdfFile,
      args.excess_expiry || args.excessInsurance?.expiry,
    ),
  };
  if (!item.plate) throw new Error("车辆需要 plate");
  return upsert("vehicles", item, "v");
}

export function upsertCustomer(args) {
  const priceConfig = normalizePriceConfig(args.price_config || args.priceConfig || {});
  const item = {
    id: args.id || args.customer_id || newId("c"),
    name: args.name || args.customer_name || "",
    contact: args.contact || "",
    phone: args.phone || "",
    creditLimit: number(args.credit_limit || args.creditLimit),
    contractPdfFile: args.contract_pdf || args.contractPdfFile || "",
    priceConfig,
    note: args.note || "",
  };
  if (!item.name) throw new Error("客户需要 name");
  return upsert("customers", item, "c");
}

export function upsertPersonnel(args) {
  const item = {
    id: args.id || args.personnel_id || args.personnelId || newId("p"),
    name: args.name || "",
    role: args.role || "罐车司机",
    base: number(args.base),
    note: args.note || "",
  };
  if (!item.name) throw new Error("人员需要 name");
  return upsert("personnel", item, "p");
}

export function recordTransportJob(args) {
  const data = loadData();
  const vehicle = resolveVehicle(data, args);
  const customer = resolveCustomer(data, args);
  const trips = number(args.trips);
  const volume = number(args.volume);
  const settlementVolume = number(args.settlement_volume ?? args.settlementVolume, volume);
  const materialVolume = number(args.material_volume || args.materialVolume);
  const pumpHours = number(args.pump_hours || args.pumpHours);
  const priceConfig = normalizePriceConfig(customer.priceConfig);
  const workType = args.work_type || args.workType || "混凝土运输";
  const unitPrice = hasValue(args.unit_price ?? args.unitPrice)
    ? number(args.unit_price ?? args.unitPrice)
    : workType === "泵送服务"
      ? priceConfig.defaultPumpUnitPrice
      : calculateDistanceUnitPrice(priceConfig, args.odometer);
  const materialUnitPrice = hasValue(args.material_unit_price ?? args.materialUnitPrice)
    ? number(args.material_unit_price ?? args.materialUnitPrice)
    : workType === "泵送服务"
      ? 0
      : priceConfig.defaultMaterialUnitPrice;
  const overtimeUnitPrice = hasValue(args.overtime_unit_price ?? args.overtimeUnitPrice)
    ? number(args.overtime_unit_price ?? args.overtimeUnitPrice)
    : workType === "泵送服务"
      ? priceConfig.pumpOvertimeUnitPrice
      : priceConfig.defaultOvertimeUnitPrice;
  const odometer = number(args.odometer);
  const amount = args.amount === undefined || args.amount === "" ? transportAmount(workType, volume, settlementVolume, unitPrice, materialVolume, materialUnitPrice, pumpHours, overtimeUnitPrice, priceConfig) : number(args.amount);
  const rawPayment = (args.payment_method || args.paymentMethod || "").trim();
  const paymentMethod = ["合同", "现金"].includes(rawPayment) ? rawPayment : "";
  const personnel = resolvePersonnel(data, args);
  const item = {
    id: args.id || newId("j"),
    date: args.date || today(),
    documentNo: String(args.documentNo || args.document_no || "").trim(),
    vehicleId: vehicle.id,
    customerId: customer.id,
    driverId: personnel?.id || args.driverId || args.driver_id || "",
    driver: personnel?.name || args.driver || vehicle.driver || "",
    workType,
    site: args.site || "",
    project: args.project || "",
    trips,
    volume,
    settlementVolume,
    materialVolume,
    pumpHours,
    odometer,
    unitPrice,
    materialUnitPrice,
    overtimeUnitPrice,
    amount,
    paid: number(args.paid),
    paymentMethod,
    note: args.note || "",
  };
  const index = data.jobs.findIndex((row) => row.id === item.id);
  if (index >= 0) data.jobs[index] = item;
  else data.jobs.push(item);
  saveData(data);
  return enrichJob(item, data);
}

export function createTransportJobDraft(args, user = {}) {
  const data = loadData();
  const vehicle = resolveVehicle(data, args);
  const customer = resolveCustomer(data, args);
  const originalJobId = args.originalJobId || args.original_job_id || (data.jobs.some((row) => row.id === args.id) ? args.id : "");
  const trips = number(args.trips);
  const volume = number(args.volume);
  const settlementVolume = number(args.settlement_volume ?? args.settlementVolume, volume);
  const materialVolume = number(args.material_volume || args.materialVolume);
  const pumpHours = number(args.pump_hours || args.pumpHours);
  const priceConfig = normalizePriceConfig(customer.priceConfig);
  const workType = args.work_type || args.workType || "混凝土运输";
  const unitPrice = hasValue(args.unit_price ?? args.unitPrice)
    ? number(args.unit_price ?? args.unitPrice)
    : workType === "泵送服务"
      ? priceConfig.defaultPumpUnitPrice
      : calculateDistanceUnitPrice(priceConfig, args.odometer);
  const materialUnitPrice = hasValue(args.material_unit_price ?? args.materialUnitPrice)
    ? number(args.material_unit_price ?? args.materialUnitPrice)
    : workType === "泵送服务"
      ? 0
      : priceConfig.defaultMaterialUnitPrice;
  const overtimeUnitPrice = hasValue(args.overtime_unit_price ?? args.overtimeUnitPrice)
    ? number(args.overtime_unit_price ?? args.overtimeUnitPrice)
    : workType === "泵送服务"
      ? priceConfig.pumpOvertimeUnitPrice
      : priceConfig.defaultOvertimeUnitPrice;
  const odometer = number(args.odometer);
  const amount = args.amount === undefined || args.amount === "" ? transportAmount(workType, volume, settlementVolume, unitPrice, materialVolume, materialUnitPrice, pumpHours, overtimeUnitPrice, priceConfig) : number(args.amount);
  const rawPayment = (args.payment_method || args.paymentMethod || "").trim();
  const paymentMethod = ["合同", "现金"].includes(rawPayment) ? rawPayment : "";
  const personnel = resolvePersonnel(data, args);
  const item = {
    id: args.id || newId("jd"),
    date: args.date || today(),
    documentNo: documentNumber(args),
    vehicleId: vehicle.id,
    customerId: customer.id,
    driverId: personnel?.id || args.driverId || args.driver_id || "",
    driver: personnel?.name || args.driver || vehicle.driver || user.name || user.phone || "",
    workType,
    site: args.site || "",
    project: args.project || "",
    trips,
    volume,
    settlementVolume,
    materialVolume,
    pumpHours,
    odometer,
    unitPrice,
    materialUnitPrice,
    overtimeUnitPrice,
    amount,
    paid: number(args.paid),
    paymentMethod,
    note: args.note || "",
    originalJobId,
    status: "draft",
    createdBy: user.id || "",
    createdByName: user.name || user.phone || "",
    createdAt: new Date().toISOString(),
  };
  if (!item.date) throw new Error("运输日期不能为空");
  if (item.amount <= 0) throw new Error("应收金额必须大于 0");
  const original = originalJobId ? data.jobs.find((row) => row.id === originalJobId) : null;
  assertChanged(original, comparableTransportJob(original), comparableTransportJob(item));
  const index = data.jobDrafts.findIndex((row) => row.id === item.id && row.status !== "approved");
  if (index >= 0) {
    data.jobDrafts[index] = {
      ...data.jobDrafts[index],
      ...item,
      status: "draft",
      rejectedBy: "",
      rejectedByName: "",
      rejectedAt: "",
      rejectReason: "",
    };
  }
  else data.jobDrafts.push(item);
  saveData(data);
  return { ...item, vehicle, customer };
}

export function approveTransportJobDraft(draftId, user = {}) {
  const data = loadData();
  const draft = data.jobDrafts.find((row) => row.id === draftId);
  if (!draft) throw new Error("运输草稿不存在");
  if (draft.status !== "draft") throw new Error("该运输记录已处理");
  const now = new Date().toISOString();
  draft.status = "approved";
  draft.approvedBy = user.id || "";
  draft.approvedByName = user.name || user.phone || "";
  draft.approvedAt = now;
  const originalJobId = draft.originalJobId || "";
  const job = {
    id: originalJobId || newId("j"),
    draftId: draft.id,
    date: draft.date,
    documentNo: documentNumber(draft),
    vehicleId: draft.vehicleId,
    customerId: draft.customerId,
    driverId: draft.driverId || "",
    driver: draft.driver || "",
    workType: draft.workType || "混凝土运输",
    site: draft.site || "",
    project: draft.project || "",
    trips: number(draft.trips),
    volume: number(draft.volume),
    settlementVolume: number(draft.settlementVolume, number(draft.volume)),
    materialVolume: number(draft.materialVolume),
    pumpHours: number(draft.pumpHours),
    odometer: number(draft.odometer),
    unitPrice: number(draft.unitPrice),
    materialUnitPrice: number(draft.materialUnitPrice),
    overtimeUnitPrice: number(draft.overtimeUnitPrice),
    amount: number(draft.amount),
    paid: number(draft.paid),
    paymentMethod: draft.paymentMethod || "",
    note: draft.note || "",
    approvedBy: draft.approvedBy,
    approvedByName: draft.approvedByName,
    approvedAt: now,
  };
  const jobIndex = originalJobId ? data.jobs.findIndex((row) => row.id === originalJobId) : -1;
  if (jobIndex >= 0) data.jobs[jobIndex] = job;
  else data.jobs.push(job);
  saveData(data);
  return { draft, job: enrichJob(job, data) };
}

export function rejectTransportJobDraft(draftId, user = {}, reason = "") {
  const data = loadData();
  const draft = data.jobDrafts.find((row) => row.id === draftId);
  if (!draft) throw new Error("运输草稿不存在");
  if (draft.status !== "draft") throw new Error("该运输记录已处理");
  draft.status = "rejected";
  draft.rejectedBy = user.id || "";
  draft.rejectedByName = user.name || user.phone || "";
  draft.rejectedAt = new Date().toISOString();
  draft.rejectReason = String(reason || "").trim();
  saveData(data);
  return draft;
}

export function recordVehicleExpense(args) {
  const data = loadData();
  const vehicle = resolveVehicle(data, args);
  const item = {
    id: args.id || newId("e"),
    date: args.date || today(),
    vehicleId: vehicle.id,
    type: args.expense_type || args.type || "其他",
    amount: number(args.amount),
    liters: number(args.liters),
    odometer: number(args.odometer),
    vendor: args.vendor || "",
    note: args.note || "",
  };
  const index = data.expenses.findIndex((row) => row.id === item.id);
  if (index >= 0) data.expenses[index] = item;
  else data.expenses.push(item);
  saveData(data);
  return enrichExpense(item, data);
}

export function createExpenseDraft(args, user = {}) {
  const data = loadData();
  const vehicle = resolveVehicle(data, args);
  const originalExpenseId = args.originalExpenseId || args.original_expense_id || (data.expenses.some((row) => row.id === args.id) ? args.id : "");
  const quantity = number(args.quantity);
  const unitPrice = number(args.unitPrice || args.unit_price);
  const amount = args.amount === undefined || args.amount === "" ? quantity * unitPrice : number(args.amount);
  const item = {
    id: args.id || newId("ed"),
    date: args.date || today(),
    vehicleId: vehicle.id,
    type: args.expense_type || args.type || "其他",
    itemName: String(args.itemName || args.item_name || args.type || "").trim(),
    quantity,
    unit: String(args.unit || "件").trim(),
    unitPrice,
    amount,
    liters: number(args.liters),
    odometer: number(args.odometer),
    vendor: args.vendor || args.supplier || "",
    note: args.note || "",
    originalExpenseId,
    status: "draft",
    createdBy: user.id || "",
    createdByName: user.name || user.phone || "",
    createdAt: new Date().toISOString(),
  };
  if (!item.itemName && !item.type) throw new Error("费用事项不能为空");
  if (item.amount <= 0) throw new Error("费用金额必须大于 0");
  const original = originalExpenseId ? data.expenses.find((row) => row.id === originalExpenseId) : null;
  assertChanged(original, comparableExpense(original), comparableExpense(item));
  const index = data.expenseDrafts.findIndex((row) => row.id === item.id && row.status !== "approved");
  if (index >= 0) {
    data.expenseDrafts[index] = {
      ...data.expenseDrafts[index],
      ...item,
      status: "draft",
      rejectedBy: "",
      rejectedByName: "",
      rejectedAt: "",
      rejectReason: "",
    };
  }
  else data.expenseDrafts.push(item);
  saveData(data);
  return item;
}

export function approveExpenseDraft(draftId, user = {}) {
  const data = loadData();
  const draft = data.expenseDrafts.find((row) => row.id === draftId);
  if (!draft) throw new Error("费用草稿不存在");
  if (draft.status !== "draft") throw new Error("该费用单已处理");
  const now = new Date().toISOString();
  draft.status = "approved";
  draft.approvedBy = user.id || "";
  draft.approvedByName = user.name || user.phone || "";
  draft.approvedAt = now;
  const originalExpenseId = draft.originalExpenseId || "";
  const expense = {
    id: originalExpenseId || newId("e"),
    draftId: draft.id,
    date: draft.date,
    vehicleId: draft.vehicleId,
    type: draft.type || draft.itemName || "其他",
    itemName: draft.itemName || draft.type || "",
    quantity: number(draft.quantity),
    unit: draft.unit || "",
    unitPrice: number(draft.unitPrice),
    amount: number(draft.amount),
    liters: number(draft.liters),
    odometer: number(draft.odometer),
    vendor: draft.vendor || "",
    note: draft.note || "",
    approvedBy: draft.approvedBy,
    approvedByName: draft.approvedByName,
    approvedAt: now,
  };
  const expenseIndex = originalExpenseId ? data.expenses.findIndex((row) => row.id === originalExpenseId) : -1;
  if (expenseIndex >= 0) data.expenses[expenseIndex] = expense;
  else data.expenses.push(expense);
  saveData(data);
  return { draft, expense: enrichExpense(expense, data) };
}

export function rejectExpenseDraft(draftId, user = {}, reason = "") {
  const data = loadData();
  const draft = data.expenseDrafts.find((row) => row.id === draftId);
  if (!draft) throw new Error("费用草稿不存在");
  if (draft.status !== "draft") throw new Error("该费用单已处理");
  draft.status = "rejected";
  draft.rejectedBy = user.id || "";
  draft.rejectedByName = user.name || user.phone || "";
  draft.rejectedAt = new Date().toISOString();
  draft.rejectReason = String(reason || "").trim();
  saveData(data);
  return draft;
}

export function recordCustomerPayment(args) {
  const data = loadData();
  const customer = resolveCustomer(data, args);
  const item = {
    id: args.id || newId("p"),
    date: args.date || today(),
    customerId: customer.id,
    amount: number(args.amount),
    method: args.method || "银行转账",
    invoiceNo: args.invoice_no || args.invoiceNo || "",
    invoicePdfFile: args.invoice_pdf || args.invoicePdfFile || "",
    note: args.note || "",
  };
  const index = data.payments.findIndex((row) => row.id === item.id);
  if (index >= 0) data.payments[index] = item;
  else data.payments.push(item);
  saveData(data);
  return enrichPayment(item, data);
}

export function createPaymentDraft(args, user = {}) {
  const data = loadData();
  const customer = resolveCustomer(data, args);
  const originalPaymentId = args.originalPaymentId || args.original_payment_id || (data.payments.some((row) => row.id === args.id) ? args.id : "");
  const item = {
    id: args.id || newId("pd"),
    date: args.date || today(),
    customerId: customer.id,
    amount: number(args.amount),
    method: args.method || "银行转账",
    invoiceNo: args.invoice_no || args.invoiceNo || "",
    invoicePdfFile: args.invoice_pdf || args.invoicePdfFile || "",
    note: args.note || "",
    originalPaymentId,
    status: "draft",
    createdBy: user.id || "",
    createdByName: user.name || user.phone || "",
    createdAt: new Date().toISOString(),
  };
  if (item.amount <= 0) throw new Error("回款金额必须大于 0");
  const original = originalPaymentId ? data.payments.find((row) => row.id === originalPaymentId) : null;
  assertChanged(original, comparablePayment(original), comparablePayment(item));
  const index = data.paymentDrafts.findIndex((row) => row.id === item.id && row.status !== "approved");
  if (index >= 0) {
    data.paymentDrafts[index] = {
      ...data.paymentDrafts[index],
      ...item,
      status: "draft",
      rejectedBy: "",
      rejectedByName: "",
      rejectedAt: "",
      rejectReason: "",
    };
  }
  else data.paymentDrafts.push(item);
  saveData(data);
  return { ...item, customer };
}

export function approvePaymentDraft(draftId, user = {}) {
  const data = loadData();
  const draft = data.paymentDrafts.find((row) => row.id === draftId);
  if (!draft) throw new Error("收款草稿不存在");
  if (draft.status !== "draft") throw new Error("该收款登记已处理");
  const now = new Date().toISOString();
  draft.status = "approved";
  draft.approvedBy = user.id || "";
  draft.approvedByName = user.name || user.phone || "";
  draft.approvedAt = now;
  const originalPaymentId = draft.originalPaymentId || "";
  const payment = {
    id: originalPaymentId || newId("p"),
    draftId: draft.id,
    date: draft.date,
    customerId: draft.customerId,
    amount: number(draft.amount),
    method: draft.method || "银行转账",
    invoiceNo: draft.invoiceNo || "",
    invoicePdfFile: draft.invoicePdfFile || "",
    note: draft.note || "",
    approvedBy: draft.approvedBy,
    approvedByName: draft.approvedByName,
    approvedAt: now,
  };
  const paymentIndex = originalPaymentId ? data.payments.findIndex((row) => row.id === originalPaymentId) : -1;
  if (paymentIndex >= 0) data.payments[paymentIndex] = payment;
  else data.payments.push(payment);
  saveData(data);
  return { draft, payment: enrichPayment(payment, data) };
}

export function rejectPaymentDraft(draftId, user = {}, reason = "") {
  const data = loadData();
  const draft = data.paymentDrafts.find((row) => row.id === draftId);
  if (!draft) throw new Error("收款草稿不存在");
  if (draft.status !== "draft") throw new Error("该收款登记已处理");
  draft.status = "rejected";
  draft.rejectedBy = user.id || "";
  draft.rejectedByName = user.name || user.phone || "";
  draft.rejectedAt = new Date().toISOString();
  draft.rejectReason = String(reason || "").trim();
  saveData(data);
  return draft;
}

export function recordSalary(args) {
  const data = loadData();
  const personnel = resolvePersonnel(data, args);
  const item = {
    id: args.id || newId("s"),
    month: args.month || currentMonth(),
    personnelId: personnel?.id || args.personnelId || args.personnel_id || "",
    name: personnel?.name || args.name || "",
    role: personnel?.role || args.role || "罐车司机",
    base: args.base === undefined || args.base === "" ? number(personnel?.base) : number(args.base),
    bonus: number(args.bonus),
    deduction: number(args.deduction),
    paid: number(args.paid),
    note: args.note || "",
  };
  if (!item.name) throw new Error("工资记录需要 name");
  return upsert("salaries", item, "s");
}

export function createSalaryDraft(args, user = {}) {
  const data = loadData();
  const personnel = resolvePersonnel(data, args);
  const originalSalaryId = args.originalSalaryId || args.original_salary_id || (data.salaries.some((row) => row.id === args.id) ? args.id : "");
  const item = {
    id: args.id || newId("sd"),
    month: args.month || currentMonth(),
    personnelId: personnel?.id || args.personnelId || args.personnel_id || "",
    name: personnel?.name || args.name || "",
    role: personnel?.role || args.role || "罐车司机",
    base: args.base === undefined || args.base === "" ? number(personnel?.base) : number(args.base),
    bonus: number(args.bonus),
    deduction: number(args.deduction),
    paid: number(args.paid),
    note: args.note || "",
    originalSalaryId,
    status: "draft",
    createdBy: user.id || "",
    createdByName: user.name || user.phone || "",
    createdAt: new Date().toISOString(),
  };
  if (!item.name) throw new Error("工资记录需要 name");
  if (!item.month) throw new Error("工资月份不能为空");
  const original = originalSalaryId ? data.salaries.find((row) => row.id === originalSalaryId) : null;
  assertChanged(original, comparableSalary(original), comparableSalary(item));
  const index = data.salaryDrafts.findIndex((row) => row.id === item.id && row.status !== "approved");
  if (index >= 0) {
    data.salaryDrafts[index] = {
      ...data.salaryDrafts[index],
      ...item,
      status: "draft",
      rejectedBy: "",
      rejectedByName: "",
      rejectedAt: "",
      rejectReason: "",
    };
  }
  else data.salaryDrafts.push(item);
  saveData(data);
  return item;
}

export function approveSalaryDraft(draftId, user = {}) {
  const data = loadData();
  const draft = data.salaryDrafts.find((row) => row.id === draftId);
  if (!draft) throw new Error("工资草稿不存在");
  if (draft.status !== "draft") throw new Error("该工资单已处理");
  const now = new Date().toISOString();
  draft.status = "approved";
  draft.approvedBy = user.id || "";
  draft.approvedByName = user.name || user.phone || "";
  draft.approvedAt = now;
  const originalSalaryId = draft.originalSalaryId || "";
  const salary = {
    id: originalSalaryId || newId("s"),
    draftId: draft.id,
    month: draft.month,
    personnelId: draft.personnelId || "",
    name: draft.name || "",
    role: draft.role || "罐车司机",
    base: number(draft.base),
    bonus: number(draft.bonus),
    deduction: number(draft.deduction),
    paid: number(draft.paid),
    note: draft.note || "",
    approvedBy: draft.approvedBy,
    approvedByName: draft.approvedByName,
    approvedAt: now,
  };
  const salaryIndex = originalSalaryId ? data.salaries.findIndex((row) => row.id === originalSalaryId) : -1;
  if (salaryIndex >= 0) data.salaries[salaryIndex] = salary;
  else data.salaries.push(salary);
  saveData(data);
  return { draft, salary };
}

export function rejectSalaryDraft(draftId, user = {}, reason = "") {
  const data = loadData();
  const draft = data.salaryDrafts.find((row) => row.id === draftId);
  if (!draft) throw new Error("工资草稿不存在");
  if (draft.status !== "draft") throw new Error("该工资单已处理");
  draft.status = "rejected";
  draft.rejectedBy = user.id || "";
  draft.rejectedByName = user.name || user.phone || "";
  draft.rejectedAt = new Date().toISOString();
  draft.rejectReason = String(reason || "").trim();
  saveData(data);
  return draft;
}

export function listRecords(collection, args = {}) {
  const data = loadData();
  let rows = [...data[collection]];
  if (args.month) {
    const key = collection === "salaries" ? "month" : "date";
    rows = rows.filter((item) => String(item[key] || "").startsWith(args.month));
  }
  if (args.search) {
    const search = String(args.search).toLowerCase();
    rows = rows.filter((item) => JSON.stringify(item).toLowerCase().includes(search));
  }
  if (collection === "jobs") return rows.map((item) => enrichJob(item, data));
  if (collection === "expenses") return rows.map((item) => enrichExpense(item, data));
  if (collection === "payments") return rows.map((item) => enrichPayment(item, data));
  if (collection === "customers" && args.include_balances !== false) {
    const balances = Object.fromEntries(customerBalances(data).map((row) => [row.customer.id, row]));
    return rows.map((item) => ({ ...item, balanceInfo: balances[item.id] || {} }));
  }
  return rows;
}

export function listVehicles(args = {}) {
  let rows = listRecords("vehicles", args);
  if (args.status) rows = rows.filter((item) => item.status === args.status);
  if (args.type) rows = rows.filter((item) => item.type === args.type);
  return rows;
}

function enrichJob(item, data) {
  const vehicle = findById(data.vehicles, item.vehicleId);
  const customer = findById(data.customers, item.customerId);
  return {
    ...item,
    vehiclePlate: vehicle?.plate || null,
    vehicleType: vehicle?.type || null,
    customerName: customer?.name || null,
    debt: number(item.amount) - number(item.paid),
  };
}

function enrichExpense(item, data) {
  const vehicle = findById(data.vehicles, item.vehicleId);
  return { ...item, vehiclePlate: vehicle?.plate || null, vehicleType: vehicle?.type || null };
}

function enrichPayment(item, data) {
  const customer = findById(data.customers, item.customerId);
  return { ...item, customerName: customer?.name || null };
}

export function salaryDue(item) {
  return number(item.base) + number(item.bonus) - number(item.deduction);
}

export function customerBalances(data = loadData()) {
  return data.customers
    .map((customer) => {
      const jobs = data.jobs.filter((item) => item.customerId === customer.id);
      const payments = data.payments.filter((item) => item.customerId === customer.id);
      const revenue = jobs.reduce((total, item) => total + number(item.amount), 0);
      const paid = jobs.reduce((total, item) => total + number(item.paid), 0) + payments.reduce((total, item) => total + number(item.amount), 0);
      const lastDate = jobs.map((item) => item.date || "").sort().at(-1) || "";
      return { customer, revenue, paid, balance: revenue - paid, lastDate };
    })
    .sort((a, b) => b.balance - a.balance);
}

export function monthlySummary(month = currentMonth()) {
  const data = loadData();
  const jobs = data.jobs.filter((item) => String(item.date || "").startsWith(month));
  const expenses = data.expenses.filter((item) => String(item.date || "").startsWith(month));
  const payments = data.payments.filter((item) => String(item.date || "").startsWith(month));
  const salaries = data.salaries.filter((item) => item.month === month);
  const revenue = jobs.reduce((total, item) => total + number(item.amount), 0);
  const jobPaid = jobs.reduce((total, item) => total + number(item.paid), 0);
  const paymentPaid = payments.reduce((total, item) => total + number(item.amount), 0);
  const vehicleExpenses = expenses.reduce((total, item) => total + number(item.amount), 0);
  const salaryTotal = salaries.reduce((total, item) => total + salaryDue(item), 0);
  const debts = customerBalances(data);
  return {
    month,
    transportJobs: jobs.length,
    revenue,
    received: jobPaid + paymentPaid,
    vehicleExpenses,
    salaryDue: salaryTotal,
    grossProfit: revenue - vehicleExpenses - salaryTotal,
    monthUnreceived: revenue - jobPaid - paymentPaid,
    totalCustomerDebt: debts.reduce((total, item) => total + Math.max(0, item.balance), 0),
    topDebts: debts.slice(0, 5),
    vehicleCount: data.vehicles.length,
    customerCount: data.customers.length,
  };
}

export function deleteRecord(args) {
  const mapping = {
    vehicle: "vehicles",
    customer: "customers",
    job: "jobs",
    expense: "expenses",
    salary: "salaries",
    payment: "payments",
  };
  const collection = mapping[args.record_type];
  if (!collection || !args.id) throw new Error("需要 record_type 和 id");
  const data = loadData();
  if (
    args.record_type === "vehicle" &&
    (data.jobs.some((row) => row.vehicleId === args.id) || data.expenses.some((row) => row.vehicleId === args.id))
  ) {
    throw new Error("该车辆已有台账或费用记录，请改为停用");
  }
  if (
    args.record_type === "customer" &&
    (data.jobs.some((row) => row.customerId === args.id) || data.payments.some((row) => row.customerId === args.id))
  ) {
    throw new Error("该客户已有运输或回款记录，请保留客户档案");
  }
  const before = data[collection].length;
  data[collection] = data[collection].filter((row) => row.id !== args.id);
  saveData(data);
  return { deleted: before - data[collection].length, record_type: args.record_type, id: args.id };
}

export function money(value) {
  return `¥${number(value).toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function textSummary(summary) {
  const debts = summary.topDebts
    .filter((row) => row.balance > 0)
    .map((row) => `- ${row.customer.name}: ${money(row.balance)}`)
    .join("\n");
  return [
    `${summary.month} 车辆运输月报`,
    `运输记录: ${summary.transportJobs} 条`,
    `本月应收: ${money(summary.revenue)}`,
    `本月已收: ${money(summary.received)}`,
    `车辆费用: ${money(summary.vehicleExpenses)}`,
    `人员工资: ${money(summary.salaryDue)}`,
    `估算毛利润: ${money(summary.grossProfit)}`,
    `客户总欠账: ${money(summary.totalCustomerDebt)}`,
    "欠账排行:",
    debts || "- 暂无欠账",
  ].join("\n");
}
