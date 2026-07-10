const STORAGE_KEY = "concreteFleetManager.v1";
const THEME_KEY = "concreteFleetManager.theme";
const API_DATA_ENDPOINT = "/api/data";
const JOB_HISTORY_DATALIST_LIMIT = 6;

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

const state = emptyState();
let apiAvailable = false;
let activeTab = "dashboard";
let currentMonth = toMonth(new Date());
let currentUser = null;
let customerSortMode = "default";
const moduleModes = {
  jobs: "entry",
  vehicles: "list",
  customers: "list",
  expenses: "list",
  salaries: "list",
};
let activeReviewMode = "jobs";
let selectedCustomerLedgerId = "";
const tablePages = {
  jobs: 1,
  vehicles: 1,
  customers: 1,
  customerLedger: 1,
  notifications: 1,
  submittedDrafts: 1,
  expenses: 1,
  jobDrafts: 1,
  expenseDrafts: 1,
  salaryDrafts: 1,
  paymentDrafts: 1,
  personnel: 1,
  salaries: 1,
};

applySavedTheme();

document.addEventListener("DOMContentLoaded", async () => {
  if (!(await loadCurrentUser())) return;
  Object.assign(state, await loadState());
  setDefaultDates();
  bindEvents();
  renderAll();
});

function uid(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function toDateInput(date) {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toMonth(date) {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function offsetDate(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return toDateInput(d);
}

function previousDateInput(date = new Date()) {
  const d = new Date(date);
  d.setDate(d.getDate() - 1);
  return toDateInput(d);
}

function n(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizePriceConfig(input = {}) {
  return {
    distanceNode1: n(input.distanceNode1 ?? input.distance_node_1),
    distanceNode2: n(input.distanceNode2 ?? input.distance_node_2),
    distancePrice1: n(input.distancePrice1 ?? input.distance_price_1),
    distancePrice2: n(input.distancePrice2 ?? input.distance_price_2),
    distanceExtraPrice: n(input.distanceExtraPrice ?? input.distance_extra_price),
    defaultMaterialUnitPrice: n(input.defaultMaterialUnitPrice ?? input.default_material_unit_price),
    defaultOvertimeUnitPrice: n(input.defaultOvertimeUnitPrice ?? input.default_overtime_unit_price),
    defaultPumpUnitPrice: n(input.defaultPumpUnitPrice ?? input.default_pump_unit_price),
    pumpOvertimeUnitPrice: n(input.pumpOvertimeUnitPrice ?? input.pump_overtime_unit_price),
    pumpStartVolume: n(input.pumpStartVolume ?? input.pump_start_volume),
    pumpStartFee: n(input.pumpStartFee ?? input.pump_start_fee),
  };
}

function calculateDistanceUnitPrice(config, distance) {
  const priceConfig = normalizePriceConfig(config);
  const km = n(distance);
  if (!km || !priceConfig.distanceNode1 || !priceConfig.distanceNode2) return 0;
  if (km <= priceConfig.distanceNode1) return priceConfig.distancePrice1;
  if (km <= priceConfig.distanceNode2) return priceConfig.distancePrice2;
  return priceConfig.distancePrice2 + (km - priceConfig.distanceNode2) * priceConfig.distanceExtraPrice;
}

function money(value) {
  return new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: "CNY",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n(value));
}

function formatDateTime(value) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString("zh-CN", { hour12: false });
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function roleLabel(role) {
  return {
    admin: "管理员",
    dispatcher: "调度员",
    driver: "司机",
    accountant: "会计",
    viewer: "只读用户",
  }[role] || role || "未知角色";
}

function userInitial(user) {
  const name = String(user?.name || user?.phone || "?").trim();
  return name.slice(0, 1).toUpperCase() || "?";
}

function canSubmitExpenseDraft() {
  return ["admin", "accountant"].includes(currentUser?.role);
}

function canReviewExpenseDraft() {
  return currentUser?.role === "admin";
}

function canSubmitSalaryDraft() {
  return ["admin", "accountant"].includes(currentUser?.role);
}

function canReviewSalaryDraft() {
  return currentUser?.role === "admin";
}

function canSubmitPaymentDraft() {
  return ["admin", "accountant"].includes(currentUser?.role);
}

function canReviewPaymentDraft() {
  return currentUser?.role === "admin";
}

function canSubmitTransportDraft() {
  return ["admin", "dispatcher", "driver", "accountant"].includes(currentUser?.role);
}

function canManageMasterData() {
  return ["admin", "dispatcher"].includes(currentUser?.role);
}

function canReplaceSystemData() {
  return ["admin", "dispatcher"].includes(currentUser?.role);
}

function roleRequirementAllowed(requirement) {
  if (requirement === "master-data") return canManageMasterData();
  if (requirement === "data-admin") return canReplaceSystemData();
  return true;
}

function assertPermission(allowed, message) {
  if (allowed) return true;
  toast(message);
  return false;
}

function canAccessModuleMode(module, mode) {
  if (module === "vehicles" && mode === "entry") return canManageMasterData();
  if (module === "customers" && mode === "customer-entry") return canManageMasterData();
  if (module === "salaries" && mode === "personnel-entry") return canManageMasterData();
  return true;
}

function restrictedModuleMessage(module, mode) {
  if (module === "vehicles" && mode === "entry") return "当前无权限修改车辆资料";
  if (module === "customers" && mode === "customer-entry") return "当前无权限修改客户资料";
  if (module === "salaries" && mode === "personnel-entry") return "当前无权限修改人员档案";
  return "当前无权限操作";
}

async function loadCurrentUser() {
  try {
    const response = await fetch("/api/auth/me", { headers: { accept: "application/json" } });
    if (response.status === 401) {
      location.href = "/login.html";
      return false;
    }
    if (!response.ok) throw new Error("用户信息读取失败");
    const data = await response.json();
    currentUser = data.user || null;
    renderCurrentUser();
    return true;
  } catch (error) {
    console.warn(error);
    $("#settingsUserName").textContent = "用户信息异常";
    $("#settingsUserDetail").textContent = "请重新登录";
    return false;
  }
}

function renderCurrentUser() {
  if (!currentUser) return;
  $("#settingsUserAvatar").textContent = userInitial(currentUser);
  $("#settingsUserName").textContent = currentUser.name || currentUser.phone || "未命名用户";
  $("#settingsUserDetail").textContent = `${roleLabel(currentUser.role)} · ${currentUser.phone || "无账号"}`;
  $("#settingsUserManageLink").hidden = currentUser.role !== "admin";
  renderAdminVisibility();
  renderExpenseRoleState();
  renderSalaryRoleState();
}

async function endSession() {
  try {
    await fetch("/api/auth/logout", { method: "POST" });
  } finally {
    location.href = "/login.html";
  }
}

function emptyState() {
  return {
    vehicles: [],
    customers: [],
    personnel: [],
    jobs: [],
    jobDrafts: [],
    expenseDrafts: [],
    expenses: [],
    salaryDrafts: [],
    salaries: [],
    paymentDrafts: [],
    payments: [],
    stockInDrafts: [],
    stockIns: [],
  };
}

async function loadState() {
  if (location.protocol.startsWith("http")) {
    try {
      const response = await fetch(API_DATA_ENDPOINT, { headers: { accept: "application/json" } });
      if (response.ok) {
        apiAvailable = true;
        const data = normalizeData(await response.json());
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
        return data;
      }
    } catch {
      apiAvailable = false;
    }
  }
  return loadBrowserState();
}

function loadBrowserState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return seedState();
  try {
    return normalizeData(JSON.parse(raw));
  } catch {
    return seedState();
  }
}

function normalizeData(data) {
  const source = data?.data || data || {};
  return {
    vehicles: Array.isArray(source.vehicles) ? source.vehicles : [],
    customers: Array.isArray(source.customers) ? source.customers : [],
    personnel: Array.isArray(source.personnel) && source.personnel.length ? source.personnel : derivePersonnel(source),
    jobs: Array.isArray(source.jobs) ? source.jobs : [],
    jobDrafts: Array.isArray(source.jobDrafts) ? source.jobDrafts : [],
    expenseDrafts: Array.isArray(source.expenseDrafts) ? source.expenseDrafts : deriveExpenseDrafts(source),
    expenses: mergeExpenses(source),
    salaryDrafts: Array.isArray(source.salaryDrafts) ? source.salaryDrafts : [],
    salaries: Array.isArray(source.salaries) ? source.salaries : [],
    paymentDrafts: Array.isArray(source.paymentDrafts) ? source.paymentDrafts : [],
    payments: Array.isArray(source.payments) ? source.payments : [],
    stockInDrafts: Array.isArray(source.stockInDrafts) ? source.stockInDrafts : [],
    stockIns: Array.isArray(source.stockIns) ? source.stockIns : [],
  };
}

function derivePersonnel(source) {
  const rows = [];
  const byName = new Map();
  const add = (name, role = "罐车司机", base = 0, note = "") => {
    const cleanName = String(name || "").trim();
    if (!cleanName || byName.has(cleanName)) return;
    const item = { id: uid("p"), name: cleanName, role: role || "罐车司机", base: n(base), note: note || "" };
    byName.set(cleanName, item);
    rows.push(item);
  };
  (Array.isArray(source.salaries) ? source.salaries : []).forEach((item) => add(item.name, item.role, item.base, item.note));
  (Array.isArray(source.vehicles) ? source.vehicles : []).forEach((item) => add(item.driver, "罐车司机", 0, "从车辆默认司机导入"));
  (Array.isArray(source.jobs) ? source.jobs : []).forEach((item) => add(item.driver, "罐车司机", 0, "从运输记录导入"));
  return rows;
}

function deriveExpenseDrafts(source) {
  return (Array.isArray(source.stockInDrafts) ? source.stockInDrafts : [])
    .filter((item) => item.status === "draft")
    .map((item) => ({
      id: item.id,
      date: item.date,
      vehicleId: item.vehicleId || "",
      type: item.category || item.itemName || "其他",
      itemName: item.itemName || item.category || "其他",
      quantity: n(item.quantity),
      unit: item.unit || "件",
      unitPrice: n(item.unitPrice),
      amount: n(item.amount),
      liters: 0,
      odometer: 0,
      vendor: item.supplier || "",
      note: item.note || "",
      status: "draft",
      createdBy: item.createdBy || "",
      createdByName: item.createdByName || "",
      createdAt: item.createdAt || "",
    }));
}

function mergeExpenses(source) {
  const expenses = Array.isArray(source.expenses) ? source.expenses : [];
  const converted = (Array.isArray(source.stockIns) ? source.stockIns : []).map((item) => ({
    id: item.id || uid("e"),
    draftId: item.draftId || "",
    date: item.date,
    vehicleId: item.vehicleId || "",
    type: item.category || item.itemName || "其他",
    itemName: item.itemName || "",
    quantity: n(item.quantity),
    unit: item.unit || "",
    unitPrice: n(item.unitPrice),
    amount: n(item.amount),
    liters: 0,
    odometer: 0,
    vendor: item.supplier || "",
    note: item.note || "",
    approvedBy: item.approvedBy || "",
    approvedByName: item.approvedByName || "",
    approvedAt: item.approvedAt || "",
  }));
  const knownIds = new Set(expenses.map((item) => item.id));
  return [...expenses, ...converted.filter((item) => !knownIds.has(item.id))];
}

async function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  if (!apiAvailable) return;
  const response = await fetch(API_DATA_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(state),
  });
  if (response.status === 401) {
    location.href = "/login.html";
    throw new Error("登录已过期，请重新登录");
  }
  if (response.status === 403) {
    throw new Error("当前无权限进行全量数据修改");
  }
  if (!response.ok) {
    throw new Error("API save failed");
  }
}

function seedState() {
  const vehicles = [
    {
      id: "v_mixer_01",
      plate: "皖A·3188",
      type: "混凝土罐车",
      model: "三一 12 方",
      driver: "张师傅",
      status: "正常",
      startDate: offsetDate(-180),
      note: "主力运输车",
    },
    {
      id: "v_mixer_02",
      plate: "皖A·5276",
      type: "混凝土罐车",
      model: "中联 10 方",
      driver: "李师傅",
      status: "正常",
      startDate: offsetDate(-160),
      note: "",
    },
    {
      id: "v_pump_01",
      plate: "皖A·P908",
      type: "泵车",
      model: "三一 49 米",
      driver: "王师傅",
      status: "正常",
      startDate: offsetDate(-300),
      note: "泵送业务",
    },
  ];

  const customers = [
    {
      id: "c_hongda",
      name: "宏达商砼",
      contact: "王经理",
      phone: "13800000001",
      creditLimit: 50000,
      note: "月结客户",
    },
    {
      id: "c_chengnan",
      name: "城南建设",
      contact: "刘工",
      phone: "13800000002",
      creditLimit: 30000,
      note: "按项目结算",
    },
    {
      id: "c_yongan",
      name: "永安工地",
      contact: "赵老板",
      phone: "13800000003",
      creditLimit: 20000,
      note: "",
    },
  ];

  const personnel = [
    { id: "p_zhang", name: "张师傅", role: "罐车司机", base: 6500, note: "主力运输车司机" },
    { id: "p_li", name: "李师傅", role: "罐车司机", base: 6200, note: "" },
    { id: "p_wang", name: "王师傅", role: "泵车司机", base: 7800, note: "含泵送提成" },
  ];

  return {
    vehicles,
    customers,
    personnel,
    jobs: [
      {
        id: "j_001",
        date: offsetDate(-5),
        vehicleId: "v_mixer_01",
        customerId: "c_hongda",
        driverId: "p_zhang",
        driver: "张师傅",
        workType: "混凝土运输",
        site: "城东产业园",
        project: "厂房基础",
        trips: 6,
        volume: 72,
        pumpHours: 0,
        unitPrice: 42,
        amount: 3024,
        paid: 1000,
        note: "余款月底结",
      },
      {
        id: "j_002",
        date: offsetDate(-3),
        vehicleId: "v_pump_01",
        customerId: "c_chengnan",
        driverId: "p_wang",
        driver: "王师傅",
        workType: "泵送服务",
        site: "城南安置房",
        project: "2 号楼浇筑",
        trips: 0,
        volume: 0,
        pumpHours: 7.5,
        unitPrice: 360,
        amount: 2700,
        paid: 0,
        note: "含泵工",
      },
      {
        id: "j_003",
        date: offsetDate(-1),
        vehicleId: "v_mixer_02",
        customerId: "c_yongan",
        driverId: "p_li",
        driver: "李师傅",
        workType: "混凝土运输",
        site: "永安路桥",
        project: "路面垫层",
        trips: 4,
        volume: 40,
        pumpHours: 0,
        unitPrice: 45,
        amount: 1800,
        paid: 1800,
        note: "已结清",
      },
    ],
    expenses: [
      {
        id: "e_001",
        date: offsetDate(-4),
        vehicleId: "v_mixer_01",
        type: "油费",
        amount: 1280,
        liters: 160,
        odometer: 68210,
        vendor: "中石化",
        note: "",
      },
      {
        id: "e_002",
        date: offsetDate(-2),
        vehicleId: "v_pump_01",
        type: "维修费",
        amount: 860,
        liters: 0,
        odometer: 45820,
        vendor: "鑫达维修",
        note: "液压管更换",
      },
      {
        id: "e_003",
        date: offsetDate(-1),
        vehicleId: "v_mixer_02",
        type: "过路费",
        amount: 96,
        liters: 0,
        odometer: 59300,
        vendor: "高速收费",
        note: "",
      },
    ],
    salaries: [
      {
        id: "s_001",
        month: toMonth(new Date()),
        personnelId: "p_zhang",
        name: "张师傅",
        role: "罐车司机",
        base: 6500,
        bonus: 500,
        deduction: 0,
        paid: 3000,
        note: "",
      },
      {
        id: "s_002",
        month: toMonth(new Date()),
        personnelId: "p_wang",
        name: "王师傅",
        role: "泵车司机",
        base: 7800,
        bonus: 800,
        deduction: 100,
        paid: 4000,
        note: "含泵送提成",
      },
    ],
    payments: [
      {
        id: "p_001",
        date: offsetDate(-2),
        customerId: "c_hongda",
        amount: 800,
        method: "银行转账",
        note: "支付部分运输款",
      },
    ],
    expenseDrafts: [],
    salaryDrafts: [],
    paymentDrafts: [],
    stockInDrafts: [],
    stockIns: [],
    jobDrafts: [],
  };
}

