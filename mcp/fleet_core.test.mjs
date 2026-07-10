// v4.1 车辆运输系统 单测（node:test）
// 用法：node --test mcp/fleet_core.test.mjs
// 覆盖 upsertVehicle / recordTransportJob 的新字段 + 兼容性

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 每个 case 隔离的临时数据文件
function withTempData(fn) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "vts-test-"));
  const dataPath = path.join(tmp, "fleet-data.json");
  process.env.FLEET_DATA_PATH = dataPath;
  return import("./fleet_core.mjs?v=" + Date.now())
    .then((mod) => fn(mod, tmp))
    .finally(() => {
      delete process.env.FLEET_DATA_PATH;
      try {
        fs.rmSync(tmp, { recursive: true, force: true });
      } catch {}
    });
}

test("upsertVehicle 基础字段不丢", async () => {
  await withTempData(async ({ upsertVehicle, loadData }) => {
    const v = upsertVehicle({ plate: "皖A12345", type: "泵车", driver: "李师傅" });
    assert.equal(v.plate, "皖A12345");
    assert.equal(v.type, "泵车");
    assert.equal(v.driver, "李师傅");
    assert.equal(v.status, "正常");
    // v4.1 新字段应该有默认值（空字符串 / 空对象）
    assert.equal(v.inspectionExpiry, "");
    assert.deepEqual(v.inspectionPhotos, []);
    assert.deepEqual(v.compulsoryInsurance, { company: "", policyNo: "", pdfFile: "", expiry: "" });
    assert.deepEqual(v.commercialInsurance, { company: "", policyNo: "", pdfFile: "", expiry: "" });
    assert.deepEqual(v.excessInsurance, { company: "", policyNo: "", pdfFile: "", expiry: "" });
    // 写盘成功
    const data = loadData();
    assert.equal(data.vehicles.length, 1);
  });
});

test("upsertVehicle 完整 v4.1 字段写入并回读", async () => {
  await withTempData(async ({ upsertVehicle, loadData }) => {
    const v = upsertVehicle({
      id: "v_test1",
      plate: "皖B99999",
      type: "混凝土罐车",
      driver: "张师傅",
      inspection_expiry: "2026-12-31",
      inspection_photos: ["p1.jpg", "p2.jpg", "p3.jpg", "p4.jpg"],
      compulsory_company: "人保",
      compulsory_policy_no: "PDAA20251111",
      compulsory_pdf: "v_test1__pdf__t__r.pdf",
      compulsory_expiry: "2026-11-30",
      commercial_company: "平安",
      commercial_policy_no: "PA20251212",
      commercial_pdf: "v_test1__pdf__t__r2.pdf",
      commercial_expiry: "2026-12-15",
      excess_company: "太保",
      excess_policy_no: "CPIC20251313",
      excess_pdf: "v_test1__pdf__t__r3.pdf",
      excess_expiry: "2027-01-15",
    });
    assert.equal(v.inspectionExpiry, "2026-12-31");
    assert.equal(v.inspectionPhotos.length, 4);
    assert.equal(v.compulsoryInsurance.company, "人保");
    assert.equal(v.compulsoryInsurance.policyNo, "PDAA20251111");
    assert.equal(v.compulsoryInsurance.pdfFile, "v_test1__pdf__t__r.pdf");
    assert.equal(v.compulsoryInsurance.expiry, "2026-11-30");
    assert.equal(v.commercialInsurance.company, "平安");
    assert.equal(v.commercialInsurance.expiry, "2026-12-15");
    assert.equal(v.excessInsurance.company, "太保");
    assert.equal(v.excessInsurance.expiry, "2027-01-15");
    // 重新读盘也能拿到
    const data = loadData();
    const saved = data.vehicles.find((x) => x.id === "v_test1");
    assert.equal(saved.compulsoryInsurance.company, "人保");
    assert.equal(saved.compulsoryInsurance.expiry, "2026-11-30");
    assert.equal(saved.excessInsurance.pdfFile, "v_test1__pdf__t__r3.pdf");
  });
});

test("upsertVehicle 拒绝空车牌", async () => {
  await withTempData(async ({ upsertVehicle }) => {
    assert.throws(() => upsertVehicle({ plate: "" }), /plate/);
  });
});

