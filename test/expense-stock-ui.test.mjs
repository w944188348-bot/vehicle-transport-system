import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const indexHtml = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const appJs = fs.readFileSync(new URL("../app.js", import.meta.url), "utf8");

function sectionHtml(id) {
  const match = indexHtml.match(new RegExp(`<section class="page" id="${id}">([\\s\\S]*?)<\\/section>`));
  assert.ok(match, `${id} section should exist`);
  return match[1];
}

test("stock wording is removed and expenses use draft review flow", () => {
  const expenses = sectionHtml("expenses");
  assert.match(indexHtml, /data-tab="expenses" type="button">支出费用管理<\/button>/);
  assert.doesNotMatch(indexHtml, /data-tab="stock" type="button">入库<\/button>/);
  assert.doesNotMatch(indexHtml, /<section class="page" id="stock">/);
  assert.doesNotMatch(expenses, /入库|入库单|stockDraftForm|stockDraftsTableBody|stockInsTableBody/);
  assert.match(expenses, /id="expenseForm"/);
  assert.match(expenses, /id="calcExpenseAmountBtn"/);
  assert.match(expenses, /提交草稿费用单/);
});

test("expenses page shows only approved expense records by default", () => {
  const expenses = sectionHtml("expenses");
  assert.match(expenses, /正式费用记录/);
  assert.match(expenses, /id="expensesTableBody"/);
  assert.doesNotMatch(expenses, /待审核费用单/);
  assert.doesNotMatch(expenses, /id="expenseDraftsTableBody"/);
});

test("expense draft flow keeps role-specific review actions", () => {
  const expenses = sectionHtml("expenses");
  const reviews = sectionHtml("reviews");
  assert.match(expenses, /id="expenseRoleHint"/);
  assert.match(reviews, /支出费用审核/);
  assert.match(reviews, /id="expenseDraftSearch"/);
  assert.match(reviews, /id="expenseDraftsTableBody"/);
  assert.match(appJs, /function canSubmitExpenseDraft/);
  assert.match(appJs, /function canReviewExpenseDraft/);
  assert.match(appJs, /function expenseDraftActions/);
  assert.match(appJs, /canReviewExpenseDraft\(\)/);
  assert.match(appJs, /data-action="approve-expense"/);
  assert.match(appJs, /data-action="reject-expense"/);
  assert.match(appJs, /等待管理员审核/);
});

test("expense draft review rows show vendor context before approval", () => {
  assert.match(appJs, /renderExpenseDraftsTable/);
  assert.match(appJs, /draft\.vendor \|\| draft\.itemName/);
});
