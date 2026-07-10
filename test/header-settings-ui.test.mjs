import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const indexHtml = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const loginHtml = fs.readFileSync(new URL("../login.html", import.meta.url), "utf8");
const usersHtml = fs.readFileSync(new URL("../users.html", import.meta.url), "utf8");
const appJs = fs.readFileSync(new URL("../app.js", import.meta.url), "utf8");
const stylesCss = fs.readFileSync(new URL("../styles.css", import.meta.url), "utf8");

function tabsHtml() {
  const match = indexHtml.match(/<nav class="tabs"[\s\S]*?<\/nav>/);
  assert.ok(match, "tabs nav should exist");
  return match[0];
}

function navShellHtml() {
  const match = indexHtml.match(/<div class="nav-shell">([\s\S]*?)<\/div>\s*<main>/);
  assert.ok(match, "nav shell should exist");
  return match[1];
}

function headerHtml() {
  const match = indexHtml.match(/<header class="app-header">([\s\S]*?)<\/header>/);
  assert.ok(match, "app header should exist");
  return match[1];
}

test("top brand uses css circular logo and css art text", () => {
  const header = headerHtml();
  assert.match(header, /class="brand-hero"/);
  assert.match(header, /class="brand-hero-logo"/);
  assert.match(header, />砼<\/span>/);
  assert.match(header, /class="brand-hero-text"/);
  assert.match(header, /车辆运输财务管理[\s\S]*系统/);
  assert.doesNotMatch(header, /vehicle-transport-nav-logo/);
});