test("upsertVehicle 截断超 4 张的照片数组", async () => {
  await withTempData(async ({ upsertVehicle }) => {
    const v = upsertVehicle({
      plate: "皖C00001",
      inspection_photos: ["a", "b", "c", "d", "e", "f"],
    });
    assert.equal(v.inspectionPhotos.length, 4);
    assert.deepEqual(v.inspectionPhotos, ["a", "b", "c", "d"]);
  });
});

test("upsertVehicle 兼容老数据：嵌套对象也接受", async () => {
  await withTempData(async ({ upsertVehicle }) => {
    const v = upsertVehicle({
      plate: "皖D00002",
      compulsoryInsurance: { company: "人保", policyNo: "X1", pdfFile: "f.pdf" },
    });
    assert.equal(v.compulsoryInsurance.company, "人保");
    assert.equal(v.compulsoryInsurance.policyNo, "X1");
    assert.equal(v.compulsoryInsurance.pdfFile, "f.pdf");
  });
});

test("upsertCustomer 保存单价管理配置", async () => {
  await withTempData(async ({ upsertCustomer, loadData }) => {
    const customer = upsertCustomer({
      id: "c_price",
      name: "价格客户",
      price_config: {
        distanceNode1: 10,
        distanceNode2: 25,
        distancePrice1: 22,
        distancePrice2: 25,
        distanceExtraPrice: 1,
        defaultMaterialUnitPrice: 120,
        defaultOvertimeUnitPrice: 80,
        defaultPumpUnitPrice: 35,
        pumpOvertimeUnitPrice: 90,
        pumpStartVolume: 50,
        pumpStartFee: 800,
      },
    });
    assert.equal(customer.priceConfig.distanceNode1, 10);
    assert.equal(customer.priceConfig.defaultOvertimeUnitPrice, 80);
    assert.equal(customer.priceConfig.defaultPumpUnitPrice, 35);
    assert.equal(customer.priceConfig.pumpOvertimeUnitPrice, 90);
    const saved = loadData().customers[0];
    assert.equal(saved.priceConfig.distancePrice2, 25);
    assert.equal(saved.priceConfig.pumpStartFee, 800);
    assert.equal(saved.priceConfig.defaultPumpUnitPrice, 35);
    assert.equal(saved.priceConfig.pumpOvertimeUnitPrice, 90);
  });
});

test("recordTransportJob 接受 odometer + paymentMethod", async () => {
  await withTempData(async ({ upsertVehicle, upsertCustomer, recordTransportJob, loadData }) => {
    upsertVehicle({ id: "v1", plate: "皖E00003" });
    upsertCustomer({ id: "c1", name: "城北搅拌站" });
    const job = recordTransportJob({
      vehicle_id: "v1",
      customer_id: "c1",
      date: "2026-06-10",
      trips: 3,
      volume: 30,
      unit_price: 50,
      odometer: 12345,
      payment_method: "合同",
    });
    assert.equal(job.odometer, 12345);
    assert.equal(job.paymentMethod, "合同");
    assert.equal(job.amount, 1500); // 30 * 50
    const data = loadData();
    assert.equal(data.jobs[0].odometer, 12345);
    assert.equal(data.jobs[0].paymentMethod, "合同");
  });
});

test("recordTransportJob 按客户公里阶梯自动带出运输单价", async () => {
  await withTempData(async ({ upsertVehicle, upsertCustomer, recordTransportJob }) => {
    upsertVehicle({ id: "v1", plate: "皖E00033" });
    upsertCustomer({
      id: "c1",
      name: "阶梯客户",
      priceConfig: {
        distanceNode1: 10,
        distanceNode2: 25,
        distancePrice1: 22,
        distancePrice2: 25,
        distanceExtraPrice: 1,
        defaultMaterialUnitPrice: 120,
        defaultOvertimeUnitPrice: 80,
        pumpOvertimeUnitPrice: 80,
        pumpStartVolume: 50,
        pumpStartFee: 800,
      },
    });
    const job = recordTransportJob({
      vehicle_id: "v1",
      customer_id: "c1",
      work_type: "混凝土运输",
      volume: 60,
      settlement_volume: 60,
      odometer: 30,
      material_volume: 0,
      pump_hours: 2,
    });
    assert.equal(job.unitPrice, 30); // 25 + (30 - 25) * 1
    assert.equal(job.materialUnitPrice, 120);
    assert.equal(job.overtimeUnitPrice, 80);
    assert.equal(job.amount, 1960); // (60 * 30) + (2 * 80)
  });
});