function setDefaultDates() {
  const today = toDateInput(new Date());
  $("#jobDate").value = previousDateInput(today);
  $("#vehicleStartDate").value = today;
  $("#paymentDate").value = today;
  $("#expenseDate").value = today;
  $("#salaryMonth").value = currentMonth;
}

function bindEvents() {
  $$(".tabs .tab[data-tab]").forEach((button) => {
    button.addEventListener("click", () => switchTab(button.dataset.tab));
  });

  $("#calcJobAmountBtn").addEventListener("click", () => {
    $("#jobAmount").value = calculateJobAmount().toFixed(2);
  });

  $("#calcExpenseAmountBtn").addEventListener("click", () => {
    $("#expenseAmount").value = (n($("#expenseQuantity").value) * n($("#expenseUnitPrice").value)).toFixed(2);
  });

  $("#jobVehicle").addEventListener("change", () => {
    const vehicle = findById("vehicles", $("#jobVehicle").value);
    const person = findPersonnelByName(vehicle?.driver);
    if (vehicle && person) $("#jobDriver").value = person.id;
    applyVehicleWorkType(vehicle);
  });
  ["jobCustomer", "jobWorkType", "jobOdometer", "jobVolume", "jobSettlementVolume", "jobPumpHours", "jobMaterialVolume"].forEach((id) => {
    const element = $(`#${id}`);
    element.addEventListener("change", applyCustomerPricing);
    element.addEventListener("input", applyCustomerPricing);
  });

  $("#jobForm").addEventListener("submit", handleJobSubmit);
  $("#jobSite").addEventListener("input", () => renderJobHistoryDatalists("site", $("#jobSite").value));
  $("#jobProject").addEventListener("input", () => renderJobHistoryDatalists("project", $("#jobProject").value));
  $("#vehicleForm").addEventListener("submit", handleVehicleSubmit);
  $("#customerForm").addEventListener("submit", handleCustomerSubmit);
  $("#paymentForm").addEventListener("submit", handlePaymentSubmit);
  $("#expenseForm").addEventListener("submit", handleExpenseSubmit);
  $("#personnelForm").addEventListener("submit", handlePersonnelSubmit);
  $("#salaryForm").addEventListener("submit", handleSalarySubmit);
  $("#salaryPerson").addEventListener("change", fillSalaryDefaultsFromPerson);

  $$("[data-reset]").forEach((button) => {
    button.addEventListener("click", () => resetForm(button.dataset.reset));
  });

  [
    "jobSearch",
    "jobDateFilter",
    "jobStartDateFilter",
    "jobEndDateFilter",
    "jobFilterCustomer",
    "jobFilterVehicle",
    "jobFilterDriver",
    "jobDraftSearch",
    "customerSearch",
    "paymentDraftSearch",
    "expenseDraftSearch",
    "expenseSearch",
    "notificationSearch",
    "submittedDraftsSearch",
    "personnelSearch",
    "salaryDraftSearch",
    "salarySearch",
  ].forEach((id) => {
    const input = $(`#${id}`);
    if (!input) return;
    input.addEventListener("input", () => {
      Object.keys(tablePages).forEach((key) => (tablePages[key] = 1));
      renderAll();
    });
  });

  document.addEventListener("click", handleGlobalClicks);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeSettingsMenu();
  });

  $("#exportJsonBtn").addEventListener("click", exportJson);
  $("#exportCsvBtn").addEventListener("click", exportMonthlyCsv);
  $("#importJsonInput").addEventListener("change", importJson);
  $("#copySummaryBtn").addEventListener("click", copySummary);
  $("#themeToggleBtn").addEventListener("click", toggleTheme);
  $("#systemSettingsBtn").addEventListener("click", toggleSettingsMenu);
  $("#resetDemoBtn").addEventListener("click", resetDemoData);
  $("#exportCustomerLedgerBtn").addEventListener("click", exportCustomerLedger);
}

function handleGlobalClicks(event) {
  const settingsButton = event.target.closest("#systemSettingsBtn");
  const settingsMenu = event.target.closest("#systemSettingsMenu");

  const dashboardAction = event.target.closest("[data-dashboard-action]");
  if (dashboardAction) {
    if (dashboardAction.dataset.dashboardAction === "yesterday-jobs") jumpToYesterdayJobs();
    if (dashboardAction.dataset.dashboardAction === "customer-payment") jumpToCustomerPayment();
    if (dashboardAction.dataset.dashboardAction === "customer-debts") jumpToCustomerDebtList();
    return;
  }

  const jumpButton = event.target.closest("[data-jump]");
  if (jumpButton) {
    switchTab(jumpButton.dataset.jump);
    return;
  }

  const moduleModeButton = event.target.closest("[data-module-mode]");
  if (moduleModeButton) {
    setModuleMode(moduleModeButton.dataset.moduleMode, moduleModeButton.dataset.mode || "list", true);
    return;
  }

  const reviewModeButton = event.target.closest("[data-review-mode]");
  if (reviewModeButton) {
    setReviewMode(reviewModeButton.dataset.reviewMode);
    return;
  }

  const pageButton = event.target.closest("[data-page-key]");
  if (pageButton && !pageButton.disabled) {
    const key = pageButton.dataset.pageKey;
    tablePages[key] = Math.max(1, (tablePages[key] || 1) + (pageButton.dataset.pageDir === "next" ? 1 : -1));
    renderAll();
    return;
  }

  const settingsTabButton = event.target.closest("#systemSettingsMenu [data-tab]");
  if (settingsTabButton) {
    switchTab(settingsTabButton.dataset.tab);
    closeSettingsMenu();
    return;
  }

  const settingsActionButton = event.target.closest("#systemSettingsMenu [data-action]");
  if (settingsActionButton) {
    closeSettingsMenu();
    if (settingsActionButton.dataset.action === "switch-user" || settingsActionButton.dataset.action === "logout") {
      endSession();
      return;
    }
  }

  if (!settingsButton && !settingsMenu) {
    closeSettingsMenu();
  }

  handleTableActions(event);
}

function switchTab(tab) {
  activeTab = tab === "stock" ? "expenses" : tab;
  if (activeTab === "reviews" && !canReviewExpenseDraft()) activeTab = "dashboard";
  if (activeTab === "jobs") setModuleMode("jobs", "entry");
  if (activeTab === "vehicles") setModuleMode("vehicles", "list");
  if (activeTab === "customers") setModuleMode("customers", "list");
  if (activeTab === "expenses") setModuleMode("expenses", "list");
  if (activeTab === "salaries") setModuleMode("salaries", "list");
  if (activeTab === "reviews") setReviewMode("jobs");
  $$(".tab").forEach((button) => button.classList.toggle("active", button.dataset.tab === activeTab));
  $$(".page").forEach((page) => page.classList.toggle("active", page.id === activeTab));
}

function setModuleMode(module, mode = "list", shouldScroll = false) {
  if (!module || !(module in moduleModes)) return;
  if (!canAccessModuleMode(module, mode)) {
    toast(restrictedModuleMessage(module, mode));
    mode = "list";
  }
  moduleModes[module] = mode;
  renderModuleModes();
  renderRoleWorkspace();
  if (shouldScroll) {
    const target = $(`[data-module="${module}"][data-mode="${mode}"]`);
    target?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

function renderModuleModes() {
  Object.entries(moduleModes).forEach(([module, mode]) => {
    $$(`[data-module="${module}"]`).forEach((panel) => {
      panel.hidden = panel.dataset.mode !== mode;
    });
    $$(`[data-module-mode="${module}"]`).forEach((button) => {
      if (!button.closest(".module-switcher")) return;
      const isActive = button.dataset.mode === mode;
      button.classList.toggle("primary", isActive);
      button.classList.toggle("ghost", !isActive);
    });
  });
}

function renderAdminVisibility() {
  const isAdmin = currentUser?.role === "admin";
  $$(".admin-only").forEach((element) => {
    element.hidden = !isAdmin;
  });
  if (!isAdmin && activeTab === "reviews") switchTab("dashboard");
}

function setReviewMode(mode = "jobs") {
  activeReviewMode = mode;
  renderReviewModes();
}

function renderReviewModes() {
  $$("[data-review-panel]").forEach((panel) => {
    panel.hidden = panel.dataset.reviewPanel !== activeReviewMode;
  });
  $$("[data-review-mode]").forEach((button) => {
    const isActive = button.dataset.reviewMode === activeReviewMode;
    button.classList.toggle("primary", isActive);
    button.classList.toggle("ghost", !isActive);
  });
}

function getReviewCounts() {
  return {
    jobs: state.jobDrafts.filter((draft) => draft.status === "draft").length,
    expenses: state.expenseDrafts.filter((draft) => draft.status === "draft").length,
    salaries: state.salaryDrafts.filter((draft) => draft.status === "draft").length,
    payments: state.paymentDrafts.filter((draft) => draft.status === "draft").length,
  };
}

function renderReviewBadges() {
  const counts = getReviewCounts();
  const total = Object.values(counts).reduce((sumCount, count) => sumCount + count, 0);
  const navBadge = $("#reviewNavBadge");
  if (navBadge) {
    navBadge.textContent = String(total);
    navBadge.hidden = total <= 0 || currentUser?.role !== "admin";
  }
  Object.entries(counts).forEach(([key, count]) => {
    const alert = $(`[data-review-alert="${key}"]`);
    if (alert) alert.hidden = count <= 0;
    const button = $(`[data-review-mode="${key}"]`);
    if (button) button.classList.toggle("has-review-alert", count > 0);
  });
}

function getDraftEntries() {
  const currentUserId = currentUser?.id || "";
  if (!currentUserId) return [];
  const entries = [
    ...state.jobDrafts.map((draft) => ({ type: "job", label: draft.originalJobId ? "运输修改草稿" : "运输记录草稿", draft })),
    ...state.expenseDrafts.map((draft) => ({ type: "expense", label: "费用草稿", draft })),
    ...state.salaryDrafts.map((draft) => ({ type: "salary", label: "工资草稿", draft })),
    ...state.paymentDrafts.map((draft) => ({ type: "payment", label: "收款草稿", draft })),
  ];
  return entries
    .filter(({ draft }) => ["draft", "rejected"].includes(draft.status) && draft.createdBy === currentUser?.id)
    .sort((a, b) => String(draftUpdatedAt(b.draft)).localeCompare(String(draftUpdatedAt(a.draft))));
}

function getSubmittedDraftEntries() {
  return getDraftEntries().filter(({ draft }) => draft.status === "draft");
}

function getRejectedNotifications() {
  return getDraftEntries().filter(({ draft }) => draft.status === "rejected");
}

function notificationDescription(entry) {
  const { type, draft } = entry;
  if (type === "job") {
    const vehicle = findById("vehicles", draft.vehicleId);
    const customer = findById("customers", draft.customerId);
    return [jobDocumentNo(draft), draft.date, vehicle?.plate, customer?.name, draft.site || draft.project || draft.workType].filter(Boolean).join(" · ");
  }
  if (type === "expense") {
    const vehicle = findById("vehicles", draft.vehicleId);
    return [draft.date, vehicle?.plate, draft.type || draft.itemName, money(draft.amount)].filter(Boolean).join(" · ");
  }
  if (type === "salary") return [draft.month, draft.name, money(salaryTotalDue(draft))].filter(Boolean).join(" · ");
  if (type === "payment") {
    const customer = findById("customers", draft.customerId);
    return [draft.date, customer?.name, money(draft.amount)].filter(Boolean).join(" · ");
  }
  return "";
}

function draftUpdatedAt(draft) {
  return draft.rejectedAt || draft.createdAt || draft.date || draft.month || "";
}

function draftStatusLabel(draft) {
  if (draft.status === "rejected") return "已驳回";
  return "待审核";
}

function renderNotificationBadges() {
  const count = getRejectedNotifications().length;
  const badge = $("#notificationNavBadge");
  if (!badge) return;
  badge.textContent = String(count);
  badge.hidden = count <= 0;
}

function renderSubmittedDraftBadges() {
  const count = getSubmittedDraftEntries().length;
  const badge = $("#submittedDraftsNavBadge");
  if (!badge) return;
  badge.textContent = String(count);
  badge.hidden = count <= 0;
}

function renderNotifications() {
  const body = $("#notificationsTableBody");
  if (!body) return;
  if ($("#notificationNavLabel")) $("#notificationNavLabel").textContent = "通知";
  const search = ($("#notificationSearch")?.value || "").trim().toLowerCase();
  const notifications = getRejectedNotifications()
    .filter((entry) => includesSearch([entry.label, draftStatusLabel(entry.draft), notificationDescription(entry), entry.draft.rejectReason, entry.draft.rejectedByName], search));
  const page = paginateRows(notifications, "notifications");
  renderPagination("#notificationsPagination", "notifications", page);
  body.innerHTML =
    page.rows
      .map((entry) => `
        <tr>
          <td><span class="badge ${entry.draft.status === "rejected" ? "danger" : "warn"}">${escapeHtml(entry.label)}</span></td>
          <td>${escapeHtml(notificationDescription(entry) || "-")}</td>
          <td>${escapeHtml(draftStatusLabel(entry.draft))}<div class="cell-muted">${escapeHtml(entry.draft.rejectReason || "等待管理员审核")}</div></td>
          <td>${formatDateTime(draftUpdatedAt(entry.draft))}</td>
          <td><div class="actions">
            <button class="mini-button" data-action="edit-submitted-draft" data-type="${escapeHtml(entry.type)}" data-id="${escapeHtml(entry.draft.id)}" type="button">编辑</button>
            <button class="mini-button danger" data-action="delete-submitted-draft" data-type="${escapeHtml(entry.type)}" data-id="${escapeHtml(entry.draft.id)}" type="button">删除</button>
          </div></td>
        </tr>
      `)
      .join("") || emptyRow(5, "暂无驳回通知");
}

function renderSubmittedDrafts() {
  const body = $("#submittedDraftsTableBody");
  if (!body) return;
  const search = ($("#submittedDraftsSearch")?.value || "").trim().toLowerCase();
  const submittedDrafts = getSubmittedDraftEntries()
    .filter((entry) => includesSearch([entry.label, draftStatusLabel(entry.draft), notificationDescription(entry), entry.draft.createdByName], search));
  const page = paginateRows(submittedDrafts, "submittedDrafts");
  renderPagination("#submittedDraftsPagination", "submittedDrafts", page);
  body.innerHTML =
    page.rows
      .map((entry) => `
        <tr>
          <td><span class="badge warn">${escapeHtml(entry.label)}</span></td>
          <td>${escapeHtml(notificationDescription(entry) || "-")}</td>
          <td>${escapeHtml(draftStatusLabel(entry.draft))}<div class="cell-muted">等待管理员审核</div></td>
          <td>${formatDateTime(draftUpdatedAt(entry.draft))}</td>
          <td><div class="actions">
            <button class="mini-button" data-action="edit-submitted-draft" data-type="${escapeHtml(entry.type)}" data-id="${escapeHtml(entry.draft.id)}" type="button">编辑</button>
            <button class="mini-button danger" data-action="delete-submitted-draft" data-type="${escapeHtml(entry.type)}" data-id="${escapeHtml(entry.draft.id)}" type="button">删除</button>
          </div></td>
        </tr>
      `)
      .join("") || emptyRow(5, "暂无提交草稿");
}

function toggleSettingsMenu() {
  const menu = $("#systemSettingsMenu");
  const button = $("#systemSettingsBtn");
  const willOpen = menu.hidden;
  menu.hidden = !willOpen;
  button.setAttribute("aria-expanded", String(willOpen));
  document.body.classList.toggle("settings-open", willOpen);
}

function closeSettingsMenu() {
  const menu = $("#systemSettingsMenu");
  if (!menu || menu.hidden) return;
  menu.hidden = true;
  $("#systemSettingsBtn").setAttribute("aria-expanded", "false");
  document.body.classList.remove("settings-open");
}

function applySavedTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  applyTheme(saved === "night" ? "night" : "day");
}

function applyTheme(theme) {
  const isNight = theme === "night";
  document.body.dataset.theme = isNight ? "night" : "day";
  const button = $("#themeToggleBtn");
  if (!button) return;
  button.setAttribute("aria-pressed", String(isNight));
  button.setAttribute("aria-label", isNight ? "切换白天模式" : "切换夜晚模式");
  button.setAttribute("title", isNight ? "切换白天模式" : "切换夜晚模式");
}

function toggleTheme() {
  const next = document.body.dataset.theme === "night" ? "day" : "night";
  localStorage.setItem(THEME_KEY, next);
  applyTheme(next);
}

function renderAll() {
  renderAdminVisibility();
  renderRoleWorkspace();
  renderModuleModes();
  renderRoleWorkspace();
  renderReviewModes();
  renderReviewBadges();
  renderNotificationBadges();
  renderSubmittedDraftBadges();
  renderSelects();
  renderJobHistoryDatalists();
  renderDashboard();
  renderNotifications();
  renderSubmittedDrafts();
  renderJobDraftsTable();
  renderJobsTable();
  renderVehiclesTable();
  renderCustomersTable();
  renderPaymentsTable();
  renderPaymentDraftsTable();
  renderCustomerLedger();
  renderExpenseDraftsTable();
  renderExpensesTable();
  renderExpenseRoleState();
  renderPersonnelTable();
  renderSalaryDraftsTable();
  renderSalariesTable();
  renderSalaryRoleState();
  renderSummary();
}

function renderRoleWorkspace() {
  if (!canManageMasterData()) {
    if (moduleModes.vehicles === "entry") moduleModes.vehicles = "list";
    if (moduleModes.customers === "customer-entry") moduleModes.customers = "list";
    if (moduleModes.salaries === "personnel-entry") moduleModes.salaries = "list";
  }
  $$("[data-role-requires]").forEach((element) => {
    const allowed = roleRequirementAllowed(element.dataset.roleRequires);
    const modeActive = element.dataset.module && element.dataset.mode
      ? moduleModes[element.dataset.module] === element.dataset.mode
      : true;
    element.hidden = !allowed || !modeActive;
  });
}

function renderSelects() {
  const vehicleOptions = state.vehicles
    .map((vehicle) => `<option value="${vehicle.id}">${escapeHtml(vehicle.plate)} · ${escapeHtml(vehicle.type)}</option>`)
    .join("");
  const customerOptions = state.customers
    .map((customer) => `<option value="${customer.id}">${escapeHtml(customer.name)}</option>`)
    .join("");
  const personnelOptions = renderPersonnelOptions();

  setSelectOptions("#jobVehicle", vehicleOptions || `<option value="">请先添加车辆</option>`);
  setSelectOptions("#expenseVehicle", vehicleOptions || `<option value="">请先添加车辆</option>`);
  setSelectOptions("#jobCustomer", customerOptions || `<option value="">请先添加客户</option>`);
  setSelectOptions("#paymentCustomer", customerOptions || `<option value="">请先添加客户</option>`);
  setSelectOptions("#jobDriver", personnelOptions || `<option value="">请先添加人员</option>`);
  setSelectOptions("#salaryPerson", personnelOptions || `<option value="">请先添加人员</option>`);
  setSelectOptions("#jobFilterCustomer", `<option value="">全部客户</option>${customerOptions}`);
  setSelectOptions("#jobFilterVehicle", `<option value="">全部车辆</option>${vehicleOptions}`);
  setSelectOptions("#jobFilterDriver", `<option value="">全部驾驶员</option>${personnelOptions}`);
}

function collectJobHistoryValues(field, query = "") {
  const counts = new Map();
  const keyword = String(query || "").trim().toLowerCase();
  [...state.jobs, ...state.jobDrafts].forEach((job) => {
    const value = String(job?.[field] || "").trim();
    if (!value) return;
    counts.set(value, (counts.get(value) || 0) + 1);
  });
  return Array.from(counts.entries())
    .map(([value, count]) => ({ value, count }))
    .filter((item) => !keyword || item.value.toLowerCase().includes(keyword))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value, "zh-CN"))
    .slice(0, JOB_HISTORY_DATALIST_LIMIT)
    .map((item) => item.value);
}

