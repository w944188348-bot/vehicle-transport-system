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

test("primary modules expose list and edit panels with local action buttons", () => {
  const jobs = sectionHtml("jobs");
  assert.doesNotMatch(jobs, /<h2>每日运输使用情况<\/h2>/);
  assert.match(jobs, /data-module-panel="jobs-list"[\s\S]*正式运输台账/);
  assert.match(jobs, /data-module-panel="jobs-entry"[\s\S]*id="jobForm"/);
  assert.match(jobs, /data-module-mode="jobs" data-mode="list"[\s\S]*运输记录/);
  assert.doesNotMatch(jobs, /id="jobDraftsTableBody"/);

  const vehicles = sectionHtml("vehicles");
  assert.doesNotMatch(vehicles, /<h2>车辆管理<\/h2>/);
  assert.match(vehicles, /data-module-panel="vehicles-list"[\s\S]*车辆列表/);
  assert.match(vehicles, /data-module-panel="vehicles-entry"[\s\S]*id="vehicleForm"/);
  assert.match(vehicles, /录入新车辆/);

  const customers = sectionHtml("customers");
  assert.doesNotMatch(customers, /<h2>客户管理<\/h2>/);
  assert.match(customers, /data-module-panel="customers-list"[\s\S]*客户列表/);
  assert.match(customers, /data-module-panel="customer-entry"[\s\S]*id="customerForm"/);
  assert.match(customers, /data-module-panel="payment-entry"[\s\S]*id="paymentForm"/);
  assert.match(customers, /data-module-panel="customer-ledger"[\s\S]*id="customerLedgerTableBody"/);
  assert.match(customers, /新增客户/);
  assert.match(customers, /登记收款/);
  assert.match(customers, /导出Excel/);

  const expenses = sectionHtml("expenses");
  assert.doesNotMatch(expenses, /<h2>费用<\/h2>/);
  assert.match(expenses, /data-module-panel="expenses-list"[\s\S]*正式费用记录/);
  assert.match(expenses, /data-module-panel="expenses-entry"[\s\S]*id="expenseForm"/);
  assert.match(expenses, /支出费用登记/);
  assert.doesNotMatch(expenses, /id="expenseDraftsTableBody"/);

  const salaries = sectionHtml("salaries");
  assert.doesNotMatch(salaries, /<h2>人员管理<\/h2>/);
  assert.match(salaries, /class="module-switcher"[\s\S]*data-module-mode="salaries" data-mode="list"[\s\S]*人员表/);
  assert.match(salaries, /class="module-switcher"[\s\S]*data-module-mode="salaries" data-mode="salary-list"[\s\S]*工资记录/);
  assert.match(salaries, /data-module-panel="salaries-list"[\s\S]*人员表/);
  assert.doesNotMatch(salaries.match(/data-module-panel="salaries-list"[\s\S]*?data-module-panel="salary-list"/)?.[0] || "", /正式工资记录/);
  assert.match(salaries, /data-module-panel="salary-list"[\s\S]*正式工资记录/);
  assert.match(salaries, /data-module-panel="personnel-entry"[\s\S]*id="personnelForm"/);
  assert.match(salaries, /data-module-panel="salary-entry"[\s\S]*id="salaryForm"/);
  assert.match(salaries, /data-module-panel="salaries-list"[\s\S]*新增人员登记/);
  assert.doesNotMatch(salaries.match(/data-module-panel="salaries-list"[\s\S]*?data-module-panel="salary-list"/)?.[0] || "", /工资登记/);
  assert.match(salaries, /data-module-panel="salary-list"[\s\S]*工资登记/);
  assert.doesNotMatch(salaries, /id="salaryDraftsTableBody"/);
});