test("recordTransportJob 混凝土运输不足起方量不使用出车费", async () => {
  await withTempData(async ({ upsertVehicle, upsertCustomer, recordTransportJob }) => {
    upsertVehicle({ id: "v1", plate: "皖E00035" });
    upsertCustomer({
      id: "c1",
      name: "混凝土客户",
      priceConfig: {
        distanceNode1: 10,
        distanceNode2: 25,
        distancePrice1: 22,
        distancePrice2: 25,
        distanceExtraPrice: 1,
        defaultMaterialUnitPrice: 120,
        defaultOvertimeUnitPrice: 80,
        pumpOvertimeUnitPrice: 80,
        pumpStartVolume: 50,
        pumpStartFee: 800,
      },
    });
    const job = recordTransportJob({
      vehicle_id: "v1",
      customer_id: "c1",
      work_type: "混凝土运输",
      volume: 30,
      settlement_volume: 30,
      unit_price: 30,
      material_volume: 8,
      pump_hours: 2,
    });
    assert.equal(job.amount, 2020); // (30 * 30) + (8 * 120) + (2 * 80)
  });
});

test("recordTransportJob 泵送服务不足起方量按出车费加超时计算", async () => {
  await withTempData(async ({ upsertVehicle, upsertCustomer, recordTransportJob }) => {
    upsertVehicle({ id: "v1", plate: "皖E00034" });
    upsertCustomer({
      id: "c1",
      name: "泵送客户",
      priceConfig: {
        distanceNode1: 10,
        distanceNode2: 25,
        distancePrice1: 22,
        distancePrice2: 25,
        distanceExtraPrice: 1,
        defaultMaterialUnitPrice: 120,
        defaultOvertimeUnitPrice: 80,
        pumpOvertimeUnitPrice: 80,
        pumpStartVolume: 50,
        pumpStartFee: 800,
      },
    });
    const job = recordTransportJob({
      vehicle_id: "v1",
      customer_id: "c1",
      work_type: "泵送服务",
      volume: 45,
      settlement_volume: 48,
      unit_price: 30,
      material_volume: 8,
      material_unit_price: 120,
      pump_hours: 2,
    });
    assert.equal(job.amount, 960); // 出车费 800 + 超时 2 * 80，不叠加带料
  });
});

test("recordTransportJob 泵送服务自动使用默认泵送单价和泵送超时单价", async () => {
  await withTempData(async ({ upsertVehicle, upsertCustomer, recordTransportJob }) => {
    upsertVehicle({ id: "v1", plate: "皖E00036" });
    upsertCustomer({
      id: "c1",
      name: "泵送单价客户",
      priceConfig: {
        distanceNode1: 10,
        distanceNode2: 25,
        distancePrice1: 22,
        distancePrice2: 25,
        distanceExtraPrice: 1,
        defaultMaterialUnitPrice: 120,
        defaultOvertimeUnitPrice: 80,
        defaultPumpUnitPrice: 35,
        pumpOvertimeUnitPrice: 90,
        pumpStartVolume: 50,
        pumpStartFee: 800,
      },
    });
    const job = recordTransportJob({
      vehicle_id: "v1",
      customer_id: "c1",
      work_type: "泵送服务",
      volume: 60,
      settlement_volume: 60,
      material_volume: 8,
      pump_hours: 2,
    });
    assert.equal(job.unitPrice, 35);
    assert.equal(job.overtimeUnitPrice, 90);
    assert.equal(job.materialUnitPrice, 0);
    assert.equal(job.amount, 2280); // (60 * 35) + (2 * 90)，不叠加带料
  });
});