function renderJobHistoryDatalists(field = "", query = "") {
  const renderOptions = (values) => values.map((value) => `<option value="${escapeHtml(value)}"></option>`).join("");
  if (!field || field === "site") {
    $("#jobSiteHistory").innerHTML = renderOptions(collectJobHistoryValues("site", field === "site" ? query : ""));
  }
  if (!field || field === "project") {
    $("#jobProjectHistory").innerHTML = renderOptions(collectJobHistoryValues("project", field === "project" ? query : ""));
  }
}

function renderPersonnelOptions() {
  return sortPersonnelByName(state.personnel)
    .map((person) => `<option value="${person.id}">${escapeHtml(person.name)} · ${escapeHtml(person.role || "未设岗位")}</option>`)
    .join("");
}

function setSelectOptions(selector, html) {
  const select = $(selector);
  const previous = select.value;
  select.innerHTML = html;
  if (previous && Array.from(select.options).some((option) => option.value === previous)) {
    select.value = previous;
  }
}

function renderDashboard() {
  const jobs = byMonth(state.jobs, "date");
  const expenses = byMonth(state.expenses, "date");
  const salaries = state.salaries.filter((salary) => salary.month === currentMonth);
  const payments = byMonth(state.payments, "date");
  const revenue = sum(jobs, "amount");
  const jobPaid = sum(jobs, "paid");
  const monthPayments = sum(payments, "amount");
  const expenseTotal = sum(expenses, "amount");
  const salaryTotal = salaries.reduce((total, salary) => total + salaryTotalDue(salary), 0);
  const profit = revenue - expenseTotal - salaryTotal;
  const receivableTotal = getReceivableTotal();
  const monthDebt = revenue - jobPaid - monthPayments;

  $("#statsGrid").innerHTML = [
    statCard("应收", money(revenue), `${jobs.length} 单`, "good"),
    statCard("已收", money(jobPaid + monthPayments), `回款 ${money(monthPayments)}`, "good"),
    statCard("费用", money(expenseTotal), `${expenses.length} 笔`, ""),
    statCard("工资", money(salaryTotal), `${salaries.length} 条`, ""),
    statCard("毛利", money(profit), "扣除成本后", profit >= 0 ? "good" : "warning"),
    statCard("欠账", money(receivableTotal), `净增 ${money(monthDebt)}`, receivableTotal > 0 ? "warning" : "good"),
  ].join("");

  renderDailyTrend(jobs);
  renderRecentJobs(jobs);
  renderDebtRanking();
  renderVehicleBars(jobs, expenses);
  renderExpenseBreakdown(expenses);
  renderExpiryAlerts();
}

function statCard(label, value, note, className) {
  return `
    <article class="stat-card ${className}">
      <div class="stat-label">${escapeHtml(label)}</div>
      <div class="stat-value">${escapeHtml(value)}</div>
      <div class="stat-note">${escapeHtml(note)}</div>
    </article>
  `;
}

function rollingSevenDayWindow(endDate = new Date()) {
  const end = new Date(endDate);
  end.setHours(0, 0, 0, 0);
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(end);
    date.setDate(end.getDate() - (6 - index));
    return {
      date: toDateInput(date),
      label: `${date.getMonth() + 1}/${date.getDate()}`,
    };
  });
}

function yesterdayDate() {
  return offsetDate(-1);
}

function dailyTrendRows(jobs) {
  return rollingSevenDayWindow().map((day) => {
    const dayJobs = jobs.filter((job) => job.date === day.date);
    const trips = sum(dayJobs, "trips");
    const jobsCount = dayJobs.length;
    return { ...day, trips, jobsCount };
  });
}

function renderDailyTrend(jobs) {
  const chart = $("#dailyTrendChart");
  const legend = $("#dailyTrendLegend");
  if (!chart || !legend) return;
  const rows = dailyTrendRows(jobs);
  const maxTrips = Math.max(1, ...rows.map((row) => row.trips));
  const totalTrips = sum(rows, "trips");
  const activeDays = rows.filter((row) => row.trips > 0).length;
  const averageTrips = totalTrips / 7;
  const peak = rows.reduce((best, row) => (row.trips > best.trips ? row : best), rows[0] || { label: "--", trips: 0 });
  const width = 960;
  const height = 220;
  const pad = { top: 22, right: 24, bottom: 38, left: 56 };
  const plotWidth = width - pad.left - pad.right;
  const plotHeight = height - pad.top - pad.bottom;
  const slotWidth = plotWidth / rows.length;
  const barWidth = Math.max(18, Math.min(40, slotWidth * 0.34));
  const x = (index) => pad.left + index * slotWidth + (slotWidth - barWidth) / 2;
  const y = (value) => pad.top + (1 - value / maxTrips) * plotHeight;
  const gridValues = [maxTrips, Math.ceil(maxTrips / 2), 0];

  legend.innerHTML = `
    <span class="trend-key"><i></i>出车趟数</span>
    <span class="trend-stat">7 日出车 <strong>${escapeHtml(totalTrips)}</strong> 趟</span>
    <span class="trend-stat">7 日高峰 ${escapeHtml(peak.label)} <strong>${escapeHtml(peak.trips)}</strong> 趟</span>
    <span class="trend-stat">7 日日均 <strong>${escapeHtml(averageTrips.toFixed(1))}</strong> 趟</span>
  `;
  chart.innerHTML = `
    <svg class="trend-svg" viewBox="0 0 ${width} ${height}" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="tripBarGradient" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stop-color="#47c8bd"></stop>
          <stop offset="45%" stop-color="#13a094"></stop>
          <stop offset="100%" stop-color="#0b625d"></stop>
        </linearGradient>
        <linearGradient id="tripPeakGradient" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stop-color="#edc66d"></stop>
          <stop offset="55%" stop-color="#c98b32"></stop>
          <stop offset="100%" stop-color="#8a530b"></stop>
        </linearGradient>
        <linearGradient id="tripBarSheen" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0%" stop-color="#ffffff" stop-opacity="0.44"></stop>
          <stop offset="42%" stop-color="#ffffff" stop-opacity="0.2"></stop>
          <stop offset="100%" stop-color="#ffffff" stop-opacity="0"></stop>
        </linearGradient>
      </defs>
      ${gridValues
        .map(
          (value) => `
            <g class="trend-grid">
              <line x1="${pad.left}" y1="${y(value).toFixed(2)}" x2="${width - pad.right}" y2="${y(value).toFixed(2)}"></line>
              <text x="${pad.left - 10}" y="${y(value).toFixed(2)}">${escapeHtml(value)}趟</text>
            </g>
          `
        )
        .join("")}
      <line class="trend-axis" x1="${pad.left}" y1="${height - pad.bottom}" x2="${width - pad.right}" y2="${height - pad.bottom}"></line>
      ${rows
        .map((row, index, labels) => {
          const rowIndex = rows.findIndex((item) => item.date === row.date);
          return `<text class="trend-x-label" x="${(x(rowIndex) + barWidth / 2).toFixed(2)}" y="${height - 14}" text-anchor="middle">${escapeHtml(row.label)}</text>`;
        })
        .join("")}
      ${rows
        .map((row, index) => {
          const barHeight = Math.max(row.trips > 0 ? 4 : 0, (row.trips / maxTrips) * plotHeight);
          const barY = pad.top + plotHeight - barHeight;
          const cls = row.trips === peak.trips && peak.trips > 0 ? "trend-bar peak" : "trend-bar";
          const rimCls = row.trips === peak.trips && peak.trips > 0 ? "trend-bar-rim peak" : "trend-bar-rim";
          const label = row.trips > 0 ? `<text class="trend-bar-label" x="${(x(index) + barWidth / 2).toFixed(2)}" y="${(barY - 8).toFixed(2)}" text-anchor="middle">${escapeHtml(row.trips)}</text>` : "";
          return `
            <g class="trend-bar-group">
              <rect class="${cls}" x="${x(index).toFixed(2)}" y="${barY.toFixed(2)}" width="${barWidth.toFixed(2)}" height="${barHeight.toFixed(2)}" rx="8">
                <title>${escapeHtml(row.label)}日：${escapeHtml(row.trips)} 趟，${escapeHtml(row.jobsCount)} 单</title>
              </rect>
              <rect class="${rimCls}" x="${x(index).toFixed(2)}" y="${barY.toFixed(2)}" width="${barWidth.toFixed(2)}" height="${barHeight.toFixed(2)}" rx="8"></rect>
              <rect class="trend-bar-highlight" x="${(x(index) + 4).toFixed(2)}" y="${(barY + 5).toFixed(2)}" width="${Math.max(4, barWidth * 0.28).toFixed(2)}" height="${Math.max(0, barHeight - 10).toFixed(2)}" rx="5"></rect>
            </g>
            ${label}
          `;
        })
        .join("")}
    </svg>
    <div class="trend-summary">
      <span>近 7 日出车 <strong>${totalTrips}</strong> 趟</span>
      <span>有出车记录 <strong>${activeDays}</strong> 天</span>
      <span>按每日运输台账的趟数统计</span>
    </div>
  `;
}

function renderRecentJobs(jobs) {
  const yesterday = yesterdayDate();
  const rows = jobs
    .filter((job) => job.date === yesterday)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 3)
    .map((job) => {
      const vehicle = findById("vehicles", job.vehicleId);
      const customer = findById("customers", job.customerId);
      const debt = n(job.amount) - n(job.paid);
      return `
        <div class="activity-item">
          <span class="activity-date">${escapeHtml(job.date.slice(5))}</span>
          <span class="activity-main">
            <strong>${escapeHtml(vehicle?.plate || "已删车辆")}</strong>
            <span>${escapeHtml(customer?.name || "已删客户")}</span>
          </span>
          <span class="activity-money ${debt > 0 ? "money-negative" : ""}">${money(job.amount)}</span>
        </div>
      `;
    })
    .join("");
  $("#recentJobsBody").innerHTML = rows || `<div class="empty">昨日暂无运输记录</div>`;
}

function renderDebtRanking() {
  const balances = getCustomerBalances()
    .filter((item) => item.balance > 0)
    .sort((a, b) => b.balance - a.balance)
    .slice(0, 3);
  const max = Math.max(...balances.map((item) => item.balance), 1);
  $("#debtRanking").innerHTML =
    balances
      .map(
        (item) => `
          <div class="rank-item">
            <div class="rank-line">
              <strong>${escapeHtml(item.customer.name)}</strong>
              <span class="money-negative">${money(item.balance)}</span>
            </div>
            <div class="meter"><span style="width:${Math.max(4, (item.balance / max) * 100)}%"></span></div>
            <div class="cell-muted">累计应收 ${money(item.revenue)}，已收 ${money(item.paid)}</div>
          </div>
        `
      )
      .join("") || `<div class="empty">暂无客户欠账</div>`;
}

function jumpToYesterdayJobs() {
  const targetDate = yesterdayDate();
  switchTab("jobs");
  setModuleMode("jobs", "list");
  $("#jobSearch").value = "";
  $("#jobDateFilter").value = targetDate;
  $("#jobStartDateFilter").value = "";
  $("#jobEndDateFilter").value = "";
  $("#jobFilterCustomer").value = "";
  $("#jobFilterVehicle").value = "";
  $("#jobFilterDriver").value = "";
  tablePages.jobs = 1;
  renderAll();
}

function jumpToCustomerPayment() {
  switchTab("customers");
  setModuleMode("customers", "payment-entry", true);
}

function jumpToCustomerDebtList() {
  customerSortMode = "debt-desc";
  $("#customerSearch").value = "";
  tablePages.customers = 1;
  switchTab("customers");
  setModuleMode("customers", "list");
  renderAll();
}

function renderVehicleBars(jobs, expenses) {
  const box = $("#vehicleBars");
  if (!box) return;
  const rows = state.vehicles.map((vehicle) => {
    const revenue = sum(
      jobs.filter((job) => job.vehicleId === vehicle.id),
      "amount"
    );
    const cost = sum(
      expenses.filter((expense) => expense.vehicleId === vehicle.id),
      "amount"
    );
    return { vehicle, revenue, cost };
  }).sort((a, b) => b.revenue - a.revenue).slice(0, 4);
  const max = Math.max(...rows.flatMap((row) => [row.revenue, row.cost]), 1);
  box.innerHTML =
    rows
      .map(
        (row) => `
          <div class="bar-item">
            <div class="bar-line">
              <strong>${escapeHtml(row.vehicle.plate)} · ${escapeHtml(row.vehicle.type)}</strong>
              <span>${money(row.revenue)} / 费用 ${money(row.cost)}</span>
            </div>
            <div class="meter"><span style="width:${Math.max(3, (row.revenue / max) * 100)}%"></span></div>
            <div class="meter cost-meter"><span style="width:${Math.max(3, (row.cost / max) * 100)}%"></span></div>
          </div>
        `
      )
      .join("") || `<div class="empty">暂无车辆数据</div>`;
}

