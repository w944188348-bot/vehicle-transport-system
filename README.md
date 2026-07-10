# Vehicle Transport Management System

A small self-hosted vehicle transport management system for ready-mix concrete
plants and commercial concrete stations. It covers concrete pump trucks,
mixer trucks, transport ledgers, customer balances, expenses, salaries, and
review workflows, with a browser UI, a local HTTP API, and MCP tools for agent
workflows.

The project is designed for private deployment. Source code is safe to share,
but runtime data, credentials, customer records, contract files, invoices, and
deployment notes must stay outside the repository.

## Features

- Vehicle records for pump trucks, mixer trucks, drivers, insurance dates, and
  inspection dates.
- Daily transport ledgers for customers, project names, trips, quantities,
  pump time, mileage, receivables, and on-site payments.
- Customer balance summaries with receivables, received payments, and current
  debt.
- Expense records for fuel, maintenance, insurance, tolls, and other vehicle
  costs.
- Personnel and salary records with role-aware submission and review flows.
- Monthly overview with revenue, collections, expenses, salaries, gross profit,
  customer debt, vehicle usage, and upcoming expiry reminders.
- JSON backup import/export and monthly CSV export.
- Local authentication and role-based access control.
- MCP tools for querying, recording, and summarizing fleet data.
- Agent helpers for read-only business reports and reviewed insurance-policy
  update drafts.

## Repository Layout

```text
.
├── app.js                         # Main browser application logic
├── index.html                     # Main application shell
├── login.html                     # Login page
├── users.html                     # User management page
├── styles.css                     # Shared UI styles
├── web_server.mjs                 # Local HTTP server and API routes
├── mcp/
│   ├── auth.mjs                   # Local authentication helpers
│   ├── fleet_core.mjs             # Core data operations
│   ├── fleet_mcp_server.mjs       # MCP stdio server
│   ├── fleet_agent.mjs            # Agent report and draft helpers
│   └── fleet_agent_cli.mjs        # Local agent CLI
├── test/                          # Node test suite
└── data/.gitkeep                  # Runtime data directory placeholder
```

## Requirements

- Node.js with ES module support.
- A modern browser for the UI.

No package install is required for the current repository because it uses
Node.js built-in modules and `node:test`.

## Local Startup

Run from the repository root:

```bash
node web_server.mjs --host 127.0.0.1 --port 8765
```

Open:

```text
http://127.0.0.1:8765
```

The server stores local runtime data under `data/`. On first use, it may create
local authentication files and a one-time administrator credential file under
that directory. Treat those files as private local deployment artifacts.

You can also open `index.html` directly in a browser, but that mode uses browser
storage only and does not share data with the HTTP API or MCP server.

## Data Safety

The `data/` directory is intentionally ignored by Git except for
`data/.gitkeep`.

Do not commit or share:

- customer, employee, vehicle, invoice, contract, payment, or attachment data
- generated authentication files
- cookies, tokens, keys, password hashes, or deployment credentials
- private deployment notes, backup paths, hostnames, or network addresses
- generated logs, release archives, or local database snapshots

Use synthetic data for demos, screenshots, issues, and tests.

## MCP Tools

The MCP server is implemented by `mcp/fleet_mcp_server.mjs`.

Main tool groups:

- `fleet_summary`: monthly operating summary.
- `list_vehicles` / `upsert_vehicle`: query or maintain vehicles.
- `list_customers` / `upsert_customer`: query or maintain customers.
- `record_transport_job` / `list_transport_jobs`: record or query daily
  transport jobs.
- `record_vehicle_expense` / `list_vehicle_expenses`: record or query expenses.
- `record_customer_payment` / `list_customer_payments`: record or query
  customer payments.
- `record_salary` / `list_salaries`: record or query salaries.
- `customer_balance_report`: customer debt ranking.
- `export_data`: export complete local data.
- `delete_record`: delete supported records with relationship protection.
- `agent_business_report`: generate read-only operating reports.
- `agent_create_insurance_policy_draft`: create an insurance update draft from
  OCR text or extracted policy text.
- `agent_approve_insurance_policy_draft`: approve an insurance draft and write
  only the reviewed vehicle insurance fields.
- `agent_feishu_webhook_preview`: simulate an internal message-triggered agent
  action without sending external messages.

The example configuration in `hermes-mcp-config.example.json` shows the expected
stdio command and environment variables. Copy it outside the repository and
adjust paths for your own deployment.

## Agent Helpers

Generate a local business report:

```bash
node mcp/fleet_agent_cli.mjs report --month 2026-07
```

Create an insurance update draft from extracted policy text:

```bash
node mcp/fleet_agent_cli.mjs insurance-draft --file ./policy-ocr.txt --filename policy.pdf
```

Approve a reviewed draft:

```bash
node mcp/fleet_agent_cli.mjs approve-insurance-draft --draft-id agt_xxx
```

Run the agent preflight check with temporary data:

```bash
node mcp/fleet_agent_preflight.mjs
```

The agent helpers are designed around explicit review. Reports are read-only,
insurance extraction creates drafts first, and formal vehicle insurance fields
are written only after approval.

## Validation

Syntax checks:

```bash
node --check app.js
node --check web_server.mjs
node --check mcp/fleet_core.mjs
node --check mcp/fleet_mcp_server.mjs
```

Full test suite:

```bash
node --test test/*.mjs mcp/fleet_core.test.mjs
```

For UI changes, also run the local server and verify the affected page in a
browser.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## Security

See [SECURITY.md](SECURITY.md). Never include real business data, runtime data,
or deployment secrets in public issues, pull requests, screenshots, or example
files.

## License

MIT. See [LICENSE](LICENSE).
