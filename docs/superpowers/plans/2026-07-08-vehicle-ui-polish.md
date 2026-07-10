# Vehicle UI Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Polish the vehicle transport system UI into a cohesive business-ready management interface without changing data, MCP, or authentication behavior.

**Architecture:** Keep the current static HTML/CSS/vanilla JS architecture. Add a root design contract, reuse the main `styles.css` design tokens, and align `users.html` and `login.html` with the main app shell while preserving existing API calls.

**Tech Stack:** HTML, CSS, vanilla JavaScript, Node.js test runner, local `web_server.mjs`.

## Global Constraints

- Do not add dependencies or migrate the frontend stack.
- Do not modify `data/`, authentication secrets, MCP tools, or production configuration.
- Preserve existing element ids used by `app.js` and `users.html` scripts.
- Keep UI copy in Chinese and optimized for transport operators, dispatchers, accountants, and administrators.
- Validate with existing tests and browser inspection when possible.

---

### Task 1: Design Contract

**Files:**
- Create: `DESIGN.md`
- Create: `docs/superpowers/plans/2026-07-08-vehicle-ui-polish.md`

**Interfaces:**
- Consumes: Existing UI direction from `index.html`, `styles.css`, and user approval.
- Produces: A stable design contract for later UI edits.

- [ ] Write `DESIGN.md` with direction, tokens, layout, controls, tables, forms, responsive, motion, and verification rules.
- [ ] Save this implementation plan under `docs/superpowers/plans/`.
- [ ] Check that both files avoid placeholders and do not contain secrets.

### Task 2: Shared Visual System

**Files:**
- Modify: `styles.css`
- Modify: `login.html`
- Modify: `users.html`

**Interfaces:**
- Consumes: Existing CSS variables and button/panel/table patterns.
- Produces: Shared page classes usable by login and user management pages.

- [ ] Add shared utility classes for compact app pages, admin layout, status pills, aligned table columns, and improved empty/table states.
- [ ] Update `login.html` to use shared visual conventions while preserving `#loginForm`, `#phone`, `#password`, `#submitBtn`, and `#msg`.
- [ ] Update `users.html` to load `styles.css`, remove isolated inline product styling, and preserve all existing form fields, ids, and API logic.

### Task 3: Main App Polish

**Files:**
- Modify: `index.html`
- Modify: `styles.css`

**Interfaces:**
- Consumes: Existing `app.js` selectors and `data-tab`, `data-jump`, `data-reset` attributes.
- Produces: Clearer shell, grouped header tools, better form sections, and table polish without app logic changes.

- [ ] Group header actions into semantic tool clusters without changing ids.
- [ ] Add form section headings for daily transport and data backup areas where they improve scanning.
- [ ] Improve responsive behavior for header tools, stats, tables, buttons, and file upload sections.
- [ ] Keep all existing ids and data attributes intact.

### Task 4: Verification

**Files:**
- Validate: `test/*.test.mjs`
- Validate: rendered app through local server.

**Interfaces:**
- Consumes: Modified static files.
- Produces: Evidence that behavior and layout remain usable.

- [ ] Run `node --test test/*.test.mjs`.
- [ ] Start `node web_server.mjs --host 127.0.0.1 --port 8765`.
- [ ] Inspect `http://127.0.0.1:8765/login.html`, `/`, and `/users.html` in desktop and mobile widths.
- [ ] Check browser console for critical errors.