function renderExpenseBreakdown(expenses) {
  const box = $("#expenseBreakdown");
  if (!box) return;
  const grouped = groupSum(expenses, "type", "amount");
  const rows = Object.entries(grouped).sort((a, b) => b[1] - a[1]);
  const max = Math.max(...rows.map(([, value]) => value), 1);
  box.innerHTML =
    rows
      .map(
        ([type, amount]) => `
          <div class="breakdown-item">
            <div class="breakdown-line">
              <strong>${escapeHtml(type)}</strong>
              <span>${money(amount)}</span>
            </div>
            <div class="meter"><span style="width:${Math.max(4, (amount / max) * 100)}%"></span></div>
          </div>
        `
      )
      .join("") || `<div class="empty">本月暂无费用记录</div>`;
}

function getVehicleExpiryAlerts() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const items = [];
  const push = (vehicle, label, date) => {
    if (!date) return;
    const target = new Date(date).getTime();
    if (!Number.isFinite(target)) return;
    const days = Math.ceil((target - start) / 86400000);
    if (days <= 30) {
      items.push({ vehicle, label, date, days });
    }
  };
  state.vehicles.forEach((vehicle) => {
    push(vehicle, "年审", vehicle.inspectionExpiry);
    push(vehicle, "强制险", vehicle.compulsoryInsurance?.expiry);
    push(vehicle, "商业险", vehicle.commercialInsurance?.expiry);
    push(vehicle, "超赔险", vehicle.excessInsurance?.expiry);
  });
  return items.sort((a, b) => a.days - b.days);
}

function renderExpiryAlerts() {
  const box = $("#expiryAlerts");
  if (!box) return;
  const alerts = getVehicleExpiryAlerts();
  box.innerHTML =
    alerts
      .map((item) => {
        const cls = item.days < 0 ? "danger" : "warn";
        const text = item.days < 0 ? `已过期 ${Math.abs(item.days)} 天` : `剩 ${item.days} 天`;
        return `
          <div class="alert-item ${cls}">
            <strong>${escapeHtml(item.vehicle.plate)} ${escapeHtml(item.label)}</strong>
            <span>${escapeHtml(item.date)} · ${escapeHtml(text)}</span>
          </div>
        `;
      })
      .join("") || `<div class="empty">未来一个月暂无车辆证照或保险到期</div>`;
}

function renderJobsTable() {
  const search = $("#jobSearch").value.trim().toLowerCase();
  const singleDate = $("#jobDateFilter").value;
  const startDate = $("#jobStartDateFilter").value;
  const endDate = $("#jobEndDateFilter").value;
  const customerId = $("#jobFilterCustomer").value;
  const vehicleId = $("#jobFilterVehicle").value;
  const driverId = $("#jobFilterDriver").value;
  const jobs = byMonth(state.jobs, "date")
    .filter((job) => {
      const vehicle = findById("vehicles", job.vehicleId);
      const customer = findById("customers", job.customerId);
      const driver = findById("personnel", driverId);
      const dateMatched = singleDate ? job.date === singleDate : (!startDate || job.date >= startDate) && (!endDate || job.date <= endDate);
      const driverMatched = !driverId || job.driverId === driverId || job.driver === driver?.name;
      return (
        dateMatched &&
        (!customerId || job.customerId === customerId) &&
        (!vehicleId || job.vehicleId === vehicleId) &&
        driverMatched &&
        includesSearch([jobDocumentNo(job), vehicle?.plate, vehicle?.type, customer?.name, job.site, job.project, job.driver, job.workType], search)
      );
    })
    .sort((a, b) => b.date.localeCompare(a.date));
  const page = paginateRows(jobs, "jobs");
  renderPagination("#jobsPagination", "jobs", page);

  $("#jobsTableBody").innerHTML =
    page.rows
      .map((job) => {
        const vehicle = findById("vehicles", job.vehicleId);
        const customer = findById("customers", job.customerId);
        const quantity = jobQuantityText(job);
        const debt = n(job.amount) - n(job.paid);
        return `
          <tr>
            <td><strong>${escapeHtml(jobDocumentNo(job) || "-")}</strong></td>
            <td>${escapeHtml(job.date)}<div class="cell-muted">${escapeHtml(job.driver || "")}</div></td>
            <td><span class="badge">${escapeHtml(vehicle?.plate || "已删车辆")}</span><div class="cell-muted">${escapeHtml(vehicle?.type || "")}</div></td>
            <td>${escapeHtml(customer?.name || "已删客户")}</td>
            <td>${escapeHtml(job.site || "-")}<div class="cell-muted">${escapeHtml(job.project || job.workType || "")}</div></td>
            <td>${escapeHtml(quantity || "-")}<div class="cell-muted">${job.odometer ? `${job.odometer} km` : ""}${job.paymentMethod ? ` · ${escapeHtml(job.paymentMethod)}` : ""}</div></td>
            <td>${money(job.amount)}</td>
            <td>${money(job.paid)}</td>
            <td class="${debt > 0 ? "money-negative" : "money-positive"}">${money(debt)}</td>
            <td>${actions("job", job.id)}</td>
          </tr>
        `;
      })
      .join("") || emptyRow(10, "本月没有匹配的运输记录");
}

function renderJobDraftsTable() {
  const search = $("#jobDraftSearch").value.trim().toLowerCase();
  const drafts = state.jobDrafts
    .filter((job) => job.status === "draft")
    .filter((job) => {
      const vehicle = findById("vehicles", job.vehicleId);
      const customer = findById("customers", job.customerId);
      return includesSearch(
        [jobDocumentNo(job), vehicle?.plate, vehicle?.type, customer?.name, job.site, job.project, job.driver, job.workType, job.createdByName],
        search
      );
    })
    .sort((a, b) => String(b.createdAt || b.date).localeCompare(String(a.createdAt || a.date)));
  const page = paginateRows(drafts, "jobDrafts");
  renderPagination("#jobDraftsPagination", "jobDrafts", page);

  $("#jobDraftsTableBody").innerHTML =
    page.rows
      .map((job) => {
        const vehicle = findById("vehicles", job.vehicleId);
        const customer = findById("customers", job.customerId);
        const quantity = jobQuantityText(job);
        return `
          <tr>
            <td><strong>${escapeHtml(jobDocumentNo(job) || "-")}</strong></td>
            <td>${escapeHtml(job.date)}<div class="cell-muted">${escapeHtml(job.driver || "")}</div></td>
            <td><span class="badge">${escapeHtml(vehicle?.plate || "已删车辆")}</span><div class="cell-muted">${escapeHtml(vehicle?.type || "")}</div></td>
            <td>${escapeHtml(customer?.name || "已删客户")}</td>
            <td>${escapeHtml(job.site || "-")}<div class="cell-muted">${escapeHtml(job.project || job.workType || "")}</div></td>
            <td>${escapeHtml(quantity || "-")}<div class="cell-muted">${job.odometer ? `${job.odometer} km` : ""}${job.paymentMethod ? ` · ${escapeHtml(job.paymentMethod)}` : ""}</div></td>
            <td>${money(job.amount)}</td>
            <td>${money(job.paid)}</td>
            <td>${escapeHtml(job.createdByName || "-")}<div class="cell-muted">${formatDateTime(job.createdAt)}</div></td>
            <td>${jobDraftActions(job.id)}</td>
          </tr>
        `;
      })
      .join("") || emptyRow(10, "暂无待审核运输记录");
}

function jobDocumentNo(job) {
  return String(job?.documentNo || job?.document_no || job?.ticketNo || job?.ticket_no || "").trim();
}

function jobDraftActions(id) {
  if (currentUser?.role !== "admin") {
    return `<span class="cell-muted">等待管理员审核</span>`;
  }
  return `
    <div class="row-actions">
      <button class="mini-button" data-action="approve-job" data-id="${escapeHtml(id)}" type="button">通过</button>
      <button class="mini-button danger" data-action="reject-job" data-id="${escapeHtml(id)}" type="button">驳回</button>
    </div>
  `;
}

function renderVehiclesTable() {
  const page = paginateRows(state.vehicles, "vehicles");
  renderPagination("#vehiclesPagination", "vehicles", page);
  $("#vehiclesTableBody").innerHTML =
    page.rows
      .map((vehicle) => {
        const revenue = sum(
          byMonth(state.jobs, "date").filter((job) => job.vehicleId === vehicle.id),
          "amount"
        );
        const cost = sum(
          byMonth(state.expenses, "date").filter((expense) => expense.vehicleId === vehicle.id),
          "amount"
        );
        const statusClass = vehicle.status === "正常" ? "" : vehicle.status === "维修中" ? "warn" : "danger";
        // v4.1：年审到期（30 天内红色，已过期深红）
        const expiry = vehicle.inspectionExpiry || "";
        let expiryCell = '<span class="cell-muted">-</span>';
        if (expiry) {
          const days = Math.ceil((new Date(expiry).getTime() - Date.now()) / 86400000);
          if (days < 0) {
            expiryCell = `<span class="expiry-warn">${escapeHtml(expiry)}（已过期 ${-days} 天）</span>`;
          } else if (days <= 30) {
            expiryCell = `<span class="expiry-warn">${escapeHtml(expiry)}（剩 ${days} 天）</span>`;
          } else {
            expiryCell = `<span class="expiry-ok">${escapeHtml(expiry)}</span>`;
          }
        }
        // v4.1：4 张照片 + 3 个 PDF 附件徽标
        const photos = Array.isArray(vehicle.inspectionPhotos) ? vehicle.inspectionPhotos : [];
        const photoBadges = Array.from({ length: 4 }, (_, i) => {
          const fn = photos[i];
          if (!fn) return '<span class="attach-badge muted">—</span>';
          return `<a class="attach-badge" href="/api/attachments/${encodeURIComponent(fn)}" target="_blank" rel="noopener" title="年审照片${i + 1}">图${i + 1}</a>`;
        }).join("");
        const pdfBadge = (label, info) => {
          if (!info?.pdfFile) return `<span class="attach-badge muted">${escapeHtml(label)}</span>`;
          return `<a class="attach-badge" href="/api/attachments/${encodeURIComponent(info.pdfFile)}" target="_blank" rel="noopener" title="${escapeHtml(info.company || "")} ${escapeHtml(info.policyNo || "")}">${escapeHtml(label)}</a>`;
        };
        const expiryBadge = (value) => expiryStatusBadge(value);
        return `
          <tr>
            <td><strong>${escapeHtml(vehicle.plate)}</strong><div class="cell-muted">${escapeHtml(vehicle.model || "")}</div></td>
            <td>${escapeHtml(vehicle.type)}</td>
            <td>${escapeHtml(vehicle.driver || "-")}</td>
            <td>${money(revenue)}</td>
            <td>${money(cost)}</td>
            <td><span class="badge ${statusClass}">${escapeHtml(vehicle.status)}</span></td>
            <td>${expiryCell}</td>
            <td>${expiryBadge(vehicle.compulsoryInsurance?.expiry)}</td>
            <td>${expiryBadge(vehicle.commercialInsurance?.expiry)}</td>
            <td>${expiryBadge(vehicle.excessInsurance?.expiry)}</td>
            <td>${photoBadges}</td>
            <td>${pdfBadge("强制", vehicle.compulsoryInsurance)} ${pdfBadge("商业", vehicle.commercialInsurance)} ${pdfBadge("超赔", vehicle.excessInsurance)}</td>
            <td>${actions("vehicle", vehicle.id)}</td>
          </tr>
        `;
      })
      .join("") || emptyRow(13, "还没有车辆，请先添加泵车或罐车");
}

function renderCustomersTable() {
  const search = $("#customerSearch").value.trim().toLowerCase();
  const balances = getCustomerBalances().filter((item) =>
    includesSearch([item.customer.name, item.customer.contact, item.customer.phone], search)
  );
  if (customerSortMode === "debt-desc") {
    balances.sort((a, b) => b.balance - a.balance);
  }
  const page = paginateRows(balances, "customers");
  renderPagination("#customersPagination", "customers", page);
  $("#customersTableBody").innerHTML =
    page.rows
      .map((item) => {
        const overLimit = item.customer.creditLimit > 0 && item.balance > item.customer.creditLimit;
        const invoices = state.payments.filter((payment) => payment.customerId === item.customer.id && (payment.invoiceNo || payment.invoicePdfFile));
        return `
          <tr>
            <td><strong>${escapeHtml(item.customer.name)}</strong><div class="cell-muted">${escapeHtml(item.customer.note || "")}</div></td>
            <td>${escapeHtml(item.customer.contact || "-")}<div class="cell-muted">${escapeHtml(item.customer.phone || "")}</div></td>
            <td>${money(item.revenue)}</td>
            <td>${money(item.paid)}</td>
            <td>
              ${balanceCell(item)}
              ${overLimit ? `<div><span class="badge danger">超预警</span></div>` : ""}
            </td>
            <td>${attachmentBadge("合同", item.customer.contractPdfFile)}</td>
            <td>${invoiceBadges(invoices)}</td>
            <td>${escapeHtml(item.lastDate || "-")}</td>
            <td>${customerActions(item.customer.id)}</td>
          </tr>
        `;
      })
      .join("") || emptyRow(9, "没有匹配客户");
}

function renderPaymentsTable() {
  const payments = state.payments.slice().sort((a, b) => b.date.localeCompare(a.date));
  $("#paymentsTableBody").innerHTML =
    payments
      .map((payment) => {
        const customer = findById("customers", payment.customerId);
        return `
          <tr>
            <td>${escapeHtml(payment.date)}</td>
            <td>${escapeHtml(customer?.name || "已删客户")}</td>
            <td>${money(payment.amount)}</td>
            <td>${escapeHtml(payment.method)}</td>
            <td>${payment.invoicePdfFile ? attachmentBadge(payment.invoiceNo || "发票", payment.invoicePdfFile) : escapeHtml(payment.invoiceNo || "-")}</td>
            <td>${escapeHtml(payment.note || "-")}</td>
            <td>${actions("payment", payment.id)}</td>
          </tr>
        `;
      })
      .join("") || emptyRow(7, "还没有回款记录");
}

function renderPaymentDraftsTable() {
  const search = $("#paymentDraftSearch").value.trim().toLowerCase();
  const drafts = state.paymentDrafts
    .filter((draft) => draft.status === "draft")
    .filter((draft) => {
      const customer = findById("customers", draft.customerId);
      return includesSearch([customer?.name, draft.method, draft.invoiceNo, draft.note, draft.createdByName], search);
    })
    .sort((a, b) => String(b.createdAt || b.date).localeCompare(String(a.createdAt || a.date)));
  const page = paginateRows(drafts, "paymentDrafts");
  renderPagination("#paymentDraftsPagination", "paymentDrafts", page);
  $("#paymentDraftsTableBody").innerHTML =
    page.rows
      .map((draft) => {
        const customer = findById("customers", draft.customerId);
        return `
          <tr>
            <td>${escapeHtml(draft.date)}</td>
            <td>${escapeHtml(customer?.name || "已删客户")}</td>
            <td>${money(draft.amount)}</td>
            <td>${escapeHtml(draft.method || "-")}</td>
            <td>${draft.invoicePdfFile ? attachmentBadge(draft.invoiceNo || "发票", draft.invoicePdfFile) : escapeHtml(draft.invoiceNo || "-")}</td>
            <td>${escapeHtml(draft.createdByName || "-")}<div class="cell-muted">${formatDateTime(draft.createdAt)}</div></td>
            <td><span class="badge warn">待审核</span></td>
            <td>${paymentDraftActions(draft.id)}</td>
          </tr>
        `;
      })
      .join("") || emptyRow(8, "暂无待审核收款登记");
}

function paymentDraftActions(id) {
  if (!canReviewPaymentDraft()) {
    return `<span class="cell-muted">等待管理员审核</span>`;
  }
  return `
    <div class="row-actions">
      <button class="mini-button" data-action="approve-payment" data-id="${escapeHtml(id)}" type="button">通过</button>
      <button class="mini-button danger" data-action="reject-payment" data-id="${escapeHtml(id)}" type="button">驳回</button>
    </div>
  `;
}

function renderExpensesTable() {
  const search = $("#expenseSearch").value.trim().toLowerCase();
  const expenses = byMonth(state.expenses, "date")
    .filter((expense) => {
      const vehicle = findById("vehicles", expense.vehicleId);
      return includesSearch([vehicle?.plate, vehicle?.type, expense.type, expense.vendor, expense.note], search);
    })
    .sort((a, b) => b.date.localeCompare(a.date));
  const page = paginateRows(expenses, "expenses");
  renderPagination("#expensesPagination", "expenses", page);
  $("#expensesTableBody").innerHTML =
    page.rows
      .map((expense) => {
        const vehicle = findById("vehicles", expense.vehicleId);
        return `
          <tr>
            <td>${escapeHtml(expense.date)}</td>
            <td>${escapeHtml(vehicle?.plate || "已删车辆")}<div class="cell-muted">${escapeHtml(vehicle?.type || "")}</div></td>
            <td>${escapeHtml(expense.type)}</td>
            <td>${money(expense.amount)}</td>
            <td>${expense.liters ? `${escapeHtml(expense.liters)} L` : "-"}</td>
            <td>${escapeHtml(expense.vendor || "-")}<div class="cell-muted">${expense.odometer ? `${escapeHtml(expense.odometer)} km` : ""}</div></td>
            <td>${actions("expense", expense.id)}</td>
          </tr>
        `;
      })
      .join("") || emptyRow(7, "本月没有匹配的费用记录");
}