test("admin-only review management owns all draft queues", () => {
  const reviews = sectionHtml("reviews");
  assert.doesNotMatch(reviews, /<h2>审核管理<\/h2>/);
  assert.match(indexHtml, /class="tab admin-only" data-tab="reviews" type="button" hidden>审核管理[\s\S]*id="reviewNavBadge"/);
  assert.match(reviews, /data-review-mode="jobs"[\s\S]*每日运输审核/);
  assert.match(reviews, /data-review-mode="expenses"[\s\S]*支出费用审核/);
  assert.match(reviews, /data-review-mode="salaries"[\s\S]*人员工资审核/);
  assert.match(reviews, /data-review-mode="payments"[\s\S]*收款登记审核/);
  assert.match(indexHtml, /data-tab="reviews"[\s\S]*id="reviewNavBadge"/);
  assert.match(reviews, /data-review-alert="jobs"/);
  assert.match(reviews, /data-review-alert="expenses"/);
  assert.match(reviews, /data-review-alert="salaries"/);
  assert.match(reviews, /data-review-alert="payments"/);
  assert.match(reviews, /data-review-panel="jobs"/);
  assert.match(reviews, /每日运输审核[\s\S]*id="jobDraftsTableBody"/);
  assert.match(reviews, /支出费用审核[\s\S]*id="expenseDraftsTableBody"/);
  assert.match(reviews, /人员工资审核[\s\S]*id="salaryDraftsTableBody"/);
  assert.match(reviews, /收款登记审核[\s\S]*id="paymentDraftsTableBody"/);
  assert.match(appJs, /function renderAdminVisibility/);
  assert.match(appJs, /let activeReviewMode = "jobs"/);
  assert.match(appJs, /function setReviewMode/);
  assert.match(appJs, /function getReviewCounts/);
  assert.match(appJs, /function renderReviewBadges/);
  assert.match(appJs, /data-action="approve-payment"/);
  assert.match(appJs, /data-action="reject-payment"/);
});

test("daily transport entry prioritizes document number and reusable site/project history", () => {
  const jobs = sectionHtml("jobs");
  assert.match(jobs, /id="jobDocumentNo"[\s\S]*施工单位/);
  assert.match(jobs, /单据编号[\s\S]*id="jobDocumentNo"/);
  assert.match(jobs, /id="jobSite"[^>]*list="jobSiteHistory"/);
  assert.match(jobs, /id="jobProject"[^>]*list="jobProjectHistory"/);
  assert.match(jobs, /<datalist id="jobSiteHistory"><\/datalist>/);
  assert.match(jobs, /<datalist id="jobProjectHistory"><\/datalist>/);
  assert.match(appJs, /function previousDateInput/);
  assert.match(appJs, /\$\("#jobDate"\)\.value = previousDateInput\(today\)/);
  assert.match(appJs, /const documentNo = \$\("#jobDocumentNo"\)\.value\.trim\(\)/);
  assert.match(appJs, /documentNo,\s*\n\s*document_no: documentNo/);
  assert.match(appJs, /function renderJobHistoryDatalists/);
  assert.match(appJs, /collectJobHistoryValues\("site", field === "site" \? query : ""\)/);
  assert.match(appJs, /collectJobHistoryValues\("project", field === "project" \? query : ""\)/);
});

test("review tables expose document numbers and single approval actions", () => {
  const reviews = sectionHtml("reviews");
  assert.match(reviews, /<th>单据编号<\/th>[\s\S]*<th>日期<\/th>/);
  assert.match(appJs, /function jobDocumentNo\(job\)/);
  assert.match(appJs, /jobDocumentNo\(job\)/);
  assert.match(appJs, /jobDraftActions\(job\.id\)/);
  assert.match(appJs, /expenseDraftActions\(draft\.id\)/);
  assert.match(appJs, /salaryDraftActions\(draft\.id\)/);
  assert.match(appJs, /paymentDraftActions\(draft\.id\)/);
  assert.match(appJs, /data-action="approve-job"[\s\S]*>通过<\/button>/);
  assert.match(appJs, /data-action="approve-expense"[\s\S]*>通过<\/button>/);
  assert.match(appJs, /data-action="approve-salary"[\s\S]*>通过<\/button>/);
  assert.match(appJs, /data-action="approve-payment"[\s\S]*>通过<\/button>/);
  assert.match(appJs, /确认通过这一条每日运输审核/);
  assert.match(appJs, /确认通过这一条支出费用审核/);
  assert.match(appJs, /确认通过这一条人员工资审核/);
  assert.match(appJs, /确认通过这一条收款登记审核/);
  assert.doesNotMatch(appJs, /一键通过/);
});