test("recordTransportJob 按方量和带料金额计算应收", async () => {
  await withTempData(async ({ upsertVehicle, upsertCustomer, recordTransportJob, loadData }) => {
    upsertVehicle({ id: "v1", plate: "皖E00013" });
    upsertCustomer({ id: "c1", name: "城南施工单位" });
    const job = recordTransportJob({
      vehicle_id: "v1",
      customer_id: "c1",
      date: "2026-07-08",
      volume: 30,
      unit_price: 50,
      material_volume: 8,
      material_unit_price: 120,
    });
    assert.equal(job.amount, 2460); // (30 * 50) + (8 * 120)
    assert.equal(job.materialVolume, 8);
    assert.equal(job.materialUnitPrice, 120);
    const data = loadData();
    assert.equal(data.jobs[0].amount, 2460);
    assert.equal(data.jobs[0].materialVolume, 8);
    assert.equal(data.jobs[0].materialUnitPrice, 120);
  });
});

test("recordTransportJob 按结算方量、带料和超时计算应收", async () => {
  await withTempData(async ({ upsertVehicle, upsertCustomer, recordTransportJob, loadData }) => {
    upsertVehicle({ id: "v1", plate: "皖E00023" });
    upsertCustomer({ id: "c1", name: "结算施工单位" });
    const job = recordTransportJob({
      vehicle_id: "v1",
      customer_id: "c1",
      date: "2026-07-08",
      volume: 31.5,
      settlement_volume: 30,
      unit_price: 50,
      material_volume: 8,
      material_unit_price: 120,
      pump_hours: 2.5,
      overtime_unit_price: 80,
    });
    assert.equal(job.amount, 2660); // (30 * 50) + (8 * 120) + (2.5 * 80)
    assert.equal(job.volume, 31.5);
    assert.equal(job.settlementVolume, 30);
    assert.equal(job.overtimeUnitPrice, 80);
    const data = loadData();
    assert.equal(data.jobs[0].amount, 2660);
    assert.equal(data.jobs[0].settlementVolume, 30);
    assert.equal(data.jobs[0].overtimeUnitPrice, 80);
  });
});

test("recordTransportJob 拒绝非法付款方式", async () => {
  await withTempData(async ({ upsertVehicle, upsertCustomer, recordTransportJob }) => {
    upsertVehicle({ id: "v1", plate: "皖F00004" });
    upsertCustomer({ id: "c1", name: "客户A" });
    const job = recordTransportJob({
      vehicle_id: "v1",
      customer_id: "c1",
      trips: 1,
      unit_price: 10,
      payment_method: "支票", // 非法
    });
    // 非法值应被规范成空字符串
    assert.equal(job.paymentMethod, "");
  });
});

test("recordTransportJob odometer 默认 0，paymentMethod 默认 ''", async () => {
  await withTempData(async ({ upsertVehicle, upsertCustomer, recordTransportJob }) => {
    upsertVehicle({ id: "v1", plate: "皖G00005" });
    upsertCustomer({ id: "c1", name: "客户B" });
    const job = recordTransportJob({
      vehicle_id: "v1",
      customer_id: "c1",
      trips: 1,
      unit_price: 10,
    });
    assert.equal(job.odometer, 0);
    assert.equal(job.paymentMethod, "");
  });
});

test("normalizeData 旧数据缺 v4.1 字段也能正常 load", async () => {
  await withTempData(async ({ upsertVehicle, loadData }) => {
    // 写入一个 v4.1 字段全部缺失的"老"车辆
    const v = upsertVehicle({ plate: "皖H00006", type: "泵车" });
    const data = loadData();
    const saved = data.vehicles.find((x) => x.id === v.id);
    assert.ok(saved, "车辆应该被保存");
    assert.equal(saved.inspectionExpiry, "");
    assert.deepEqual(saved.inspectionPhotos, []);
    assert.ok(saved.compulsoryInsurance, "compulsoryInsurance 应有默认对象");
    assert.equal(saved.compulsoryInsurance.company, "");
  });
});

test("normalizeData 保留人员集合", async () => {
  await withTempData(async ({ saveData, loadData }) => {
    saveData({
      personnel: [
        { id: "p_001", name: "张师傅", role: "罐车司机", base: 6500, note: "主力司机" },
      ],
    });
    const data = loadData();
    assert.equal(data.personnel.length, 1);
    assert.equal(data.personnel[0].name, "张师傅");
    assert.deepEqual(data.salaries, []);
  });
});