function renderExpenseDraftsTable() {
  const search = $("#expenseDraftSearch").value.trim().toLowerCase();
  const drafts = state.expenseDrafts
    .filter((draft) => draft.status === "draft")
    .filter((draft) => {
      const vehicle = findById("vehicles", draft.vehicleId);
      return includesSearch([vehicle?.plate, vehicle?.type, draft.type, draft.itemName, draft.vendor, draft.note, draft.createdByName], search);
    })
    .sort((a, b) => String(b.createdAt || b.date).localeCompare(String(a.createdAt || a.date)));
  const page = paginateRows(drafts, "expenseDrafts");
  renderPagination("#expenseDraftsPagination", "expenseDrafts", page);

  $("#expenseDraftsTableBody").innerHTML =
    page.rows
      .map((draft) => {
        const vehicle = findById("vehicles", draft.vehicleId);
        const quantity = draft.quantity ? `${escapeHtml(draft.quantity)} ${escapeHtml(draft.unit || "")}` : "-";
        return `
          <tr>
            <td>${escapeHtml(draft.date)}</td>
            <td>${escapeHtml(vehicle?.plate || "已删车辆")}<div class="cell-muted">${escapeHtml(vehicle?.type || "")}</div></td>
            <td><strong>${escapeHtml(draft.type || "-")}</strong><div class="cell-muted">${escapeHtml(draft.vendor || draft.itemName || "")}</div></td>
            <td>${quantity}<div class="cell-muted">${draft.unitPrice ? `单价 ${money(draft.unitPrice)}` : ""}</div></td>
            <td>${money(draft.amount)}</td>
            <td>${escapeHtml(draft.createdByName || "-")}<div class="cell-muted">${formatDateTime(draft.createdAt)}</div></td>
            <td><span class="badge warn">待审核</span></td>
            <td>${expenseDraftActions(draft.id)}</td>
          </tr>
        `;
      })
      .join("") || emptyRow(8, "暂无待审核费用单");
}

function renderExpenseRoleState() {
  const hint = $("#expenseRoleHint");
  const submitButton = $("#submitExpenseDraftBtn");
  if (!hint || !submitButton) return;
  const role = roleLabel(currentUser?.role);
  if (canReviewExpenseDraft()) {
    hint.textContent = `${role}：可以提交草稿费用单，也可以审核通过或驳回待审核费用单。`;
    submitButton.disabled = false;
    return;
  }
  if (canSubmitExpenseDraft()) {
    hint.textContent = `${role}：可以提交草稿费用单，提交后等待管理员审核。`;
    submitButton.disabled = false;
    return;
  }
  hint.textContent = `${role}：只能查看待审核和正式费用记录，不能提交或审核费用单。`;
  submitButton.disabled = true;
}

function expenseDraftActions(id) {
  if (!canReviewExpenseDraft()) {
    return `<span class="cell-muted">等待管理员审核</span>`;
  }
  return `
    <div class="row-actions">
      <button class="mini-button" data-action="approve-expense" data-id="${escapeHtml(id)}" type="button">通过</button>
      <button class="mini-button danger" data-action="reject-expense" data-id="${escapeHtml(id)}" type="button">驳回</button>
    </div>
  `;
}

function renderPersonnelTable() {
  const search = $("#personnelSearch").value.trim().toLowerCase();
  const personnel = sortPersonnelByName(state.personnel)
    .filter((person) => includesSearch([person.name, person.role, person.note], search));
  const page = paginateRows(personnel, "personnel");
  renderPagination("#personnelPagination", "personnel", page);
  $("#personnelTableBody").innerHTML =
    page.rows
      .map((person) => {
        const trips = personnelTripStats(person);
        return `
          <tr>
            <td><strong>${escapeHtml(person.name)}</strong></td>
            <td>${escapeHtml(person.role || "-")}</td>
            <td><strong>总趟数 ${trips.totalTrips}</strong><div class="cell-muted">本月 ${trips.monthTrips} 趟</div></td>
            <td>${money(person.base)}</td>
            <td>${escapeHtml(person.note || "")}</td>
            <td>${actions("personnel", person.id)}</td>
          </tr>
        `;
      })
      .join("") || emptyRow(6, "还没有人员记录");
}

function renderSalaryDraftsTable() {
  const search = $("#salaryDraftSearch").value.trim().toLowerCase();
  const drafts = state.salaryDrafts
    .filter((draft) => draft.status === "draft")
    .filter((draft) => draft.month === currentMonth)
    .filter((draft) => includesSearch([draft.name, draft.role, draft.note, draft.createdByName], search))
    .sort((a, b) => String(b.createdAt || b.month).localeCompare(String(a.createdAt || a.month)));
  const page = paginateRows(drafts, "salaryDrafts");
  renderPagination("#salaryDraftsPagination", "salaryDrafts", page);
  $("#salaryDraftsTableBody").innerHTML =
    page.rows
      .map((draft) => {
        const total = salaryTotalDue(draft);
        return `
          <tr>
            <td>${escapeHtml(draft.month)}</td>
            <td><strong>${escapeHtml(draft.name)}</strong><div class="cell-muted">${escapeHtml(draft.note || "")}</div></td>
            <td>${escapeHtml(draft.role || "-")}</td>
            <td>${money(total)}</td>
            <td>${money(draft.paid)}</td>
            <td>${escapeHtml(draft.createdByName || "-")}<div class="cell-muted">${formatDateTime(draft.createdAt)}</div></td>
            <td><span class="badge warn">待审核</span></td>
            <td>${salaryDraftActions(draft.id)}</td>
          </tr>
        `;
      })
      .join("") || emptyRow(8, "暂无待审核工资单");
}

function renderSalaryRoleState() {
  const hint = $("#salaryRoleHint");
  const submitButton = $("#submitSalaryDraftBtn");
  if (!hint || !submitButton) return;
  const role = roleLabel(currentUser?.role);
  if (canReviewSalaryDraft()) {
    hint.textContent = `${role}：可以提交工资审核，也可以审核通过或驳回待审核工资单。`;
    submitButton.disabled = false;
    return;
  }
  if (canSubmitSalaryDraft()) {
    hint.textContent = `${role}：可以提交工资审核，提交后等待管理员审核。`;
    submitButton.disabled = false;
    return;
  }
  hint.textContent = `${role}：只能查看待审核和正式工资记录，不能提交或审核工资单。`;
  submitButton.disabled = true;
}

function salaryDraftActions(id) {
  if (!canReviewSalaryDraft()) {
    return `<span class="cell-muted">等待管理员审核</span>`;
  }
  return `
    <div class="row-actions">
      <button class="mini-button" data-action="approve-salary" data-id="${escapeHtml(id)}" type="button">通过</button>
      <button class="mini-button danger" data-action="reject-salary" data-id="${escapeHtml(id)}" type="button">驳回</button>
    </div>
  `;
}

function renderSalariesTable() {
  const search = $("#salarySearch").value.trim().toLowerCase();
  const salaries = state.salaries
    .filter((salary) => salary.month === currentMonth)
    .filter((salary) => includesSearch([salary.name, salary.role, salary.note], search))
    .sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
  const page = paginateRows(salaries, "salaries");
  renderPagination("#salariesPagination", "salaries", page);
  $("#salariesTableBody").innerHTML =
    page.rows
      .map((salary) => {
        const total = salaryTotalDue(salary);
        const unpaid = total - n(salary.paid);
        return `
          <tr>
            <td>${escapeHtml(salary.month)}</td>
            <td><strong>${escapeHtml(salary.name)}</strong><div class="cell-muted">${escapeHtml(salary.note || "")}</div></td>
            <td>${escapeHtml(salary.role)}</td>
            <td>${money(total)}</td>
            <td>${money(salary.paid)}</td>
            <td class="${unpaid > 0 ? "money-negative" : "money-positive"}">${money(unpaid)}</td>
            <td>${actions("salary", salary.id)}</td>
          </tr>
        `;
      })
      .join("") || emptyRow(7, "本月还没有工资记录");
}

function showCustomerLedger(id) {
  selectedCustomerLedgerId = id;
  tablePages.customerLedger = 1;
  setModuleMode("customers", "customer-ledger", true);
  renderCustomerLedger();
}

function getCustomerLedgerRows(customerId) {
  const transportRows = state.jobs
    .filter((job) => job.customerId === customerId)
    .map((job) => {
      const vehicle = findById("vehicles", job.vehicleId);
      const quantity = [job.trips ? `${job.trips} 趟` : "", job.volume ? `${job.volume} m³` : "", job.pumpHours ? `${job.pumpHours} 小时` : ""]
        .filter(Boolean)
        .join(" / ");
      return {
        type: "每日运输明细",
        date: job.date,
        party: `${vehicle?.plate || "已删车辆"} / ${job.driver || "-"}`,
        desc: [job.site, job.project || job.workType, quantity].filter(Boolean).join(" · "),
        receivable: n(job.amount),
        paid: n(job.paid),
        balance: n(job.amount) - n(job.paid),
      };
    });
  const paymentRows = state.payments
    .filter((payment) => payment.customerId === customerId)
    .map((payment) => ({
      type: "付款情况",
      date: payment.date,
      party: payment.method || "-",
      desc: [payment.invoiceNo, payment.note].filter(Boolean).join(" · "),
      receivable: 0,
      paid: n(payment.amount),
      balance: -n(payment.amount),
    }));
  const rows = [...transportRows, ...paymentRows].sort((a, b) => b.date.localeCompare(a.date));
  const receivable = sum(transportRows, "receivable");
  const paid = sum(transportRows, "paid") + sum(paymentRows, "paid");
  rows.push({
    type: "欠款情况",
    date: "-",
    party: "-",
    desc: "累计应收、累计已收与当前欠款汇总",
    receivable,
    paid,
    balance: receivable - paid,
  });
  return rows;
}

function renderCustomerLedger() {
  const body = $("#customerLedgerTableBody");
  if (!body) return;
  const customer = findById("customers", selectedCustomerLedgerId);
  $("#customerLedgerTitle").textContent = customer ? `${customer.name} · 财务台账` : "客户运输记录";
  if (!customer) {
    renderPagination("#customerLedgerPagination", "customerLedger", paginateRows([], "customerLedger"));
    body.innerHTML = emptyRow(7, "请先在客户列表中选择客户");
    return;
  }
  const ledgerRows = getCustomerLedgerRows(customer.id);
  const page = paginateRows(ledgerRows, "customerLedger");
  renderPagination("#customerLedgerPagination", "customerLedger", page);
  body.innerHTML =
    page.rows
      .map(
        (row) => `
          <tr>
            <td><span class="badge">${escapeHtml(row.type)}</span></td>
            <td>${escapeHtml(row.date)}</td>
            <td>${escapeHtml(row.party)}</td>
            <td>${escapeHtml(row.desc || "-")}</td>
            <td>${row.receivable ? money(row.receivable) : "-"}</td>
            <td>${row.paid ? money(row.paid) : "-"}</td>
            <td class="${row.balance > 0 ? "money-negative" : "money-positive"}">${money(row.balance)}</td>
          </tr>
        `
      )
      .join("") || emptyRow(7, "该客户暂无运输或收款记录");
}

function renderSummary() {
  const jobs = byMonth(state.jobs, "date");
  const expenses = byMonth(state.expenses, "date");
  const payments = byMonth(state.payments, "date");
  const salaries = state.salaries.filter((salary) => salary.month === currentMonth);
  const revenue = sum(jobs, "amount");
  const paid = sum(jobs, "paid") + sum(payments, "amount");
  const expenseTotal = sum(expenses, "amount");
  const salaryTotal = salaries.reduce((total, salary) => total + salaryTotalDue(salary), 0);
  const profit = revenue - expenseTotal - salaryTotal;
  const topDebts = getCustomerBalances()
    .filter((item) => item.balance > 0)
    .sort((a, b) => b.balance - a.balance)
    .slice(0, 5)
    .map((item, index) => `${index + 1}. ${item.customer.name}: ${money(item.balance)}`)
    .join("\n");

  $("#monthlySummary").value = [
    `车辆运输管理系统 - ${currentMonth} 月报`,
    "",
    `运输记录: ${jobs.length} 条`,
    `本月应收: ${money(revenue)}`,
    `本月已收: ${money(paid)}`,
    `本月未收: ${money(revenue - paid)}`,
    `车辆费用: ${money(expenseTotal)}`,
    `人员成本: ${money(salaryTotal)}`,
    `估算毛利润: ${money(profit)}`,
    `客户总欠账: ${money(getReceivableTotal())}`,
    "",
    "欠账排行:",
    topDebts || "暂无欠账",
  ].join("\n");
}

function actions(type, id) {
  if (type === "job" && canSubmitTransportDraft() && !canManageMasterData()) {
    return `
      <div class="row-actions">
        <button class="mini-button" data-action="edit" data-type="${escapeHtml(type)}" data-id="${escapeHtml(id)}" type="button">提交修改</button>
      </div>
    `;
  }
  if (!canManageMasterData()) {
    return `<span class="cell-muted">只读</span>`;
  }
  return `
    <div class="row-actions">
      <button class="mini-button" data-action="edit" data-type="${escapeHtml(type)}" data-id="${escapeHtml(id)}" type="button">编辑</button>
      <button class="mini-button danger" data-action="delete" data-type="${escapeHtml(type)}" data-id="${escapeHtml(id)}" type="button">删除</button>
    </div>
  `;
}

function customerActions(id) {
  if (!canManageMasterData()) {
    return `
      <div class="row-actions">
        <button class="mini-button" data-action="customer-ledger" data-id="${escapeHtml(id)}" type="button">运输记录</button>
      </div>
    `;
  }
  return `
    <div class="row-actions">
      <button class="mini-button" data-action="customer-ledger" data-id="${escapeHtml(id)}" type="button">运输记录</button>
      <button class="mini-button" data-action="edit" data-type="customer" data-id="${escapeHtml(id)}" type="button">编辑</button>
      <button class="mini-button danger" data-action="delete" data-type="customer" data-id="${escapeHtml(id)}" type="button">删除</button>
    </div>
  `;
}

function getResponsivePageSize() {
  return 10;
}

function paginateRows(rows, key) {
  const pageSize = getResponsivePageSize();
  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  tablePages[key] = Math.min(Math.max(tablePages[key] || 1, 1), pages);
  const start = (tablePages[key] - 1) * pageSize;
  return {
    rows: rows.slice(start, start + pageSize),
    page: tablePages[key],
    pages,
    total: rows.length,
    pageSize,
  };
}

function renderPagination(selector, key, pageInfo) {
  const box = $(selector);
  if (!box) return;
  const { page, pages, total, pageSize } = pageInfo;
  box.innerHTML = `
    <span>第 ${page} / ${pages} 页 · 共 ${total} 条 · 每页 ${pageSize} 条</span>
    <div class="row-actions">
      <button class="mini-button" data-page-key="${key}" data-page-dir="prev" type="button" ${page <= 1 ? "disabled" : ""}>上一页</button>
      <button class="mini-button" data-page-key="${key}" data-page-dir="next" type="button" ${page >= pages ? "disabled" : ""}>下一页</button>
    </div>
  `;
}

function emptyRow(colspan, text) {
  return `<tr><td colspan="${colspan}"><div class="empty">${escapeHtml(text)}</div></td></tr>`;
}

function jobQuantityText(job) {
  const actualVolume = job.volume ?? 0;
  const settlementVolume = job.settlementVolume ?? job.volume ?? 0;
  return [
    job.trips ? `${job.trips} 趟` : "",
    `实际 ${actualVolume} m³`,
    `结算 ${settlementVolume} m³`,
    job.materialVolume ? `带料 ${job.materialVolume} m³` : "",
    job.pumpHours ? `${job.pumpHours} 小时` : "",
  ]
    .filter(Boolean)
    .join(" / ");
}