test("review panels provide business-scoped approve-all actions", () => {
  const reviews = sectionHtml("reviews");
  assert.match(reviews, /id="jobDraftSearch"[\s\S]*data-action="approve-all-jobs"[\s\S]*全部通过/);
  assert.match(reviews, /id="expenseDraftSearch"[\s\S]*data-action="approve-all-expenses"[\s\S]*全部通过/);
  assert.match(reviews, /id="salaryDraftSearch"[\s\S]*data-action="approve-all-salaries"[\s\S]*全部通过/);
  assert.match(reviews, /id="paymentDraftSearch"[\s\S]*data-action="approve-all-payments"[\s\S]*全部通过/);
  assert.match(appJs, /function approveAllDrafts/);
  assert.match(appJs, /approveAllDrafts\("jobs"\)/);
  assert.match(appJs, /approveAllDrafts\("expenses"\)/);
  assert.match(appJs, /approveAllDrafts\("salaries"\)/);
  assert.match(appJs, /approveAllDrafts\("payments"\)/);
  assert.match(appJs, /确认通过当前\$\{config\.label\}中的全部待审数据/);
});

test("notifications and submitted drafts are separate submitter work queues", () => {
  const notifications = sectionHtml("notifications");
  const submittedDrafts = sectionHtml("submittedDrafts");
  assert.match(indexHtml, /id="notificationNavLabel"/);
  assert.match(indexHtml, /id="notificationNavBadge"/);
  assert.match(indexHtml, /data-tab="submittedDrafts"/);
  assert.match(indexHtml, /id="submittedDraftsNavBadge"/);
  assert.match(indexHtml, /<section class="page" id="notifications">/);
  assert.match(indexHtml, /<section class="page" id="submittedDrafts">/);
  assert.match(notifications, /<h3 id="notificationCenterTitle">通知<\/h3>/);
  assert.match(indexHtml, /id="notificationsTableBody"/);
  assert.match(submittedDrafts, /<h3 id="submittedDraftsTitle">提交草稿<\/h3>/);
  assert.match(indexHtml, /id="submittedDraftsTableBody"/);
  assert.match(appJs, /function getDraftEntries/);
  assert.match(appJs, /function getSubmittedDraftEntries/);
  assert.match(appJs, /draft\.status === "draft"/);
  assert.match(appJs, /function getRejectedNotifications/);
  assert.match(appJs, /draft\.status === "rejected"/);
  assert.match(appJs, /draft\.createdBy === currentUser\?\.id/);
  assert.match(appJs, /function renderNotifications/);
  assert.match(appJs, /function renderSubmittedDrafts/);
  assert.match(appJs, /const notifications = getRejectedNotifications\(\)/);
  assert.match(appJs, /const submittedDrafts = getSubmittedDraftEntries\(\)/);
  assert.match(appJs, /data-action="edit-submitted-draft"/);
  assert.match(appJs, /function editSubmittedDraft/);
  assert.match(appJs, /data-action="delete-submitted-draft"/);
  assert.match(appJs, /function deleteSubmittedDraft/);
  assert.match(appJs, /提交草稿已删除/);
});

test("app stops initialization on expired login instead of entering offline submit mode", () => {
  assert.match(appJs, /if \(!\(await loadCurrentUser\(\)\)\) return;/);
  assert.match(appJs, /return false;[\s\S]*location\.href = "\/login\.html"/);
  assert.match(appJs, /return true;/);
});

test("module mode controller switches panels without changing tabs", () => {
  assert.match(appJs, /const moduleModes =/);
  assert.match(appJs, /function setModuleMode/);
  assert.match(appJs, /function renderModuleModes/);
  assert.match(appJs, /data-module-mode/);
  assert.match(appJs, /scrollIntoView/);
  assert.match(appJs, /jobs: "entry"/);
  assert.match(appJs, /if \(activeTab === "jobs"\) setModuleMode\("jobs", "entry"\)/);
  assert.match(appJs, /if \(activeTab === "vehicles"\) setModuleMode\("vehicles", "list"\)/);
  assert.match(appJs, /if \(activeTab === "customers"\) setModuleMode\("customers", "list"\)/);
  assert.match(appJs, /if \(activeTab === "expenses"\) setModuleMode\("expenses", "list"\)/);
  assert.match(appJs, /setModuleMode\("jobs", "list"\)/);
  assert.match(appJs, /setModuleMode\("customers", "list"\)/);
  assert.match(appJs, /setModuleMode\("expenses", "list"\)/);
  assert.match(appJs, /setModuleMode\("salaries", "list"\)/);
  assert.match(appJs, /if \(activeTab === "salaries"\) setModuleMode\("salaries", "list"\)/);
});