test("运输草稿审核通过后保留结算、带料和超时字段", async () => {
  await withTempData(async ({ upsertVehicle, upsertCustomer, createTransportJobDraft, approveTransportJobDraft, loadData }) => {
    upsertVehicle({ id: "v1", plate: "皖J00014" });
    upsertCustomer({ id: "c1", name: "带料客户" });
    const draft = createTransportJobDraft(
      {
        vehicle_id: "v1",
        customer_id: "c1",
        date: "2026-07-08",
        document_no: "DJ-20260708-001",
        volume: 20,
        settlement_volume: 18,
        unit_price: 40,
        material_volume: 5,
        material_unit_price: 100,
        pump_hours: 2,
        overtime_unit_price: 60,
      },
      { id: "u1", name: "调度员" },
    );
    assert.equal(draft.documentNo, "DJ-20260708-001");
    assert.equal(draft.amount, 1340);
    const result = approveTransportJobDraft(draft.id, { id: "admin", name: "管理员" });
    assert.equal(result.job.documentNo, "DJ-20260708-001");
    assert.equal(result.job.amount, 1340);
    assert.equal(result.job.settlementVolume, 18);
    assert.equal(result.job.materialVolume, 5);
    assert.equal(result.job.materialUnitPrice, 100);
    assert.equal(result.job.overtimeUnitPrice, 60);
    const data = loadData();
    assert.equal(data.jobs[0].documentNo, "DJ-20260708-001");
    assert.equal(data.jobs[0].settlementVolume, 18);
    assert.equal(data.jobs[0].materialVolume, 5);
    assert.equal(data.jobs[0].materialUnitPrice, 100);
    assert.equal(data.jobs[0].overtimeUnitPrice, 60);
  });
});

test("运输修改草稿审核通过后覆盖原记录而不是新增记录", async () => {
  await withTempData(async ({ upsertVehicle, upsertCustomer, recordTransportJob, createTransportJobDraft, approveTransportJobDraft, loadData }) => {
    upsertVehicle({ id: "v_edit", plate: "皖J00015" });
    upsertCustomer({ id: "c_edit", name: "修改客户" });
    const original = recordTransportJob({
      vehicle_id: "v_edit",
      customer_id: "c_edit",
      date: "2026-07-08",
      volume: 20,
      settlement_volume: 20,
      unit_price: 30,
      amount: 600,
    });
    const draft = createTransportJobDraft(
      {
        originalJobId: original.id,
        vehicle_id: "v_edit",
        customer_id: "c_edit",
        date: "2026-07-09",
        volume: 25,
        settlement_volume: 24,
        unit_price: 35,
        amount: 840,
      },
      { id: "dispatcher_1", name: "调度员" },
    );
    assert.equal(draft.originalJobId, original.id);
    const result = approveTransportJobDraft(draft.id, { id: "admin", name: "管理员" });
    assert.equal(result.job.id, original.id);
    assert.equal(result.job.date, "2026-07-09");
    assert.equal(result.job.settlementVolume, 24);
    assert.equal(result.job.amount, 840);
    const data = loadData();
    assert.equal(data.jobs.length, 1);
    assert.equal(data.jobs[0].id, original.id);
  });
});

test("运输草稿兼容历史 document_no 字段并在审核后保留单据编号", async () => {
  await withTempData(async ({ upsertVehicle, upsertCustomer, saveData, approveTransportJobDraft, loadData }) => {
    upsertVehicle({ id: "v_doc_alias", plate: "皖D12345" });
    upsertCustomer({ id: "c_doc_alias", name: "单据客户" });
    const data = loadData();
    data.jobDrafts.push({
      id: "jd_doc_alias",
      date: "2026-07-09",
      document_no: "YS-20260709-009",
      vehicleId: "v_doc_alias",
      customerId: "c_doc_alias",
      driver: "张师傅",
      workType: "混凝土运输",
      site: "城南建设",
      project: "一期",
      trips: 1,
      volume: 12,
      settlementVolume: 12,
      unitPrice: 50,
      amount: 600,
      status: "draft",
    });
    saveData(data);
    const result = approveTransportJobDraft("jd_doc_alias", { id: "admin", name: "管理员" });
    assert.equal(result.job.documentNo, "YS-20260709-009");
    assert.equal(loadData().jobs[0].documentNo, "YS-20260709-009");
  });
});