function applyVehicleWorkType(vehicle = findById("vehicles", $("#jobVehicle").value)) {
  if (vehicle?.type === "泵车") {
    $("#jobWorkType").value = "泵送服务";
  }
  if (vehicle?.type === "混凝土罐车") {
    $("#jobWorkType").value = "混凝土运输";
  }
  applyCustomerPricing();
}

async function handleJobSubmit(event) {
  event.preventDefault();
  if (!state.vehicles.length || !state.customers.length || !state.personnel.length) {
    toast("请先添加车辆、客户和人员");
    return;
  }
  const person = findById("personnel", $("#jobDriver").value);
  if (!person) {
    toast("请选择司机/操作员");
    return;
  }
  const existingJobId = $("#jobId").value;
  const sourceJob = findById("jobs", existingJobId);
  const originalJobId = $("#jobOriginalJobId").value || (sourceJob ? existingJobId : "");
  const calculatedAmount = calculateJobAmount();
  const documentNo = $("#jobDocumentNo").value.trim();
  const item = {
    date: $("#jobDate").value,
    documentNo,
    document_no: documentNo,
    vehicleId: $("#jobVehicle").value,
    customerId: $("#jobCustomer").value,
    driverId: person.id,
    driver: person.name,
    workType: $("#jobWorkType").value,
    site: $("#jobSite").value.trim(),
    project: $("#jobProject").value.trim(),
    trips: n($("#jobTrips").value),
    volume: n($("#jobVolume").value),
    settlementVolume: n($("#jobSettlementVolume").value),
    materialVolume: n($("#jobMaterialVolume").value),
    pumpHours: n($("#jobPumpHours").value),
    odometer: n($("#jobOdometer").value), // v4.1
    paymentMethod: $("#jobPaymentMethod").value || "", // v4.1
    unitPrice: n($("#jobUnitPrice").value),
    materialUnitPrice: n($("#jobMaterialUnitPrice").value),
    overtimeUnitPrice: n($("#jobOvertimeUnitPrice").value),
    amount: n($("#jobAmount").value) || calculatedAmount,
    paid: n($("#jobPaid").value),
    note: $("#jobNote").value.trim(),
  };
  try {
    if (existingJobId) {
      const draftPayload = sourceJob
        ? { ...item, originalJobId: existingJobId }
        : { ...item, id: existingJobId, originalJobId };
      const result = await postJson("/api/job-drafts", draftPayload);
      syncState(result.data);
      currentMonth = item.date.slice(0, 7);
      renderAll();
      resetJobFormAfterSubmit(item);
      toast("运输修改已提交，继续录入下一条");
      return;
    }
    const result = await postJson("/api/job-drafts", item);
    syncState(result.data);
    currentMonth = item.date.slice(0, 7);
    renderAll();
    resetJobFormAfterSubmit(item);
    toast("运输记录已提交，继续录入下一条");
  } catch (error) {
    toastSubmitError(error);
  }
}

function resetJobFormAfterSubmit(lastItem) {
  resetForm("jobForm");
  $("#jobSite").value = lastItem.site || "";
  $("#jobProject").value = lastItem.project || "";
  renderJobHistoryDatalists();
  renderJobHistoryDatalists("site", $("#jobSite").value);
  renderJobHistoryDatalists("project", $("#jobProject").value);
}

async function handleVehicleSubmit(event) {
  event.preventDefault();
  if (!assertPermission(canManageMasterData(), "当前无权限修改车辆资料")) return;
  const existingVehicle = findById("vehicles", $("#vehicleId").value);
  const item = {
    id: $("#vehicleId").value || uid("v"),
    plate: $("#vehiclePlate").value.trim(),
    type: $("#vehicleType").value,
    model: $("#vehicleModel").value.trim(),
    driver: $("#vehicleDriver").value.trim(),
    status: $("#vehicleStatus").value,
    startDate: $("#vehicleStartDate").value,
    note: existingVehicle?.note || "",
    // v4.1 字段
    inspectionExpiry: $("#vehicleInspectionExpiry").value || "",
    inspectionPhotos: [...vehicleAttachmentState.photoFilenames],
    compulsoryInsurance: {
      company: $("#vehicleCompulsoryCompany").value.trim(),
      policyNo: $("#vehicleCompulsoryPolicyNo").value.trim(),
      pdfFile: vehicleAttachmentState.compulsoryPdf || "",
      expiry: $("#vehicleCompulsoryExpiry").value || "",
    },
    commercialInsurance: {
      company: $("#vehicleCommercialCompany").value.trim(),
      policyNo: $("#vehicleCommercialPolicyNo").value.trim(),
      pdfFile: vehicleAttachmentState.commercialPdf || "",
      expiry: $("#vehicleCommercialExpiry").value || "",
    },
    excessInsurance: {
      company: $("#vehicleExcessCompany").value.trim(),
      policyNo: $("#vehicleExcessPolicyNo").value.trim(),
      pdfFile: vehicleAttachmentState.excessPdf || "",
      expiry: $("#vehicleExcessExpiry").value || "",
    },
  };
  if (!item.plate) {
    toast("车牌号不能为空");
    return;
  }
  try {
    // 先上传本次新选的文件
    for (let i = 0; i < 4; i += 1) {
      const fileInput = $(`#vehicleInspectionPhoto${i}`);
      if (fileInput && fileInput.files && fileInput.files[0]) {
        const data = await uploadAttachment(item.id, "photo", fileInput.files[0]);
        item.inspectionPhotos[i] = data.filename;
      }
    }
    const compPdf = $("#vehicleCompulsoryPdf");
    if (compPdf && compPdf.files && compPdf.files[0]) {
      const data = await uploadAttachment(item.id, "pdf", compPdf.files[0]);
      item.compulsoryInsurance.pdfFile = data.filename;
    }
    const comPdf = $("#vehicleCommercialPdf");
    if (comPdf && comPdf.files && comPdf.files[0]) {
      const data = await uploadAttachment(item.id, "pdf", comPdf.files[0]);
      item.commercialInsurance.pdfFile = data.filename;
    }
    const exPdf = $("#vehicleExcessPdf");
    if (exPdf && exPdf.files && exPdf.files[0]) {
      const data = await uploadAttachment(item.id, "pdf", exPdf.files[0]);
      item.excessInsurance.pdfFile = data.filename;
    }
  } catch (error) {
    toast("附件上传失败：" + (error.message || error));
    return;
  }
  upsert("vehicles", item);
  saveAndRefresh("车辆已保存");
  resetForm("vehicleForm");
  setModuleMode("vehicles", "list");
}

async function handleCustomerSubmit(event) {
  event.preventDefault();
  if (!assertPermission(canManageMasterData(), "当前无权限修改客户资料")) return;
  const item = {
    id: $("#customerId").value || uid("c"),
    name: $("#customerName").value.trim(),
    contact: $("#customerContact").value.trim(),
    phone: $("#customerPhone").value.trim(),
    creditLimit: n($("#customerCreditLimit").value),
    contractPdfFile: customerAttachmentState.contractPdf || "",
    priceConfig: customerPriceConfigFromForm(),
    note: $("#customerNote").value.trim(),
  };
  try {
    const contractPdf = $("#customerContractPdf");
    if (contractPdf && contractPdf.files && contractPdf.files[0]) {
      const data = await uploadAttachment(item.id, "pdf", contractPdf.files[0]);
      item.contractPdfFile = data.filename;
    }
  } catch (error) {
    toast("合同上传失败：" + (error.message || error));
    return;
  }
  upsert("customers", item);
  saveAndRefresh("客户已保存");
  resetForm("customerForm");
  setModuleMode("customers", "list");
}

async function handlePaymentSubmit(event) {
  event.preventDefault();
  if (!canSubmitPaymentDraft()) {
    toast("当前角色不能提交收款审核");
    return;
  }
  if (!state.customers.length) {
    toast("请先添加客户");
    return;
  }
  const item = {
    id: $("#paymentId").value || uid("p"),
    date: $("#paymentDate").value,
    customerId: $("#paymentCustomer").value,
    amount: n($("#paymentAmount").value),
    method: $("#paymentMethod").value,
    invoiceNo: $("#paymentInvoiceNo").value.trim(),
    invoicePdfFile: paymentAttachmentState.invoicePdf || "",
    note: $("#paymentNote").value.trim(),
  };
  try {
    const invoicePdf = $("#paymentInvoicePdf");
    if (invoicePdf && invoicePdf.files && invoicePdf.files[0]) {
      const data = await uploadAttachment(item.id, "pdf", invoicePdf.files[0]);
      item.invoicePdfFile = data.filename;
    }
  } catch (error) {
    toast("发票上传失败：" + (error.message || error));
    return;
  }
  try {
    const result = await postJson("/api/payment-drafts", item);
    syncState(result.data);
    currentMonth = item.date.slice(0, 7);
    renderAll();
    resetForm("paymentForm");
    setModuleMode("customers", "list");
    toast("收款已提交审核");
  } catch (error) {
    toastSubmitError(error);
  }
}

async function handleExpenseSubmit(event) {
  event.preventDefault();
  if (!canSubmitExpenseDraft()) {
    toast("当前角色不能提交费用草稿");
    return;
  }
  if (!state.vehicles.length) {
    toast("请先添加车辆");
    return;
  }
  const item = {
    id: $("#expenseId").value || undefined,
    date: $("#expenseDate").value,
    vehicleId: $("#expenseVehicle").value,
    type: $("#expenseType").value,
    itemName: $("#expenseType").value,
    quantity: n($("#expenseQuantity").value),
    unit: $("#expenseUnit").value.trim() || "件",
    unitPrice: n($("#expenseUnitPrice").value),
    amount: n($("#expenseAmount").value),
    liters: n($("#expenseLiters").value),
    odometer: n($("#expenseOdometer").value),
    vendor: $("#expenseVendor").value.trim(),
    note: $("#expenseNote").value.trim(),
  };
  if (!item.type) {
    toast("费用类型不能为空");
    return;
  }
  if (item.amount <= 0) {
    toast("费用金额必须大于 0");
    return;
  }
  try {
    const result = await postJson("/api/expense-drafts", item);
    syncState(result.data);
    currentMonth = item.date.slice(0, 7);
    renderAll();
    resetForm("expenseForm");
    setModuleMode("expenses", "list");
    toast("草稿费用单已提交，等待管理员审核");
  } catch (error) {
    toastSubmitError(error);
  }
}

function handlePersonnelSubmit(event) {
  event.preventDefault();
  if (!assertPermission(canManageMasterData(), "当前无权限修改人员档案")) return;
  const item = {
    id: $("#personnelId").value || uid("p"),
    name: $("#personnelName").value.trim(),
    role: $("#personnelRole").value,
    base: n($("#personnelBase").value),
    note: $("#personnelNote").value.trim(),
  };
  if (!item.name) {
    toast("人员姓名不能为空");
    return;
  }
  upsert("personnel", item);
  saveAndRefresh("人员信息已保存");
  resetForm("personnelForm");
  setModuleMode("salaries", "list");
}

async function handleSalarySubmit(event) {
  event.preventDefault();
  if (!canSubmitSalaryDraft()) {
    toast("当前角色不能提交工资审核");
    return;
  }
  const person = findById("personnel", $("#salaryPerson").value);
  if (!person) {
    toast("请先选择人员");
    return;
  }
  const item = {
    id: $("#salaryId").value || uid("s"),
    month: $("#salaryMonth").value || currentMonth,
    personnelId: person.id,
    name: person.name,
    role: person.role,
    base: n($("#salaryBase").value),
    bonus: n($("#salaryBonus").value),
    deduction: n($("#salaryDeduction").value),
    paid: n($("#salaryPaid").value),
    note: $("#salaryNote").value.trim(),
  };
  try {
    const result = await postJson("/api/salary-drafts", item);
    syncState(result.data);
    currentMonth = item.month;
    renderAll();
    toast("工资已提交审核");
    resetForm("salaryForm");
    setModuleMode("salaries", "salary-list");
  } catch (error) {
    toastSubmitError(error);
  }
}

function handleTableActions(event) {
  const button = event.target.closest("[data-action]");
  if (!button) return;
  const { action, type, id } = button.dataset;
  if (action === "approve-job") approveJobDraft(id);
  if (action === "reject-job") rejectJobDraft(id);
  if (action === "approve-expense") approveExpenseDraft(id);
  if (action === "reject-expense") rejectExpenseDraft(id);
  if (action === "approve-payment") approvePaymentDraft(id);
  if (action === "reject-payment") rejectPaymentDraft(id);
  if (action === "approve-salary") approveSalaryDraft(id);
  if (action === "reject-salary") rejectSalaryDraft(id);
  if (action === "approve-all-jobs") approveAllDrafts("jobs");
  if (action === "approve-all-expenses") approveAllDrafts("expenses");
  if (action === "approve-all-salaries") approveAllDrafts("salaries");
  if (action === "approve-all-payments") approveAllDrafts("payments");
  if (action === "edit-submitted-draft") editSubmittedDraft(type, id);
  if (action === "delete-submitted-draft") deleteSubmittedDraft(type, id);
  if (action === "edit-rejected-draft") editRejectedDraft(type, id);
  if (action === "delete-notification") deleteNotification(type, id);
  if (action === "customer-ledger") showCustomerLedger(id);
  if (action === "edit") editItem(type, id);
  if (action === "delete") deleteItem(type, id);
}

async function approveJobDraft(id) {
  if (!confirm("确认通过这一条每日运输审核，并写入正式运输台账？")) return;
  try {
    const result = await postJson(`/api/job-drafts/${encodeURIComponent(id)}/approve`, {});
    syncState(result.data);
    renderAll();
    toast("审核通过，已写入正式运输台账");
  } catch (error) {
    toast("审核失败：" + (error.message || error));
  }
}

async function approveAllDrafts(kind) {
  const config = {
    jobs: { label: "每日运输审核", collection: "jobDrafts", endpoint: "/api/job-drafts" },
    expenses: { label: "支出费用审核", collection: "expenseDrafts", endpoint: "/api/expense-drafts" },
    salaries: { label: "人员工资审核", collection: "salaryDrafts", endpoint: "/api/salary-drafts" },
    payments: { label: "收款登记审核", collection: "paymentDrafts", endpoint: "/api/payment-drafts" },
  }[kind];
  if (!config || currentUser?.role !== "admin") {
    toast("当前无权限审核");
    return;
  }
  const ids = state[config.collection].filter((draft) => draft.status === "draft").map((draft) => draft.id);
  if (!ids.length) {
    toast(`当前${config.label}没有待审数据`);
    return;
  }
  if (!confirm(`确认通过当前${config.label}中的全部待审数据？共 ${ids.length} 条。`)) return;
  try {
    for (const id of ids) {
      const result = await postJson(`${config.endpoint}/${encodeURIComponent(id)}/approve`, {});
      syncState(result.data);
    }
    renderAll();
    toast(`${config.label}已全部通过`);
  } catch (error) {
    renderAll();
    toast("全部通过失败：" + (error.message || error));
  }
}

async function rejectJobDraft(id) {
  const reason = prompt("请输入驳回原因（可留空）") || "";
  try {
    const result = await postJson(`/api/job-drafts/${encodeURIComponent(id)}/reject`, { reason });
    syncState(result.data);
    renderAll();
    toast("运输草稿已驳回");
  } catch (error) {
    toast("驳回失败：" + (error.message || error));
  }
}

async function approveExpenseDraft(id) {
  if (!confirm("确认通过这一条支出费用审核，并写入正式费用记录？")) return;
  try {
    const result = await postJson(`/api/expense-drafts/${encodeURIComponent(id)}/approve`, {});
    syncState(result.data);
    renderAll();
    toast("审核通过，已写入正式费用记录");
  } catch (error) {
    toast("审核失败：" + (error.message || error));
  }
}

async function rejectExpenseDraft(id) {
  const reason = prompt("请输入驳回原因（可留空）") || "";
  try {
    const result = await postJson(`/api/expense-drafts/${encodeURIComponent(id)}/reject`, { reason });
    syncState(result.data);
    renderAll();
    toast("费用草稿已驳回");
  } catch (error) {
    toast("驳回失败：" + (error.message || error));
  }
}

async function approvePaymentDraft(id) {
  if (!confirm("确认通过这一条收款登记审核，并写入正式回款记录？")) return;
  try {
    const result = await postJson(`/api/payment-drafts/${encodeURIComponent(id)}/approve`, {});
    syncState(result.data);
    renderAll();
    toast("审核通过，已写入正式回款记录");
  } catch (error) {
    toast("审核失败：" + (error.message || error));
  }
}