test("daily transport submit stays on entry and preserves repeated site and project", () => {
  const handleJobSubmit = appJs.match(/async function handleJobSubmit[\s\S]*?\n}\n\nasync function handleVehicleSubmit/)?.[0] || "";
  assert.ok(handleJobSubmit, "handleJobSubmit should be present");
  assert.doesNotMatch(handleJobSubmit, /setModuleMode\("jobs", "list"\)/);
  assert.match(handleJobSubmit, /resetJobFormAfterSubmit\(item\)/);
  assert.match(appJs, /function resetJobFormAfterSubmit\(lastItem\)/);
  assert.match(appJs, /\$\("#jobSite"\)\.value = lastItem\.site \|\| ""/);
  assert.match(appJs, /\$\("#jobProject"\)\.value = lastItem\.project \|\| ""/);
  assert.match(appJs, /toast\("运输记录已提交，继续录入下一条"\)/);
});

test("daily transport quantity inputs are blank by default and use whole-number steppers", () => {
  const jobs = sectionHtml("jobs");
  ["jobVolume", "jobSettlementVolume", "jobMaterialVolume", "jobPumpHours", "jobOdometer"].forEach((id) => {
    const match = jobs.match(new RegExp(`<input id="${id}"[^>]*>`));
    assert.ok(match, `${id} input should exist`);
    assert.match(match[0], /step="1"/);
    assert.doesNotMatch(match[0], /value="0"/);
  });
});

test("daily transport history datalists keep six ranked suggestions from all history", () => {
  assert.match(appJs, /const JOB_HISTORY_DATALIST_LIMIT = 6/);
  assert.match(appJs, /function collectJobHistoryValues\(field, query = ""\)/);
  assert.match(appJs, /counts\.set\(value, \(counts\.get\(value\) \|\| 0\) \+ 1\)/);
  assert.match(appJs, /b\.count - a\.count/);
  assert.match(appJs, /\.slice\(0, JOB_HISTORY_DATALIST_LIMIT\)/);
  assert.match(appJs, /renderJobHistoryDatalists\(\)/);
  assert.match(appJs, /renderJobHistoryDatalists\("site", \$\("#jobSite"\)\.value\)/);
  assert.match(appJs, /renderJobHistoryDatalists\("project", \$\("#jobProject"\)\.value\)/);
});

test("records use pagination and transport filters instead of scroll-heavy lists", () => {
  const jobs = sectionHtml("jobs");
  assert.match(jobs, /id="jobDateFilter"/);
  assert.match(jobs, /id="jobStartDateFilter"/);
  assert.match(jobs, /id="jobEndDateFilter"/);
  assert.match(jobs, /id="jobFilterCustomer"/);
  assert.match(jobs, /id="jobFilterVehicle"/);
  assert.match(jobs, /id="jobFilterDriver"/);
  assert.match(indexHtml, /id="jobsPagination"/);
  assert.match(indexHtml, /id="vehiclesPagination"/);
  assert.match(indexHtml, /id="customersPagination"/);
  assert.match(indexHtml, /id="expensesPagination"/);
  assert.match(indexHtml, /id="personnelPagination"/);
  assert.match(indexHtml, /id="salariesPagination"/);
  assert.match(indexHtml, /id="jobDraftsPagination"/);
  assert.match(indexHtml, /id="expenseDraftsPagination"/);
  assert.match(indexHtml, /id="salaryDraftsPagination"/);
  assert.match(indexHtml, /id="paymentDraftsPagination"/);
  assert.match(appJs, /function getResponsivePageSize/);
  assert.match(appJs, /return 10;/);
  assert.doesNotMatch(appJs, /return 15;/);
  assert.doesNotMatch(appJs, /return 20;/);
  assert.match(appJs, /function paginateRows/);
  assert.match(appJs, /function renderPagination/);
});

test("vehicle selection switches daily transport business type by vehicle type", () => {
  assert.match(appJs, /function applyVehicleWorkType/);
  assert.match(appJs, /vehicle\?\.type === "泵车"/);
  assert.match(appJs, /\$\("#jobWorkType"\)\.value = "泵送服务"/);
  assert.match(appJs, /vehicle\?\.type === "混凝土罐车"/);
  assert.match(appJs, /\$\("#jobWorkType"\)\.value = "混凝土运输"/);
});