test("正式运输记录未改动时不生成审核草稿", async () => {
  await withTempData(async ({ upsertVehicle, upsertCustomer, recordTransportJob, createTransportJobDraft, loadData }) => {
    upsertVehicle({ id: "v_nochange_job", plate: "皖N00001" });
    upsertCustomer({ id: "c_nochange_job", name: "无变动客户" });
    const original = recordTransportJob({
      id: "j_nochange",
      vehicle_id: "v_nochange_job",
      customer_id: "c_nochange_job",
      date: "2026-07-09",
      document_no: "YS-0001",
      driver: "张师傅",
      work_type: "混凝土运输",
      site: "城南建设",
      project: "一期",
      trips: 1,
      volume: 20,
      settlement_volume: 20,
      unit_price: 30,
      amount: 600,
    });
    assert.throws(() => createTransportJobDraft({ ...original, originalJobId: original.id }, { id: "u1", name: "调度员" }), /无变动/);
    assert.equal(loadData().jobDrafts.length, 0);
  });
});

test("费用草稿审核通过后写入正式费用记录", async () => {
  await withTempData(async ({ upsertVehicle, createExpenseDraft, approveExpenseDraft, loadData }) => {
    upsertVehicle({ id: "v1", plate: "皖J00008" });
    const draft = createExpenseDraft({
      vehicle_id: "v1",
      date: "2026-07-07",
      type: "油费",
      quantity: 100,
      unit: "升",
      unit_price: 7.5,
      vendor: "中石化",
    }, { id: "u_accountant", name: "会计" });
    assert.equal(draft.amount, 750);
    assert.equal(draft.status, "draft");
    const result = approveExpenseDraft(draft.id, { id: "u_admin", name: "管理员" });
    assert.equal(result.draft.status, "approved");
    assert.equal(result.expense.amount, 750);
    const data = loadData();
    assert.equal(data.expenseDrafts[0].status, "approved");
    assert.equal(data.expenses.length, 1);
    assert.equal(data.expenses[0].type, "油费");
  });
});

test("正式费用记录未改动时不生成审核草稿", async () => {
  await withTempData(async ({ upsertVehicle, saveData, createExpenseDraft, loadData }) => {
    upsertVehicle({ id: "v_nochange_expense", plate: "皖N00002" });
    const data = loadData();
    data.expenses.push({
      id: "e_nochange",
      date: "2026-07-09",
      vehicleId: "v_nochange_expense",
      type: "油费",
      itemName: "油费",
      quantity: 100,
      unit: "升",
      unitPrice: 7.5,
      amount: 750,
      liters: 100,
      odometer: 1000,
      vendor: "中石化",
      note: "加油",
    });
    saveData(data);
    assert.throws(() => createExpenseDraft({
      id: "e_nochange",
      date: "2026-07-09",
      vehicleId: "v_nochange_expense",
      type: "油费",
      itemName: "油费",
      quantity: 100,
      unit: "升",
      unitPrice: 7.5,
      amount: 750,
      liters: 100,
      odometer: 1000,
      vendor: "中石化",
      note: "加油",
    }, { id: "u_accountant", name: "会计" }), /无变动/);
    assert.equal(loadData().expenseDrafts.length, 0);
  });
});

test("工资草稿审核通过后写入正式工资记录", async () => {
  await withTempData(async ({ upsertPersonnel, createSalaryDraft, approveSalaryDraft, loadData }) => {
    upsertPersonnel({ id: "p1", name: "李师傅", role: "罐车司机", base: 6500 });
    const draft = createSalaryDraft({
      personnel_id: "p1",
      month: "2026-07",
      bonus: 500,
      deduction: 100,
      paid: 3000,
      note: "含全勤",
    }, { id: "u_accountant", name: "会计" });
    assert.equal(draft.status, "draft");
    assert.equal(draft.name, "李师傅");
    assert.equal(draft.base, 6500);
    const result = approveSalaryDraft(draft.id, { id: "u_admin", name: "管理员" });
    assert.equal(result.draft.status, "approved");
    assert.equal(result.salary.name, "李师傅");
    assert.equal(result.salary.bonus, 500);
    const data = loadData();
    assert.equal(data.salaryDrafts[0].status, "approved");
    assert.equal(data.salaries.length, 1);
    assert.equal(data.salaries[0].personnelId, "p1");
  });
});