async function rejectPaymentDraft(id) {
  const reason = prompt("请输入驳回原因（可留空）") || "";
  try {
    const result = await postJson(`/api/payment-drafts/${encodeURIComponent(id)}/reject`, { reason });
    syncState(result.data);
    renderAll();
    toast("收款登记已驳回");
  } catch (error) {
    toast("驳回失败：" + (error.message || error));
  }
}

async function approveSalaryDraft(id) {
  if (!confirm("确认通过这一条人员工资审核，并写入正式工资记录？")) return;
  try {
    const result = await postJson(`/api/salary-drafts/${encodeURIComponent(id)}/approve`, {});
    syncState(result.data);
    renderAll();
    toast("审核通过，已写入正式工资记录");
  } catch (error) {
    toast("审核失败：" + (error.message || error));
  }
}

async function rejectSalaryDraft(id) {
  const reason = prompt("请输入驳回原因（可留空）") || "";
  try {
    const result = await postJson(`/api/salary-drafts/${encodeURIComponent(id)}/reject`, { reason });
    syncState(result.data);
    renderAll();
    toast("工资草稿已驳回");
  } catch (error) {
    toast("驳回失败：" + (error.message || error));
  }
}

function editItem(type, id) {
  if (!canManageMasterData() && type !== "job") {
    const messages = {
      vehicle: "当前无权限修改车辆资料",
      customer: "当前无权限修改客户资料",
      personnel: "当前无权限修改人员档案",
      payment: "当前无权限修改正式收款记录",
      expense: "当前无权限修改正式费用记录",
      salary: "当前无权限修改正式工资记录",
    };
    toast(messages[type] || "当前无权限修改正式记录");
    return;
  }
  const map = {
    job: ["jobs", fillJobForm, "jobs"],
    vehicle: ["vehicles", fillVehicleForm, "vehicles"],
    customer: ["customers", fillCustomerForm, "customers"],
    payment: ["payments", fillPaymentForm, "customers"],
    expense: ["expenses", fillExpenseForm, "expenses"],
    personnel: ["personnel", fillPersonnelForm, "salaries"],
    salary: ["salaries", fillSalaryForm, "salaries"],
  };
  const [collection, fill, tab] = map[type];
  const item = findById(collection, id);
  if (!item) return;
  fill(item);
  switchTab(tab);
  const modeMap = {
    job: ["jobs", "entry"],
    vehicle: ["vehicles", "entry"],
    customer: ["customers", "customer-entry"],
    payment: ["customers", "payment-entry"],
    expense: ["expenses", "entry"],
    personnel: ["salaries", "personnel-entry"],
    salary: ["salaries", "salary-entry"],
  };
  const [module, mode] = modeMap[type] || [];
  if (module) setModuleMode(module, mode);
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function editRejectedDraft(type, id) {
  editSubmittedDraft(type, id);
}

function editSubmittedDraft(type, id) {
  const map = {
    job: ["jobDrafts", fillJobForm, "jobs", "entry"],
    expense: ["expenseDrafts", fillExpenseForm, "expenses", "entry"],
    salary: ["salaryDrafts", fillSalaryForm, "salaries", "salary-entry"],
    payment: ["paymentDrafts", fillPaymentForm, "customers", "payment-entry"],
  };
  const [collection, fill, tab, mode] = map[type] || [];
  const item = collection ? state[collection].find((draft) => draft.id === id && ["draft", "rejected"].includes(draft.status)) : null;
  if (!item || item.createdBy !== currentUser?.id) {
    toast("未找到可编辑的提交草稿");
    return;
  }
  fill(item);
  switchTab(tab);
  setModuleMode(tab === "customers" ? "customers" : tab, mode, true);
  toast("已载入提交草稿，请修改后重新提交");
}

function deleteNotification(type, id) {
  deleteSubmittedDraft(type, id);
}

async function deleteSubmittedDraft(type, id) {
  const map = {
    job: ["jobDrafts", "/api/job-drafts"],
    expense: ["expenseDrafts", "/api/expense-drafts"],
    salary: ["salaryDrafts", "/api/salary-drafts"],
    payment: ["paymentDrafts", "/api/payment-drafts"],
  };
  const [collection, endpoint] = map[type] || [];
  if (!collection) return;
  const item = state[collection].find((draft) => draft.id === id && ["draft", "rejected"].includes(draft.status) && draft.createdBy === currentUser?.id);
  if (!item) {
    toast("未找到可删除的提交草稿");
    return;
  }
  if (!confirm("删除这条提交草稿？")) return;
  try {
    const result = await requestJson(`${endpoint}/${encodeURIComponent(id)}`, { method: "DELETE" });
    syncState(result.data);
    renderAll();
    toast("提交草稿已删除");
  } catch (error) {
    toast("删除失败：" + (error.message || error));
  }
}

function deleteItem(type, id) {
  if (!canManageMasterData()) {
    const messages = {
      vehicle: "当前无权限删除车辆资料",
      customer: "当前无权限删除客户资料",
      personnel: "当前无权限删除人员档案",
      job: "当前无权限删除正式运输记录",
      payment: "当前无权限删除正式收款记录",
      expense: "当前无权限删除正式费用记录",
      salary: "当前无权限删除正式工资记录",
    };
    toast(messages[type] || "当前无权限删除正式记录");
    return;
  }
  if (type === "vehicle" && (state.jobs.some((job) => job.vehicleId === id) || state.expenses.some((expense) => expense.vehicleId === id))) {
    toast("该车辆已有台账或费用记录，请改为停用，避免历史汇总丢失");
    return;
  }
  if (type === "customer" && (state.jobs.some((job) => job.customerId === id) || state.payments.some((payment) => payment.customerId === id))) {
    toast("该客户已有运输或回款记录，请保留客户档案，避免欠账丢失");
    return;
  }
  if (type === "personnel") {
    const person = findById("personnel", id);
    const hasJobs = state.jobs.some((job) => job.driverId === id || (person?.name && job.driver === person.name));
    const hasSalaries = state.salaries.some((salary) => salary.personnelId === id || (person?.name && salary.name === person.name));
    if (hasJobs || hasSalaries) {
      toast("该人员已有运输或工资记录，请保留人员档案");
      return;
    }
  }
  const map = {
    job: ["jobs", "删除这条运输记录？"],
    vehicle: ["vehicles", "删除这辆车？"],
    customer: ["customers", "删除这个客户？"],
    payment: ["payments", "删除这条回款记录？"],
    expense: ["expenses", "删除这条费用记录？"],
    personnel: ["personnel", "删除这条人员记录？"],
    salary: ["salaries", "删除这条工资记录？"],
  };
  const [collection, message] = map[type];
  if (!confirm(message)) return;
  const index = state[collection].findIndex((item) => item.id === id);
  if (index >= 0) state[collection].splice(index, 1);
  saveAndRefresh("已删除");
}

function fillJobForm(item) {
  $("#jobId").value = item.id;
  $("#jobOriginalJobId").value = item.originalJobId || "";
  $("#jobDate").value = item.date;
  $("#jobDocumentNo").value = item.documentNo || "";
  $("#jobVehicle").value = item.vehicleId;
  $("#jobCustomer").value = item.customerId;
  $("#jobDriver").value = item.driverId || findPersonnelByName(item.driver)?.id || "";
  $("#jobWorkType").value = item.workType;
  $("#jobSite").value = item.site || "";
  $("#jobProject").value = item.project || "";
  $("#jobTrips").value = item.trips || 1;
  $("#jobVolume").value = item.volume || 0;
  $("#jobSettlementVolume").value = item.settlementVolume ?? item.volume ?? 0;
  $("#jobMaterialVolume").value = item.materialVolume || 0;
  $("#jobPumpHours").value = item.pumpHours || 0;
  $("#jobOdometer").value = item.odometer || 0; // v4.1
  $("#jobPaymentMethod").value = item.paymentMethod || ""; // v4.1
  $("#jobUnitPrice").value = item.unitPrice || 0;
  $("#jobMaterialUnitPrice").value = item.materialUnitPrice || 0;
  $("#jobOvertimeUnitPrice").value = item.overtimeUnitPrice || 0;
  $("#jobAmount").value = item.amount || 0;
  $("#jobPaid").value = item.paid || 0;
  $("#jobNote").value = item.note || "";
}

function fillVehicleForm(item) {
  $("#vehicleId").value = item.id;
  $("#vehiclePlate").value = item.plate;
  $("#vehicleType").value = item.type;
  $("#vehicleModel").value = item.model || "";
  $("#vehicleDriver").value = item.driver || "";
  $("#vehicleStatus").value = item.status || "正常";
  $("#vehicleStartDate").value = item.startDate || toDateInput(new Date());
  // v4.1
  $("#vehicleInspectionExpiry").value = item.inspectionExpiry || "";
  const photos = Array.isArray(item.inspectionPhotos) ? item.inspectionPhotos : [];
  for (let i = 0; i < 4; i += 1) {
    vehicleAttachmentState.photoFilenames[i] = photos[i] || "";
  }
  renderVehiclePhotoPreview();
  vehicleAttachmentState.compulsoryPdf = item.compulsoryInsurance?.pdfFile || "";
  vehicleAttachmentState.commercialPdf = item.commercialInsurance?.pdfFile || "";
  vehicleAttachmentState.excessPdf = item.excessInsurance?.pdfFile || "";
  $("#vehicleCompulsoryCompany").value = item.compulsoryInsurance?.company || "";
  $("#vehicleCompulsoryPolicyNo").value = item.compulsoryInsurance?.policyNo || "";
  $("#vehicleCompulsoryExpiry").value = item.compulsoryInsurance?.expiry || "";
  $("#vehicleCommercialCompany").value = item.commercialInsurance?.company || "";
  $("#vehicleCommercialPolicyNo").value = item.commercialInsurance?.policyNo || "";
  $("#vehicleCommercialExpiry").value = item.commercialInsurance?.expiry || "";
  $("#vehicleExcessCompany").value = item.excessInsurance?.company || "";
  $("#vehicleExcessPolicyNo").value = item.excessInsurance?.policyNo || "";
  $("#vehicleExcessExpiry").value = item.excessInsurance?.expiry || "";
  renderPdfStatus("compulsory");
  renderPdfStatus("commercial");
  renderPdfStatus("excess");
}

function fillCustomerForm(item) {
  $("#customerId").value = item.id;
  $("#customerName").value = item.name;
  $("#customerContact").value = item.contact || "";
  $("#customerPhone").value = item.phone || "";
  $("#customerCreditLimit").value = item.creditLimit || 0;
  customerAttachmentState.contractPdf = item.contractPdfFile || "";
  $("#customerNote").value = item.note || "";
  fillCustomerPriceConfig(item.priceConfig);
  renderGenericPdfStatus("customerContractPdfStatus", customerAttachmentState.contractPdf);
}

function customerPriceConfigFromForm() {
  return {
    distanceNode1: n($("#customerDistanceNode1").value),
    distanceNode2: n($("#customerDistanceNode2").value),
    distancePrice1: n($("#customerDistancePrice1").value),
    distancePrice2: n($("#customerDistancePrice2").value),
    distanceExtraPrice: n($("#customerDistanceExtraPrice").value),
    defaultMaterialUnitPrice: n($("#customerDefaultMaterialUnitPrice").value),
    defaultOvertimeUnitPrice: n($("#customerDefaultOvertimeUnitPrice").value),
    defaultPumpUnitPrice: n($("#customerDefaultPumpUnitPrice").value),
    pumpOvertimeUnitPrice: n($("#customerPumpOvertimeUnitPrice").value),
    pumpStartVolume: n($("#customerPumpStartVolume").value),
    pumpStartFee: n($("#customerPumpStartFee").value),
  };
}

function fillCustomerPriceConfig(config = {}) {
  const normalized = normalizePriceConfig(config);
  $("#customerDistanceNode1").value = normalized.distanceNode1 || 10;
  $("#customerDistanceNode2").value = normalized.distanceNode2 || 25;
  $("#customerDistancePrice1").value = normalized.distancePrice1 || 22;
  $("#customerDistancePrice2").value = normalized.distancePrice2 || 25;
  $("#customerDistanceExtraPrice").value = normalized.distanceExtraPrice || 1;
  $("#customerDefaultMaterialUnitPrice").value = normalized.defaultMaterialUnitPrice || 0;
  $("#customerDefaultOvertimeUnitPrice").value = normalized.defaultOvertimeUnitPrice || 0;
  $("#customerDefaultPumpUnitPrice").value = normalized.defaultPumpUnitPrice || 0;
  $("#customerPumpOvertimeUnitPrice").value = normalized.pumpOvertimeUnitPrice || 0;
  $("#customerPumpStartVolume").value = normalized.pumpStartVolume || 50;
  $("#customerPumpStartFee").value = normalized.pumpStartFee || 800;
}

function fillPaymentForm(item) {
  $("#paymentId").value = item.id;
  $("#paymentDate").value = item.date;
  $("#paymentCustomer").value = item.customerId;
  $("#paymentAmount").value = item.amount || 0;
  $("#paymentMethod").value = item.method || "现金";
  $("#paymentInvoiceNo").value = item.invoiceNo || "";
  paymentAttachmentState.invoicePdf = item.invoicePdfFile || "";
  $("#paymentNote").value = item.note || "";
  renderGenericPdfStatus("paymentInvoicePdfStatus", paymentAttachmentState.invoicePdf);
}

function fillExpenseForm(item) {
  $("#expenseId").value = item.id;
  $("#expenseDate").value = item.date;
  $("#expenseVehicle").value = item.vehicleId;
  $("#expenseType").value = item.type;
  $("#expenseAmount").value = item.amount || 0;
  $("#expenseQuantity").value = item.quantity || 0;
  $("#expenseUnit").value = item.unit || "件";
  $("#expenseUnitPrice").value = item.unitPrice || 0;
  $("#expenseLiters").value = item.liters || 0;
  $("#expenseOdometer").value = item.odometer || 0;
  $("#expenseVendor").value = item.vendor || "";
  $("#expenseNote").value = item.note || "";
}

function fillPersonnelForm(item) {
  $("#personnelId").value = item.id;
  $("#personnelName").value = item.name;
  $("#personnelRole").value = item.role || "罐车司机";
  $("#personnelBase").value = item.base || 0;
  $("#personnelNote").value = item.note || "";
}

function fillSalaryForm(item) {
  $("#salaryId").value = item.id;
  $("#salaryMonth").value = item.month || currentMonth;
  $("#salaryPerson").value = item.personnelId || findPersonnelByName(item.name)?.id || "";
  $("#salaryBase").value = item.base || 0;
  $("#salaryBonus").value = item.bonus || 0;
  $("#salaryDeduction").value = item.deduction || 0;
  $("#salaryPaid").value = item.paid || 0;
  $("#salaryNote").value = item.note || "";
}

function resetForm(id) {
  const form = $(`#${id}`);
  form.reset();
  form.querySelectorAll('input[type="hidden"]').forEach((input) => {
    input.value = "";
  });
  // v4.1：清掉文件 input + 预览
  form.querySelectorAll('input[type="file"]').forEach((input) => {
    input.value = "";
  });
  form.querySelectorAll('[id$="PdfStatus"]').forEach((span) => {
    span.textContent = "未选择";
  });
  const preview = form.querySelector('#vehicleInspectionPhotoPreview');
  if (preview) preview.innerHTML = "";
  // 重置暂存的照片/PDF 文件名
  if (id === "vehicleForm") resetVehicleAttachmentState();
  if (id === "customerForm") resetCustomerAttachmentState();
  if (id === "paymentForm") resetPaymentAttachmentState();
  setDefaultDates();
  renderSelects();
}

// ===== v4.1：车辆附件支持 =====
// 暂存每张 slot 的已上传文件名（编辑时用于显示）
const vehicleAttachmentState = {
  photoFilenames: ["", "", "", ""],
  compulsoryPdf: "",
  commercialPdf: "",
  excessPdf: "",
};

const customerAttachmentState = {
  contractPdf: "",
};

const paymentAttachmentState = {
  invoicePdf: "",
};

function resetVehicleAttachmentState() {
  vehicleAttachmentState.photoFilenames = ["", "", "", ""];
  vehicleAttachmentState.compulsoryPdf = "";
  vehicleAttachmentState.commercialPdf = "";
  vehicleAttachmentState.excessPdf = "";
}

function resetCustomerAttachmentState() {
  customerAttachmentState.contractPdf = "";
}

function resetPaymentAttachmentState() {
  paymentAttachmentState.invoicePdf = "";
}

// 把 File 读取为 base64
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      // "data:image/png;base64,XXXX" → "XXXX"
      const idx = result.indexOf(",");
      resolve(idx >= 0 ? result.slice(idx + 1) : result);
    };
    reader.onerror = () => reject(reader.error || new Error("read failed"));
    reader.readAsDataURL(file);
  });
}

