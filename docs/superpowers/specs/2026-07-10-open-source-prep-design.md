# Open Source Preparation Design

## Goal

Prepare the vehicle transport system repository for safe publication on GitHub without pushing code, changing production services, touching credentials, or modifying runtime data.

## Scope

This preparation covers public-facing repository hygiene only:

- Replace deployment-heavy README content with an open-source overview, local startup steps, testing commands, and data-safety guidance.
- Add standard open-source project files: `LICENSE`, `SECURITY.md`, and `CONTRIBUTING.md`.
- Keep production deployment details, private network addresses, backup paths, SSH key notes, and formal account names out of public-facing docs.
- Add a local audit note that records what was scanned and what remains intentionally private.
- Run the smallest relevant validation before closing the task.

## Non-Goals

- Do not create or push to a GitHub repository.
- Do not publish the repository publicly.
- Do not change production config, production data, NAS services, SSH keys, credentials, or user accounts.
- Do not rewrite application logic unless a concrete public-safety issue is found in tracked source.

## Approach

The repository will keep the existing Node.js, static frontend, MCP, and test structure. The open-source preparation focuses on tracked documentation and metadata, while preserving `.gitignore` protection for `data/` runtime files. Sensitive local files such as `data/auth-secret.key` and `data/bootstrap-admin.txt` stay untracked and are documented as local-only runtime artifacts.

## Verification

Verification should include:

- `git status --short`
- tracked file review with `git ls-files`
- current sensitive-word scan excluding `data/`
- Git history scan for `data/` and secret-like filenames
- `node --check app.js web_server.mjs mcp/fleet_core.mjs mcp/fleet_mcp_server.mjs`
- `node --test test/*.mjs mcp/fleet_core.test.mjs`

## Success Criteria

- The branch contains only open-source preparation changes.
- Public-facing docs no longer expose private deployment details.
- Runtime data and local credential files remain ignored and untracked.
- Tests and syntax checks pass, or any failure is reported with exact command output and risk.
