# AGENTS.md

This file defines the working rules for agents and maintainers editing this
repository.

## Project Scope

Vehicle Transport Management System is a self-hosted Node.js application for
fleet, transport ledger, customer balance, expense, salary, and MCP workflows.

Public repository content should be limited to source code, tests, examples,
and non-sensitive documentation. Private deployment history, production
topology, runtime data, credentials, and business records belong outside Git.

## Work Discipline

- Inspect relevant files before editing.
- Prefer small, targeted, reversible changes.
- Preserve existing project structure, naming, and style.
- Do not rewrite unrelated code.
- Do not add dependencies, change deployment config, or touch secrets without
  explicit confirmation.
- Commit each independently meaningful step.
- Before committing, run `git status --short` and stage only files related to
  the current step.

## Data And Secret Safety

- Do not commit `data/` runtime files, except `data/.gitkeep`.
- Do not commit passwords, password hashes, tokens, cookies, private keys, API
  keys, SSH keys, customer records, vehicle records, invoices, contracts,
  payment data, employee records, attachments, logs, or local release archives.
- Use synthetic data in tests, screenshots, examples, and issue reports.
- Do not publish private hostnames, private network addresses, backup paths, or
  credential handling notes.

## Startup Checks

For non-trivial work, start with:

```bash
git status --short
sed -n '1,220p' README.md
```

Then inspect the files directly related to the requested change.

## Validation

Run the smallest relevant validation first.

For backend or MCP changes:

```bash
node --check app.js
node --check web_server.mjs
node --check mcp/fleet_core.mjs
node --check mcp/fleet_mcp_server.mjs
node --test mcp/fleet_core.test.mjs
```

For broad repository changes:

```bash
node --check app.js
node --check web_server.mjs
node --check mcp/fleet_core.mjs
node --check mcp/fleet_mcp_server.mjs
node --test test/*.mjs mcp/fleet_core.test.mjs
```

For UI changes, run the local server and verify the affected page in a browser
when possible:

```bash
node web_server.mjs --host 127.0.0.1 --port 8765
```

For documentation-only changes, check that public docs do not expose runtime
data, secrets, private deployment details, or formal business records.

## Final Response Checklist

When finishing a task, report:

- what changed
- what was verified and the result
- remaining risks or limitations
- current uncommitted changes, if any
- suggested next step

If stage, commit, push, or pull request actions were completed, state the branch
and commit information clearly.