// 上传单个文件到 /api/upload；成功返回 { filename, url }，失败抛错
async function uploadAttachment(entityId, kind, file) {
  const content_b64 = await fileToBase64(file);
  const res = await fetch("/api/upload", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      entity_id: entityId,
      kind,
      filename: file.name,
      content_b64,
    }),
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { ok: false, error: text }; }
  if (!res.ok || !data.ok) {
    throw new Error(data.error || `upload failed (${res.status})`);
  }
  return data;
}

function attachmentBadge(label, filename) {
  if (!filename) return `<span class="attach-badge muted">${escapeHtml(label)}</span>`;
  return `<a class="attach-badge" href="/api/attachments/${encodeURIComponent(filename)}" target="_blank" rel="noopener">${escapeHtml(label)}</a>`;
}

function invoiceBadges(invoices) {
  if (!invoices.length) return `<span class="attach-badge muted">无发票</span>`;
  return invoices
    .slice(0, 3)
    .map((invoice) => invoice.invoicePdfFile ? attachmentBadge(invoice.invoiceNo || "发票", invoice.invoicePdfFile) : `<span class="attach-badge muted">${escapeHtml(invoice.invoiceNo || "发票")}</span>`)
    .join(" ");
}

function expiryStatusBadge(value) {
  if (!value) return `<span class="cell-muted">-</span>`;
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const days = Math.ceil((new Date(value).getTime() - todayStart.getTime()) / 86400000);
  if (!Number.isFinite(days)) return `<span class="cell-muted">${escapeHtml(value)}</span>`;
  if (days < 0) return `<span class="expiry-warn">${escapeHtml(value)}（已过期 ${Math.abs(days)} 天）</span>`;
  if (days <= 30) return `<span class="expiry-warn">${escapeHtml(value)}（剩 ${days} 天）</span>`;
  return `<span class="expiry-ok">${escapeHtml(value)}</span>`;
}

function renderGenericPdfStatus(spanId, filename) {
  const span = $(`#${spanId}`);
  if (!span) return;
  if (!filename) {
    span.textContent = "未选择";
    return;
  }
  span.innerHTML = `已选: <a href="/api/attachments/${encodeURIComponent(filename)}" target="_blank" rel="noopener" class="attach-badge">${escapeHtml(filename.split("__").slice(-1)[0])}</a>`;
}

// 渲染 4 个照片缩略图（用已上传的 filename）
function renderVehiclePhotoPreview() {
  const box = $("#vehicleInspectionPhotoPreview");
  if (!box) return;
  const files = vehicleAttachmentState.photoFilenames;
  box.innerHTML = files
    .map((name, i) => {
      if (name) {
        return `<a href="/api/attachments/${encodeURIComponent(name)}" target="_blank" rel="noopener">
          <img src="/api/attachments/${encodeURIComponent(name)}" alt="年审照片${i + 1}" loading="lazy" />
        </a>`;
      }
      return `<div class="empty">空 ${i + 1}</div>`;
    })
    .join("");
}

// 渲染 PDF 状态行
function renderPdfStatus(kind) {
  const name = vehicleAttachmentState[kind + "Pdf"];
  const spanId = `#vehicle${kind.charAt(0).toUpperCase() + kind.slice(1)}PdfStatus`;
  const span = $(spanId);
  if (!span) return;
  if (name) {
    span.innerHTML = `已选: <a href="/api/attachments/${encodeURIComponent(name)}" target="_blank" rel="noopener" class="attach-badge">${escapeHtml(name.split("__").slice(-1)[0])}</a>`;
  } else {
    span.textContent = "未选择";
  }
}

function upsert(collection, item) {
  const index = state[collection].findIndex((existing) => existing.id === item.id);
  if (index >= 0) {
    state[collection][index] = item;
  } else {
    state[collection].push(item);
  }
}

async function saveAndRefresh(message) {
  try {
    await saveState();
    toast(message);
  } catch (error) {
    const text = error.message || String(error);
    if (text.startsWith("当前无权限") || text.startsWith("登录已过期")) {
      toast(text);
      return;
    }
    apiAvailable = false;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    toast(`${message}，但本地文件同步失败，已暂存到浏览器`);
  } finally {
    renderAll();
  }
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    method: options.method || "GET",
    headers: { "content-type": "application/json" },
    ...options,
  });
  const data = await response.json().catch(() => ({}));
  if (response.status === 401) {
    location.href = "/login.html";
    throw new Error("登录已过期，请重新登录");
  }
  if (!response.ok || data.ok === false) {
    throw new Error(data.error || `请求失败 ${response.status}`);
  }
  return data;
}

async function postJson(url, payload) {
  return requestJson(url, {
    method: "POST",
    body: JSON.stringify(payload || {}),
  });
}

function toastSubmitError(error) {
  const message = error.message || String(error);
  toast(message.includes("无变动") ? "无变动" : `提交失败：${message}`);
}

function syncState(data) {
  const fresh = normalizeData(data);
  state.vehicles = fresh.vehicles;
  state.customers = fresh.customers;
  state.personnel = fresh.personnel;
  state.jobs = fresh.jobs;
  state.jobDrafts = fresh.jobDrafts;
  state.expenseDrafts = fresh.expenseDrafts;
  state.expenses = fresh.expenses;
  state.salaryDrafts = fresh.salaryDrafts;
  state.salaries = fresh.salaries;
  state.paymentDrafts = fresh.paymentDrafts;
  state.payments = fresh.payments;
  state.stockInDrafts = fresh.stockInDrafts;
  state.stockIns = fresh.stockIns;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function findById(collection, id) {
  return state[collection].find((item) => item.id === id);
}

function byMonth(items, key) {
  return items.filter((item) => String(item[key] || "").startsWith(currentMonth));
}

function sum(items, key) {
  return items.reduce((total, item) => total + n(item[key]), 0);
}

function groupSum(items, groupKey, valueKey) {
  return items.reduce((groups, item) => {
    const key = item[groupKey] || "未分类";
    groups[key] = (groups[key] || 0) + n(item[valueKey]);
    return groups;
  }, {});
}

function salaryTotalDue(salary) {
  return n(salary.base) + n(salary.bonus) - n(salary.deduction);
}

function calculateJobAmount() {
  const customer = findById("customers", $("#jobCustomer").value);
  const priceConfig = normalizePriceConfig(customer?.priceConfig);
  const workType = $("#jobWorkType").value;
  const actualVolume = n($("#jobVolume").value);
  const settlementVolume = n($("#jobSettlementVolume").value);
  const unitPrice = n($("#jobUnitPrice").value);
  const materialVolume = n($("#jobMaterialVolume").value);
  const materialUnitPrice = n($("#jobMaterialUnitPrice").value);
  const overtimeHours = n($("#jobPumpHours").value);
  const overtimeUnitPrice = n($("#jobOvertimeUnitPrice").value);
  const overtimeAmount = overtimeHours * overtimeUnitPrice;
  const materialAmount = materialVolume * materialUnitPrice;
  const usesStartFee = workType === "泵送服务" && priceConfig.pumpStartVolume > 0 && priceConfig.pumpStartFee > 0;
  const belowStartVolume =
    usesStartFee &&
    ((settlementVolume > 0 && settlementVolume < priceConfig.pumpStartVolume) ||
      (actualVolume > 0 && actualVolume < priceConfig.pumpStartVolume));
  const baseAmount = belowStartVolume ? priceConfig.pumpStartFee : settlementVolume * unitPrice;
  if (workType === "泵送服务") return baseAmount + overtimeAmount;
  return baseAmount + materialAmount + overtimeAmount;
}

function applyCustomerPricing() {
  const customer = findById("customers", $("#jobCustomer").value);
  if (!customer) return;
  const priceConfig = normalizePriceConfig(customer.priceConfig);
  if ($("#jobWorkType").value === "泵送服务") {
    if (priceConfig.defaultPumpUnitPrice > 0) $("#jobUnitPrice").value = priceConfig.defaultPumpUnitPrice.toFixed(2);
    $("#jobMaterialUnitPrice").value = 0;
    if (priceConfig.pumpOvertimeUnitPrice > 0) $("#jobOvertimeUnitPrice").value = priceConfig.pumpOvertimeUnitPrice;
  } else {
    const distancePrice = calculateDistanceUnitPrice(priceConfig, $("#jobOdometer").value);
    if (distancePrice > 0) $("#jobUnitPrice").value = distancePrice.toFixed(2);
    if (priceConfig.defaultMaterialUnitPrice > 0) $("#jobMaterialUnitPrice").value = priceConfig.defaultMaterialUnitPrice;
    if (priceConfig.defaultOvertimeUnitPrice > 0) $("#jobOvertimeUnitPrice").value = priceConfig.defaultOvertimeUnitPrice;
  }
  const hasQuantityInput =
    n($("#jobVolume").value) > 0 ||
    n($("#jobSettlementVolume").value) > 0 ||
    n($("#jobMaterialVolume").value) > 0 ||
    n($("#jobPumpHours").value) > 0;
  if (hasQuantityInput) $("#jobAmount").value = calculateJobAmount().toFixed(2);
}

function sortPersonnelByName(items) {
  return [...items].sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "zh-CN"));
}

function findPersonnelByName(name) {
  const cleanName = String(name || "").trim();
  return cleanName ? state.personnel.find((person) => person.name === cleanName) : undefined;
}

function jobBelongsToPerson(job, person) {
  return Boolean(person?.id && job.driverId === person.id) || Boolean(person?.name && job.driver === person.name);
}

function personnelTripStats(person) {
  const allJobs = state.jobs.filter((job) => jobBelongsToPerson(job, person));
  const monthJobs = allJobs.filter((job) => String(job.date || "").startsWith(currentMonth));
  return {
    totalTrips: sum(allJobs, "trips"),
    monthTrips: sum(monthJobs, "trips"),
  };
}

function fillSalaryDefaultsFromPerson() {
  const person = findById("personnel", $("#salaryPerson").value);
  if (!person) return;
  $("#salaryBase").value = person.base || 0;
}

function includesSearch(values, search) {
  if (!search) return true;
  return values.some((value) => String(value || "").toLowerCase().includes(search));
}

function getCustomerBalances() {
  return state.customers.map((customer) => {
    const jobs = state.jobs.filter((job) => job.customerId === customer.id);
    const payments = state.payments.filter((payment) => payment.customerId === customer.id);
    const revenue = sum(jobs, "amount");
    const paid = sum(jobs, "paid") + sum(payments, "amount");
    const lastDate = jobs.map((job) => job.date).sort().at(-1) || "";
    return {
      customer,
      revenue,
      paid,
      balance: revenue - paid,
      lastDate,
    };
  });
}

function exportCustomerLedger() {
  const customer = findById("customers", selectedCustomerLedgerId);
  if (!customer) {
    toast("请先选择客户");
    return;
  }
  const rows = [
    ["类型", "日期", "车辆/客户", "说明", "应收", "已收", "欠款"],
    ...getCustomerLedgerRows(customer.id).map((row) => [row.type, row.date, row.party, row.desc, row.receivable, row.paid, row.balance]),
  ];
  const table = rows
    .map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`)
    .join("");
  const html = `\uFEFF<html><head><meta charset="utf-8"></head><body><table>${table}</table></body></html>`;
  downloadText(`${customer.name}-财务台账.xls`, html, "application/vnd.ms-excel;charset=utf-8");
  toast("客户财务台账已导出");
}

function balanceCell(item) {
  if (item.balance < 0) {
    return `<span class="money-positive">预收款 ${money(Math.abs(item.balance))}</span>`;
  }
  return `<span class="${item.balance > 0 ? "money-negative" : "money-positive"}">${money(item.balance)}</span>`;
}

function getReceivableTotal() {
  return getCustomerBalances().reduce((total, item) => total + Math.max(0, item.balance), 0);
}

function exportJson() {
  if (!assertPermission(canReplaceSystemData(), "当前无权限导出全部系统数据")) return;
  const payload = {
    exportedAt: new Date().toISOString(),
    app: "车辆运输管理系统",
    version: 1,
    data: state,
  };
  downloadText(`车辆运输管理系统-备份-${toDateInput(new Date())}.json`, JSON.stringify(payload, null, 2), "application/json");
  toast("备份已导出");
}

function importJson(event) {
  if (!assertPermission(canReplaceSystemData(), "当前无权限导入备份")) {
    event.target.value = "";
    return;
  }
  const file = event.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(reader.result);
      const data = parsed.data || parsed;
      if (!Array.isArray(data.vehicles) || !Array.isArray(data.customers)) {
        throw new Error("invalid data");
      }
      if (!confirm("导入会覆盖当前浏览器中的数据，确定继续？")) return;
      const fresh = normalizeData(data);
      state.vehicles = fresh.vehicles;
      state.customers = fresh.customers;
      state.personnel = fresh.personnel;
      state.jobs = fresh.jobs;
      state.jobDrafts = fresh.jobDrafts;
      state.expenseDrafts = fresh.expenseDrafts;
      state.expenses = fresh.expenses;
      state.salaryDrafts = fresh.salaryDrafts;
      state.salaries = fresh.salaries;
      state.paymentDrafts = fresh.paymentDrafts;
      state.payments = fresh.payments;
      state.stockInDrafts = fresh.stockInDrafts;
      state.stockIns = fresh.stockIns;
      saveAndRefresh("备份已导入");
    } catch {
      toast("导入失败：文件格式不正确");
    } finally {
      event.target.value = "";
    }
  };
  reader.readAsText(file);
}

function exportMonthlyCsv() {
  const rows = [
    ["类型", "日期/月", "车辆/客户/人员", "说明", "应收/应发", "已收/已发", "费用", "欠款/未发"],
    ...byMonth(state.jobs, "date").map((job) => {
      const vehicle = findById("vehicles", job.vehicleId);
      const customer = findById("customers", job.customerId);
      return [
        "运输",
        job.date,
        `${vehicle?.plate || ""} / ${customer?.name || ""}`,
        `${job.site || ""} ${job.project || ""}`,
        job.amount,
        job.paid,
        "",
        n(job.amount) - n(job.paid),
      ];
    }),
    ...byMonth(state.expenses, "date").map((expense) => {
      const vehicle = findById("vehicles", expense.vehicleId);
      return ["费用", expense.date, vehicle?.plate || "", `${expense.type} ${expense.vendor || ""}`, "", "", expense.amount, ""];
    }),
    ...state.salaries
      .filter((salary) => salary.month === currentMonth)
      .map((salary) => {
        const total = salaryTotalDue(salary);
        return ["人员工资", salary.month, salary.name, salary.role, total, salary.paid, "", total - n(salary.paid)];
      }),
    ...byMonth(state.payments, "date").map((payment) => {
      const customer = findById("customers", payment.customerId);
      return ["回款", payment.date, customer?.name || "", payment.method, "", payment.amount, "", ""];
    }),
  ];
  const csv = rows.map((row) => row.map(csvCell).join(",")).join("\n");
  downloadText(`车辆运输管理系统-${currentMonth}-月报.csv`, `\uFEFF${csv}`, "text/csv;charset=utf-8");
  toast("本月 CSV 已导出");
}

function csvCell(value) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

function downloadText(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function copySummary() {
  try {
    await navigator.clipboard.writeText($("#monthlySummary").value);
    toast("月报摘要已复制");
  } catch {
    $("#monthlySummary").select();
    toast("已选中摘要，可手动复制");
  }
}

function resetDemoData() {
  if (!assertPermission(canReplaceSystemData(), "当前无权限恢复演示数据")) return;
  if (!confirm("恢复演示数据会覆盖当前浏览器中的数据，确定继续？")) return;
  const fresh = seedState();
  state.vehicles = fresh.vehicles;
  state.customers = fresh.customers;
  state.personnel = fresh.personnel;
  state.jobs = fresh.jobs;
  state.jobDrafts = fresh.jobDrafts;
  state.expenseDrafts = fresh.expenseDrafts;
  state.expenses = fresh.expenses;
  state.salaryDrafts = fresh.salaryDrafts;
  state.salaries = fresh.salaries;
  state.paymentDrafts = fresh.paymentDrafts;
  state.payments = fresh.payments;
  state.stockInDrafts = fresh.stockInDrafts;
  state.stockIns = fresh.stockIns;
  saveAndRefresh("已恢复演示数据");
}

let toastTimer;
function toast(message) {
  const el = $("#toast");
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 2200);
}
