import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const indexHtml = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const appJs = fs.readFileSync(new URL("../app.js", import.meta.url), "utf8");
const stylesCss = fs.readFileSync(new URL("../styles.css", import.meta.url), "utf8");

function dashboardHtml() {
  const match = indexHtml.match(/<section class="page active" id="dashboard">([\s\S]*?)<\/section>/);
  assert.ok(match, "dashboard section should exist");
  return match[1];
}

test("settings menu is layered above homepage panels", () => {
  assert.match(stylesCss, /\.settings-control\s*\{[\s\S]*?z-index:\s*1000;/);
  assert.match(stylesCss, /\.settings-menu\s*\{[\s\S]*?z-index:\s*1001;/);
});

test("business record tables use compact row density", () => {
  assert.match(stylesCss, /th,\s*\ntd\s*\{[\s\S]*?padding:\s*5px 8px;/);
  assert.match(stylesCss, /\.dashboard-grid th,\s*\n\.dashboard-grid td\s*\{[\s\S]*?padding:\s*6px 8px;/);
  assert.match(stylesCss, /\.cell-muted\s*\{[\s\S]*?font-size:\s*11px;[\s\S]*?line-height:\s*1\.2;/);
  assert.match(stylesCss, /\.row-actions\s*\{[\s\S]*?gap:\s*4px;/);
  assert.match(stylesCss, /\.mini-button\s*\{[\s\S]*?min-height:\s*24px;[\s\S]*?padding:\s*0 7px;/);
  assert.match(stylesCss, /\.pagination\s*\{[\s\S]*?min-height:\s*30px;[\s\S]*?padding:\s*3px 8px;/);
});

test("dashboard removes repeated shortcut cards and hero shell", () => {
  const dashboard = dashboardHtml();
  assert.doesNotMatch(dashboard, /dashboard-hero/);
  assert.doesNotMatch(dashboard, /action-grid/);
  assert.doesNotMatch(dashboard, /运输台账|客户回款|车辆档案|成本支出/);
  assert.doesNotMatch(dashboard, /经营驾驶舱/);
  assert.doesNotMatch(indexHtml, /id="periodLabel"/);
});

test("dashboard keeps the six core operation metrics", () => {
  assert.match(appJs, /statCard\("应收"/);
  assert.match(appJs, /statCard\("已收"/);
  assert.match(appJs, /statCard\("费用"/);
  assert.match(appJs, /statCard\("工资"/);
  assert.match(appJs, /statCard\("毛利"/);
  assert.match(appJs, /statCard\("欠账"/);
});

test("dashboard includes daily trip count bar chart", () => {
  const dashboard = dashboardHtml();
  assert.match(dashboard, /dashboard-main-grid/);
  assert.match(indexHtml, /dashboard-bottom-grid/);
  assert.match(indexHtml, /dashboard-main-grid[\s\S]*每日经营[\s\S]*昨日动态/);
  assert.match(indexHtml, /dashboard-bottom-grid[\s\S]*客户欠账排行[\s\S]*车辆到期提醒/);
  assert.match(dashboard, /每日经营/);
  assert.doesNotMatch(dashboard, /每日经营走势|本月动态|一个月到期提醒/);
  assert.doesNotMatch(dashboard, /经营走向/);
  assert.match(dashboard, /id="dailyTrendChart"/);
  assert.match(dashboard, /id="dailyTrendLegend"/);
  assert.match(appJs, /function renderDailyTrend/);
  assert.match(appJs, /dailyTrendRows/);
  assert.match(appJs, /rollingSevenDayWindow/);
  assert.match(appJs, /renderDailyTrend\(/);
  assert.match(appJs, /trips/);
  assert.match(appJs, /trend-bar/);
  assert.match(appJs, /slotWidth/);
  assert.match(appJs, /Math\.min\(40/);
  assert.match(appJs, /trend-bar-highlight/);
  assert.match(appJs, /trend-bar-rim/);
  assert.match(appJs, /出车趟数/);
  assert.match(appJs, /7 日高峰/);
  assert.match(appJs, /7 日日均/);
  assert.match(appJs, /const averageTrips = totalTrips \/ 7/);
  assert.match(appJs, /7 日出车/);
  assert.doesNotMatch(appJs, /label: "应收"/);
  assert.doesNotMatch(appJs, /label: "毛利"/);
  assert.doesNotMatch(appJs, /<path class="trend-line"/);
  assert.match(stylesCss, /\.dashboard-main-grid/);
  assert.match(stylesCss, /\.dashboard-bottom-grid/);
  assert.match(stylesCss, /\.trend-bar/);
  assert.match(stylesCss, /\.trend-bar-highlight/);
  assert.match(stylesCss, /\.trend-bar-rim/);
  assert.doesNotMatch(appJs, /<ellipse class="trend-bar-shadow"/);
  assert.doesNotMatch(stylesCss, /\.trend-bar-shadow/);
});

test("dashboard yesterday activity links to filtered transport records without row jumps", () => {
  assert.match(indexHtml, /id="yesterdayJobsViewAll"/);
  assert.match(indexHtml, /data-dashboard-action="yesterday-jobs"/);
  assert.match(appJs, /function yesterdayDate/);
  assert.match(appJs, /function jumpToYesterdayJobs/);
  assert.match(appJs, /#jobDateFilter/);
  assert.match(appJs, /setModuleMode\("jobs", "list"/);
  assert.doesNotMatch(appJs, /class="activity-item" data-jump="jobs"/);
});

test("customer debt ranking is compact and links to sorted customer list", () => {
  assert.match(indexHtml, /data-dashboard-action="customer-debts"/);
  assert.match(indexHtml, /data-dashboard-action="customer-payment"[\s\S]*去收款/);
  assert.match(indexHtml, /data-dashboard-action="customer-debts"[\s\S]*查看全部/);
  assert.match(appJs, /\.slice\(0, 3\)/);
  assert.match(appJs, /let customerSortMode = "default"/);
  assert.match(appJs, /function jumpToCustomerDebtList/);
  assert.match(appJs, /customerSortMode === "debt-desc"/);
});