test("login and user management pages share the system brand", () => {
  for (const html of [loginHtml, usersHtml]) {
    assert.match(html, /车辆运输财务管理[\s\S]*系统/);
    assert.match(html, /class="brand-hero-logo"/);
    assert.match(html, />砼<\/span>/);
    assert.match(html, /class="brand-hero/);
    assert.doesNotMatch(html, /brand-mark/);
    assert.doesNotMatch(html, /车辆运输管理系统/);
  }
  assert.match(stylesCss, /\.auth-brand\s*\{/);
  assert.match(stylesCss, /\.admin-brand\s*\{/);
});

test("user management exposes admin delete action separately from disable", () => {
  assert.match(usersHtml, /data-action="delete"/);
  assert.match(usersHtml, /function deleteUser/);
  assert.match(usersHtml, /确认删除这个用户/);
  assert.match(usersHtml, /用户已删除/);
  assert.match(usersHtml, /\/api\/users\/' \+ encodeURIComponent\(id\)/);
  assert.match(usersHtml, /data-action="disable"/);
  assert.match(usersHtml, /\/disable'/);
});

test("login and primary modules do not show explanatory helper copy", () => {
  assert.doesNotMatch(loginHtml, /bootstrap-admin\.txt|一次性管理员密码|首次部署/);
  assert.doesNotMatch(indexHtml, /记录泵车、混凝土罐车每天给哪个客户、哪个工地服务，以及收入和当场收款。/);
  assert.doesNotMatch(indexHtml, /维护泵车、罐车的基础信息，方便每日台账和费用关联到具体车辆。/);
  assert.doesNotMatch(indexHtml, /维护客户资料、合同附件、收款和发票，欠账按运输与回款自动汇总。/);
  assert.doesNotMatch(indexHtml, /费用先提交草稿，管理员审核通过后转为正式费用记录。/);
  assert.doesNotMatch(indexHtml, /维护司机、泵工、调度、管理人员等基础资料，并关联每日运输趟数和月度工资。/);
});

test("navigation contains functions only without brand text", () => {
  const nav = navShellHtml();
  assert.doesNotMatch(nav, /nav-brand|vehicle-transport-nav-logo|车辆运输系统/);
  assert.match(nav, /<nav class="tabs"/);
  assert.doesNotMatch(indexHtml, /泵车 \/ 混凝土罐车 · 每日台账、费用、人员、客户管理/);
  assert.doesNotMatch(indexHtml, /monthFilter|账期|printSummaryBtn|打印月报/);
});

test("navigation hover uses metric-card motion and review badge", () => {
  const nav = navShellHtml();
  assert.match(nav, /id="reviewNavBadge"/);
  assert.match(stylesCss, /\.nav-shell\s*\{[\s\S]*?padding:\s*8px/);
  assert.match(stylesCss, /\.tabs\s*\{[\s\S]*?overflow-y:\s*visible/);
  assert.match(stylesCss, /\.tab\s*\{[\s\S]*?min-height:\s*42px/);
  assert.match(stylesCss, /\.tab:hover\s*\{[\s\S]*?transform:\s*translateY\(-2px\)/);
  assert.match(stylesCss, /\.tab:hover\s*\{[\s\S]*?box-shadow:\s*0 12px 24px/);
  assert.match(stylesCss, /\.tab::after/);
  assert.match(stylesCss, /\.review-badge/);
  assert.match(stylesCss, /\.review-alert/);
});

test("secondary settings actions are only inside the settings menu", () => {
  const tabs = tabsHtml();
  assert.doesNotMatch(tabs, /id="userPanel"/);
  assert.doesNotMatch(tabs, /id="userManageLink"/);
  assert.doesNotMatch(tabs, /id="switchUserBtn"/);
  assert.doesNotMatch(tabs, /id="logoutBtn"/);
  assert.doesNotMatch(tabs, /data-tab="data"/);
  assert.doesNotMatch(tabs, /href="\/users\.html"/);
  assert.doesNotMatch(tabs, /data-action="switch-user"/);
  assert.doesNotMatch(tabs, /data-action="logout"/);
});

test("data module is moved out of primary tabs", () => {
  assert.doesNotMatch(tabsHtml(), /data-tab="data"/);
});

test("system settings entry lives in the function navigation area", () => {
  assert.match(indexHtml, /class="nav-shell"/);
  assert.match(indexHtml, /id="themeToggleBtn"/);
  assert.doesNotMatch(indexHtml, /id="themeToggleLabel"|>白天<|>夜晚<|>设置<\/span>/);
  assert.match(indexHtml, /id="systemSettingsBtn"/);
  assert.match(indexHtml, /aria-label="系统设置"/);
  assert.match(indexHtml, /id="systemSettingsMenu"/);
  assert.match(indexHtml, /id="settingsUserPanel"/);
  assert.match(indexHtml, /data-tab="data"/);
  assert.match(indexHtml, /href="\/users\.html"/);
  assert.match(indexHtml, /data-action="switch-user"/);
  assert.match(indexHtml, /data-action="logout"/);
});

test("settings menu interactions are bound", () => {
  assert.match(appJs, /\$\$\("\.tabs \.tab\[data-tab\]"\)/);
  assert.match(appJs, /THEME_KEY/);
  assert.match(appJs, /function toggleTheme/);
  assert.match(appJs, /function applyTheme/);
  assert.match(appJs, /#systemSettingsBtn/);
  assert.match(appJs, /#systemSettingsMenu/);
  assert.match(appJs, /settingsActionButton\.dataset\.action === "switch-user"/);
  assert.match(appJs, /settingsActionButton\.dataset\.action === "logout"/);
  assert.match(appJs, /settings-open/);
  assert.doesNotMatch(appJs, /#monthFilter|#printSummaryBtn/);
});

test("brand lockup is compact and themeable", () => {
  assert.match(stylesCss, /\.brand-hero-logo\s*\{[\s\S]*?clamp\(80px,\s*7\.1vw,\s*104px\)/);
  assert.match(stylesCss, /\.brand-hero-logo\s*\{[\s\S]*?border-radius:\s*50%/);
  assert.match(stylesCss, /\.brand-hero-text span,[\s\S]*?\.brand-hero-text em\s*\{[\s\S]*?font-family:[\s\S]*?Hannotate SC/);
  assert.doesNotMatch(stylesCss, /-webkit-text-stroke:\s*1\.1px/);
  assert.doesNotMatch(stylesCss, /url\("assets\/commercial-dashboard-bg\.png"\)/);
  assert.match(stylesCss, /\.nav-icon-button\s*\{/);
  assert.match(stylesCss, /body\[data-theme="night"\]/);
});