test("transport record editing submits a modification draft for review", () => {
  assert.match(appJs, /const existingJobId = \$\("#jobId"\)\.value/);
  assert.match(appJs, /if \(existingJobId\)/);
  assert.match(appJs, /originalJobId: existingJobId/);
  assert.match(appJs, /const result = await postJson\("\/api\/job-drafts", draftPayload\)/);
  assert.match(appJs, /toast\("运输修改已提交，继续录入下一条"\)/);
  assert.doesNotMatch(appJs, /upsert\("jobs", \{ \.\.\.item, id: existingJobId \}\)/);
  assert.match(appJs, /const result = await postJson\("\/api\/job-drafts", item\)/);
  assert.doesNotMatch(appJs, /async function handleJobSubmit[\s\S]*?if \(!apiAvailable\)[\s\S]*?运输审核需要连接服务器后使用/);
  assert.match(appJs, /response\.status === 401[\s\S]*location\.href = "\/login\.html"/);
});

test("accountant workspace hides master-data mutation and full-data operations", () => {
  assert.match(appJs, /function canManageMasterData/);
  assert.match(appJs, /return \["admin", "dispatcher"\]\.includes\(currentUser\?\.role\)/);
  assert.match(appJs, /function canReplaceSystemData/);
  assert.match(appJs, /function renderRoleWorkspace/);
  assert.match(appJs, /const modeActive = element\.dataset\.module && element\.dataset\.mode/);
  assert.match(appJs, /element\.hidden = !allowed \|\| !modeActive/);
  assert.match(indexHtml, /data-role-requires="master-data"/);
  assert.match(indexHtml, /data-role-requires="data-admin"/);
  assert.match(indexHtml, /data-role-requires="master-data"[\s\S]*录入新车辆/);
  assert.match(indexHtml, /data-role-requires="master-data"[\s\S]*新增客户/);
  assert.match(indexHtml, /data-role-requires="master-data"[\s\S]*新增人员登记/);
  assert.match(indexHtml, /data-role-requires="data-admin"[\s\S]*恢复演示数据/);
  assert.match(stylesCss, /(^|\n)\[hidden\]\s*\{[\s\S]*?display:\s*none\s*!important/);
  assert.match(appJs, /function assertPermission/);
  assert.match(appJs, /当前无权限修改客户资料/);
  assert.match(appJs, /当前无权限修改车辆资料/);
  assert.match(appJs, /当前无权限修改人员档案/);
});

test("accountant draft submissions use dedicated endpoints without global offline gate", () => {
  assert.doesNotMatch(appJs, /async function handlePaymentSubmit[\s\S]*?if \(!apiAvailable\)[\s\S]*?收款审核需要连接服务器后使用/);
  assert.doesNotMatch(appJs, /async function handleExpenseSubmit[\s\S]*?if \(!apiAvailable\)[\s\S]*?费用草稿需要连接服务器后使用/);
  assert.doesNotMatch(appJs, /async function handleSalarySubmit[\s\S]*?if \(!apiAvailable\)[\s\S]*?工资审核需要连接服务器后使用/);
  assert.match(appJs, /const result = await postJson\("\/payment-drafts"|const result = await postJson\("\/api\/payment-drafts"/);
  assert.match(appJs, /const result = await postJson\("\/api\/expense-drafts"/);
  assert.match(appJs, /const result = await postJson\("\/api\/salary-drafts"/);
});

test("transport record tables show both actual and settlement volumes", () => {
  assert.match(appJs, /function jobQuantityText\(job\)/);
  assert.match(appJs, /const actualVolume = job\.volume \?\? 0/);
  assert.match(appJs, /实际 \$\{actualVolume\} m³/);
  assert.match(appJs, /const settlementVolume = job\.settlementVolume \?\? job\.volume \?\? 0/);
  assert.match(appJs, /结算 \$\{settlementVolume\} m³/);
  assert.match(appJs, /const quantity = jobQuantityText\(job\)/);
});

test("customer ledger links transport, payments, debt and export", () => {
  assert.match(appJs, /function showCustomerLedger/);
  assert.match(appJs, /function renderCustomerLedger/);
  assert.match(appJs, /function exportCustomerLedger/);
  assert.match(appJs, /data-action="customer-ledger"/);
  assert.match(appJs, /每日运输明细/);
  assert.match(appJs, /付款情况/);
  assert.match(appJs, /欠款情况/);
});
