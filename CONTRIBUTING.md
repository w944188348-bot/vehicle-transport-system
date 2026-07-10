# Contributing

## Development Setup

This project uses Node.js ES modules and built-in `node:test`.

Start the local web server:

```bash
node web_server.mjs --host 127.0.0.1 --port 8765
```

Open:

```text
http://127.0.0.1:8765
```

The server reads and writes local runtime files under `data/`. Do not commit
those files, except for `data/.gitkeep`.

## Validation

Before opening a pull request, run the smallest relevant checks first. For a
general repository change, run:

```bash
node --check app.js
node --check web_server.mjs
node --check mcp/fleet_core.mjs
node --check mcp/fleet_mcp_server.mjs
node --test test/*.mjs mcp/fleet_core.test.mjs
```

For documentation-only changes, also check that public docs do not include
deployment secrets, private network details, or formal business data.

## Data Safety

Use synthetic data in tests, screenshots, examples, and issues. Do not include
real customer names, phone numbers, license plates, contract files, invoices,
payments, employee data, or deployment credentials.

## Pull Request Expectations

- Keep changes small and focused.
- Preserve the existing plain HTML, CSS, JavaScript, and Node.js structure
  unless there is a specific reason to change it.
- Do not add dependencies unless the benefit is clear and documented.
- Include tests for behavior changes.
- State exactly what was verified and what was not verified.

## Project Boundaries

This repository is the application source. Production deployment notes,
private operations history, credentials, and business records belong outside
the public repository.
