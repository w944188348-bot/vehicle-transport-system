import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const indexHtml = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const appJs = fs.readFileSync(new URL("../app.js", import.meta.url), "utf8");

function salariesSection() {
  const match = indexHtml.match(/<section class="page" id="salaries">([\s\S]*?)<\/section>/);
  assert.ok(match, "salaries section should exist");
  return match[1];
}

function formHtml(id) {
  const section = salariesSection();
  const match = section.match(new RegExp(`<form[^>]+id="${id}"[\\s\\S]*?<\\/form>`));
  assert.ok(match, `${id} should exist`);
  return match[0];
}

test("personnel module separates personnel profile and monthly salary recording", () => {
  const section = salariesSection();
  assert.match(indexHtml, /data-tab="salaries" type="button">人员及工资管理<\/button>/);
  assert.doesNotMatch(section, /<h2>人员管理<\/h2>/);
  assert.match(section, /id="personnelForm"/);
  assert.match(section, /id="salaryForm"/);
  assert.match(section, /id="salaryRoleHint"/);
  assert.match(section, /<button class="button primary" type="submit">保存人员<\/button>/);
  assert.match(section, /<button class="button primary" id="submitSalaryDraftBtn" type="submit">提交工资审核<\/button>/);
  assert.match(section, /<h3>人员表<\/h3>/);
  assert.match(section, /<h3>正式工资记录<\/h3>/);
  assert.doesNotMatch(section, /id="salaryDraftsTableBody"/);
  assert.match(appJs, /人员信息已保存/);
});

test("personnel profile form only captures name role base salary and note", () => {
  const form = formHtml("personnelForm");
  assert.match(form, /id="personnelName"/);
  assert.match(form, /id="personnelRole"/);
  assert.match(form, /id="personnelBase"/);
  assert.match(form, /id="personnelNote"/);
  assert.doesNotMatch(form, /id="salaryMonth"|id="salaryBonus"|id="salaryDeduction"|id="salaryPaid"/);
  assert.doesNotMatch(form, />\s*月份\s*</);
});

test("personnel table shows trip counts and monthly salary is recorded by month", () => {
  const section = salariesSection();
  const salaryForm = formHtml("salaryForm");
  assert.match(section, /<th>趟数<\/th>/);
  assert.match(appJs, /总趟数/);
  assert.match(appJs, /本月/);
  assert.match(salaryForm, /id="salaryMonth"/);
  assert.match(salaryForm, /id="salaryPerson"/);
});

test("salary draft flow keeps role-specific submit and review actions", () => {
  const section = salariesSection();
  const reviews = indexHtml.match(/<section class="page" id="reviews">([\s\S]*?)<\/section>/)?.[1] || "";
  assert.match(reviews, /人员工资审核/);
  assert.match(section, /正式工资记录/);
  assert.match(reviews, /id="salaryDraftSearch"/);
  assert.match(reviews, /id="salaryDraftsTableBody"/);
  assert.match(appJs, /function canSubmitSalaryDraft/);
  assert.match(appJs, /function canReviewSalaryDraft/);
  assert.match(appJs, /function salaryDraftActions/);
  assert.match(appJs, /data-action="approve-salary"/);
  assert.match(appJs, /data-action="reject-salary"/);
  assert.match(appJs, /等待管理员审核/);
});

test("daily transport selects driver or operator from personnel records", () => {
  assert.match(indexHtml, /<select id="jobDriver"[^>]*required/);
  assert.match(appJs, /renderPersonnelOptions/);
});

test("daily transport vehicle change always applies the vehicle default driver", () => {
  assert.match(appJs, /#jobVehicle"\)\.addEventListener\("change"/);
  assert.match(appJs, /const person = findPersonnelByName\(vehicle\?\.driver\)/);
  assert.match(appJs, /if \(vehicle && person\) \$\("#jobDriver"\)\.value = person\.id;/);
  assert.doesNotMatch(appJs, /if \(vehicle && person && !\$\("#jobDriver"\)\.value\)/);
});

test("daily transport labels use current business wording", () => {
  const match = indexHtml.match(/<form[^>]+id="jobForm"[\s\S]*?<\/form>/);
  assert.ok(match, "jobForm should exist");
  const form = match[0];
  assert.match(form, /施工单位/);
  assert.match(form, /工程名称/);
  assert.match(form, /趟数\s*<input id="jobTrips" type="number" min="1" step="1" value="1"/);
  assert.match(form, /实际方量/);
  assert.match(form, /id="jobSettlementVolume"/);
  assert.match(form, /带料方量/);
  assert.match(form, /id="jobMaterialVolume"/);
  assert.match(form, /运输单价/);
  assert.match(form, /id="jobMaterialUnitPrice"/);
  assert.match(form, /带料单价/);
  assert.match(form, /id="jobOvertimeUnitPrice"/);
  assert.match(form, /超时单价/);
  assert.match(form, /超时时间/);
  assert.match(form, /运输公里数/);
  assert.match(form, /付款方式/);
  assert.doesNotMatch(form, /项目\/备注名|工地\/地点|泵送小时|车辆公里数|车辆公里数（v4\.1）|付款方式（v4\.1）|方量\(m³\)>\s*<input id="jobVolume"|>\s*单价\s*</);
  assert.doesNotMatch(form, /运输\+泵送/);
  assert.match(appJs, /calculateJobAmount/);
  assert.match(appJs, /applyCustomerPricing/);
  assert.match(appJs, /calculateDistanceUnitPrice/);
  assert.match(appJs, /jobSettlementVolume/);
  assert.match(appJs, /jobMaterialVolume/);
  assert.match(appJs, /jobMaterialUnitPrice/);
  assert.match(appJs, /jobOvertimeUnitPrice/);
});

test("app state includes personnel collection and trip stats", () => {
  assert.match(appJs, /personnel:\s*\[\]/);
  assert.match(appJs, /personnelTripStats/);
  assert.match(appJs, /sortPersonnelByName/);
  assert.match(appJs, /const personnel = sortPersonnelByName\(state\.personnel\)/);
});
