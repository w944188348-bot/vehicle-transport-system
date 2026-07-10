import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const indexHtml = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const appJs = fs.readFileSync(new URL("../app.js", import.meta.url), "utf8");
const stylesCss = fs.readFileSync(new URL("../styles.css", import.meta.url), "utf8");

function sectionHtml(id) {
  const match = indexHtml.match(new RegExp(`<section class="page[^\"]*" id="${id}">([\\s\\S]*?)<\\/section>`));
  assert.ok(match, `${id} section should exist`);
  return match[1];
}

test("customers module is customer management with contract and invoice attachments", () => {
  const customers = sectionHtml("customers");
  assert.match(indexHtml, /data-tab="customers" type="button">客户管理<\/button>/);
  assert.doesNotMatch(customers, /<h2>客户管理<\/h2>/);
  assert.match(customers, /<h3>客户列表<\/h3>/);
  assert.match(customers, /id="customerContractPdf"/);
  assert.match(customers, /id="customerContractPdfStatus"/);
  assert.match(customers, /id="paymentInvoiceNo"/);
  assert.match(customers, /id="paymentInvoicePdf"/);
  assert.match(customers, /id="paymentInvoicePdfStatus"/);
  assert.match(customers, /合同/);
  assert.match(customers, /发票/);
  assert.match(appJs, /customerAttachmentState/);
  assert.match(appJs, /paymentAttachmentState/);
});

test("customer edit includes price management configuration", () => {
  const customers = sectionHtml("customers");
  assert.match(customers, /单价管理/);
  assert.match(customers, /混凝土运输单价/);
  assert.match(customers, /id="customerDistanceNode1"/);
  assert.match(customers, /id="customerDistanceNode2"/);
  assert.match(customers, /id="customerDistancePrice1"/);
  assert.match(customers, /id="customerDistancePrice2"/);
  assert.match(customers, /id="customerDistanceExtraPrice"/);
  assert.match(customers, /id="customerDefaultMaterialUnitPrice"/);
  assert.match(customers, /id="customerDefaultOvertimeUnitPrice"/);
  assert.match(customers, /混凝土泵送单价/);
  assert.match(customers, /id="customerPumpStartVolume"/);
  assert.match(customers, /id="customerPumpStartFee"/);
  assert.match(customers, /id="customerDefaultPumpUnitPrice"/);
  assert.match(customers, /id="customerPumpOvertimeUnitPrice"/);
  assert.match(appJs, /customerPriceConfigFromForm/);
  assert.match(appJs, /fillCustomerPriceConfig/);
});

test("vehicles module is vehicle management with corrected insurance names and expiry dates", () => {
  const vehicles = sectionHtml("vehicles");
  assert.match(indexHtml, /data-tab="vehicles" type="button">车辆管理<\/button>/);
  assert.doesNotMatch(vehicles, /<h2>车辆管理<\/h2>/);
  assert.match(vehicles, /<h3>车辆列表<\/h3>/);
  assert.doesNotMatch(indexHtml, /超配险|超配/);
  assert.match(vehicles, /超赔险/);
  assert.match(vehicles, /id="vehicleCompulsoryExpiry"/);
  assert.match(vehicles, /id="vehicleCommercialExpiry"/);
  assert.match(vehicles, /id="vehicleExcessExpiry"/);
  assert.match(vehicles, /强制险到期/);
  assert.match(vehicles, /商业险到期/);
  assert.match(vehicles, /超赔险到期/);
  assert.doesNotMatch(vehicles, /（v4\.1）|\(v4\.1\)/i);
});

test("vehicle entry form uses compact same-page layout", () => {
  const vehicles = sectionHtml("vehicles");
  assert.match(vehicles, /<form class="form-grid panel vehicle-entry-grid" id="vehicleForm">/);
  const basicStart = vehicles.indexOf('class="vehicle-basic-row wide"');
  const detailStart = vehicles.indexOf('class="vehicle-detail-grid wide"');
  assert.ok(basicStart >= 0, "vehicle basic row should exist");
  assert.ok(detailStart > basicStart, "vehicle detail grid should follow the basic row");
  const basicRow = vehicles.slice(basicStart, detailStart);
  ["vehiclePlate", "vehicleType", "vehicleModel", "vehicleDriver", "vehicleStatus", "vehicleStartDate"].forEach((id) => {
    assert.match(basicRow, new RegExp(`id="${id}"`));
  });
  assert.doesNotMatch(vehicles, /id="vehicleNote"/);
  assert.doesNotMatch(vehicles, /class="vehicle-note-card"/);
  assert.match(vehicles, /class="vehicle-detail-grid wide"[\s\S]*class="wide vehicle-section compact-inspection"/);
  assert.match(vehicles, /class="wide form-section compact-insurance"/);
  assert.match(stylesCss, /\.vehicle-entry-grid/);
  assert.match(stylesCss, /\.vehicle-basic-row\s*\{[\s\S]*grid-template-columns:\s*repeat\(6,\s*minmax\(110px,\s*1fr\)\)/);
  assert.match(stylesCss, /\.vehicle-detail-grid\s*\{[\s\S]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(stylesCss, /\.compact-insurance/);
  assert.match(stylesCss, /\.compact-inspection/);
});

test("dashboard includes vehicle expiry alerts", () => {
  assert.match(indexHtml, /车辆到期提醒/);
  assert.match(indexHtml, /id="expiryAlerts"/);
  assert.match(appJs, /function renderExpiryAlerts/);
  assert.match(appJs, /getVehicleExpiryAlerts/);
});

test("customer balances label prepayments instead of negative debt", () => {
  assert.match(appJs, /function balanceCell/);
  assert.match(appJs, /预收款/);
  assert.match(appJs, /Math\.abs\(item\.balance\)/);
  assert.match(appJs, /balanceCell\(item\)/);
});