test("正式工资记录未改动时不生成审核草稿", async () => {
  await withTempData(async ({ upsertPersonnel, saveData, createSalaryDraft, loadData }) => {
    upsertPersonnel({ id: "p_nochange_salary", name: "李师傅", role: "罐车司机", base: 6500 });
    const data = loadData();
    data.salaries.push({
      id: "s_nochange",
      month: "2026-07",
      personnelId: "p_nochange_salary",
      name: "李师傅",
      role: "罐车司机",
      base: 6500,
      bonus: 500,
      deduction: 100,
      paid: 3000,
      note: "含全勤",
    });
    saveData(data);
    assert.throws(() => createSalaryDraft({
      id: "s_nochange",
      month: "2026-07",
      personnelId: "p_nochange_salary",
      bonus: 500,
      deduction: 100,
      paid: 3000,
      note: "含全勤",
    }, { id: "u_accountant", name: "会计" }), /无变动/);
    assert.equal(loadData().salaryDrafts.length, 0);
  });
});

test("收款草稿审核通过后写入正式回款记录", async () => {
  await withTempData(async ({ upsertCustomer, createPaymentDraft, approvePaymentDraft, loadData }) => {
    upsertCustomer({ id: "c1", name: "宏达商砼" });
    const draft = createPaymentDraft({
      customer_id: "c1",
      date: "2026-07-08",
      amount: 12000,
      method: "银行转账",
      invoice_no: "FP20260708001",
      note: "回款登记",
    }, { id: "u_accountant", name: "会计" });
    assert.equal(draft.status, "draft");
    assert.equal(draft.amount, 12000);
    const result = approvePaymentDraft(draft.id, { id: "u_admin", name: "管理员" });
    assert.equal(result.draft.status, "approved");
    assert.equal(result.payment.customerId, "c1");
    assert.equal(result.payment.invoiceNo, "FP20260708001");
    const data = loadData();
    assert.equal(data.paymentDrafts[0].status, "approved");
    assert.equal(data.payments.length, 1);
    assert.equal(data.payments[0].amount, 12000);
  });
});

test("正式收款记录未改动时不生成审核草稿", async () => {
  await withTempData(async ({ upsertCustomer, saveData, createPaymentDraft, loadData }) => {
    upsertCustomer({ id: "c_nochange_payment", name: "宏达商砼" });
    const data = loadData();
    data.payments.push({
      id: "p_nochange",
      date: "2026-07-09",
      customerId: "c_nochange_payment",
      amount: 12000,
      method: "银行转账",
      invoiceNo: "FP20260709001",
      invoicePdfFile: "",
      note: "回款登记",
    });
    saveData(data);
    assert.throws(() => createPaymentDraft({
      id: "p_nochange",
      date: "2026-07-09",
      customerId: "c_nochange_payment",
      amount: 12000,
      method: "银行转账",
      invoiceNo: "FP20260709001",
      invoicePdfFile: "",
      note: "回款登记",
    }, { id: "u_accountant", name: "会计" }), /无变动/);
    assert.equal(loadData().paymentDrafts.length, 0);
  });
});

test("upsertVehicle 支持中文 / Unicode 字段", async () => {
  await withTempData(async ({ upsertVehicle, loadData }) => {
    const v = upsertVehicle({
      plate: "皖I00007",
      compulsory_company: "中国人民财产保险股份有限公司",
      compulsory_policy_no: "PDAA-2026-汉字-αβγ",
    });
    const data = loadData();
    const saved = data.vehicles.find((x) => x.id === v.id);
    assert.equal(saved.compulsoryInsurance.company, "中国人民财产保险股份有限公司");
    assert.equal(saved.compulsoryInsurance.policyNo, "PDAA-2026-汉字-αβγ");
  });
});
