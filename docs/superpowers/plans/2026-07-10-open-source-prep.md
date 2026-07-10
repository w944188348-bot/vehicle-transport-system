# Open Source Preparation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prepare the repository for safe GitHub publication without pushing to GitHub or touching production/runtime data.

**Architecture:** This is a repository hygiene change. It modifies tracked documentation and metadata only, keeps application code behavior unchanged, and records verification evidence in a local audit document.

**Tech Stack:** Node.js ES modules, static HTML/CSS/JS frontend, built-in `node:test`, Git.

## Global Constraints

- Do not push to GitHub.
- Do not change production services, credentials, SSH keys, user accounts, or runtime data.
- Do not stage `data/`, generated output, logs, `.codegraph/`, or `node_modules/`.
- Keep public docs free of private network addresses, production backup paths, formal account names, and credential handling details.
- Commit each independently useful step.

---

### Task 1: Branch and Spec Baseline

**Files:**
- Create: `docs/superpowers/specs/2026-07-10-open-source-prep-design.md`
- Create: `docs/superpowers/plans/2026-07-10-open-source-prep.md`

**Interfaces:**
- Consumes: existing project rules in `AGENTS.md`.
- Produces: written scope for the open-source preparation branch.

- [x] **Step 1: Create branch**

Run: `git switch -c codex/open-source-prep-20260710`

Expected: branch is created locally; no remote push.

- [x] **Step 2: Write design and implementation plan**

Create the two files listed above, with scope limited to open-source documentation, metadata, audit, and verification.

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/specs/2026-07-10-open-source-prep-design.md docs/superpowers/plans/2026-07-10-open-source-prep.md
git commit -m "docs: plan open source preparation"
```

### Task 2: Public Repository Metadata

**Files:**
- Create: `LICENSE`
- Create: `SECURITY.md`
- Create: `CONTRIBUTING.md`

**Interfaces:**
- Consumes: existing Node.js test commands and runtime data layout.
- Produces: standard GitHub-facing project metadata.

- [ ] **Step 1: Add MIT license**

Create `LICENSE` using the MIT License, copyright holder `wsmac`.

- [ ] **Step 2: Add security policy**

Create `SECURITY.md` stating that `data/`, secrets, formal business records, private keys, cookies, tokens, and production credentials must not be committed or disclosed.

- [ ] **Step 3: Add contribution guide**

Create `CONTRIBUTING.md` with setup, test, data-safety, and PR expectations.

- [ ] **Step 4: Commit**

```bash
git add LICENSE SECURITY.md CONTRIBUTING.md
git commit -m "docs: add open source project metadata"
```

### Task 3: Public README Rewrite

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: current startup, feature, MCP, and test commands.
- Produces: public-facing README that avoids private deployment detail.

- [ ] **Step 1: Replace deployment-heavy README**

Rewrite `README.md` around:

- project purpose
- features
- local startup
- data storage and ignored runtime files
- authentication bootstrap behavior without exposing any actual account
- MCP tools
- test commands
- open-source safety notes

- [ ] **Step 2: Verify no private terms remain in README**

Run a local private-term scan using terms known to the maintainer's deployment.
Do not write those private terms into public documentation. For this branch, the
scan should include private network addresses, hostnames, backup paths, account
names, and release archive names that appeared in earlier private docs.

```bash
rg -n -f /tmp/vehicle-transport-private-open-source-patterns.txt README.md
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: make readme safe for open source"
```

### Task 4: Open Source Safety Audit

**Files:**
- Create: `docs/open-source-audit-20260710.md`

**Interfaces:**
- Consumes: tracked files, Git history, `.gitignore`, and sensitive-word scan output.
- Produces: durable local audit report for the branch.

- [ ] **Step 1: Run current scans**

Run:

```bash
git status --short
git ls-files
find . -maxdepth 3 -type f \( -name '.env*' -o -name '*credential*' -o -name '*secret*' -o -name '*key*' -o -name '*token*' -o -name '*admin*' \) -not -path './.git/*' -print
rg -n -i "password|passwd|secret|token|private key|BEGIN (RSA|OPENSSH|EC|DSA)|cookie|authorization|api[_-]?key|ssh|credential" --glob '!data/**' --glob '!node_modules/**' --glob '!*.bak' .
git log --all --name-only --pretty=format:'commit %H' -- data
git log --all --name-only --pretty=format:'commit %H' -- '*secret*' '*credential*' '*key*' '*token*' '*admin*'
```

- [ ] **Step 2: Write audit report**

Record the conclusion, scanned commands, safe findings, and remaining publication risks without copying secrets.

- [ ] **Step 3: Commit**

```bash
git add docs/open-source-audit-20260710.md
git commit -m "docs: add open source safety audit"
```

### Task 5: Final Verification

**Files:**
- No expected file changes.

**Interfaces:**
- Consumes: final branch state.
- Produces: evidence for final handoff.

- [ ] **Step 1: Run syntax checks**

```bash
node --check app.js
node --check web_server.mjs
node --check mcp/fleet_core.mjs
node --check mcp/fleet_mcp_server.mjs
```

- [ ] **Step 2: Run test suite**

```bash
node --test test/*.mjs mcp/fleet_core.test.mjs
```

- [ ] **Step 3: Run final safety scan**

```bash
rg -n -f /tmp/vehicle-transport-private-open-source-patterns.txt README.md SECURITY.md CONTRIBUTING.md LICENSE docs/open-source-audit-20260710.md
git status --short
```

- [ ] **Step 4: Report**

Report changed files, commits, verification output, remaining risks, and next step for creating a GitHub repository.
