# Security Policy

## Supported Use

This project is intended as a self-hosted vehicle transport management system.
The repository should contain source code, tests, examples, and documentation
only. Runtime data and deployment secrets must stay outside Git.

## Do Not Commit

Do not commit or disclose:

- `data/` runtime files, except `data/.gitkeep`
- passwords, password hashes, cookies, tokens, private keys, API keys, or SSH keys
- formal customer, vehicle, employee, invoice, contract, or payment records
- production hostnames, private network addresses, backup paths, or deployment credentials
- generated logs, local database snapshots, browser exports, or temporary release archives

The default `.gitignore` excludes `data/*`, `node_modules/`, `.codegraph/`, logs,
and local operating-system files. Keep those protections in place.

## Local Authentication Files

On first local use, the application may create local-only authentication files
under `data/`. These files are deployment-specific and must not be copied into
issues, pull requests, examples, screenshots, or documentation.

## Reporting a Vulnerability

If you find a security issue, do not include secrets or real business data in
the report. Share a minimal reproduction, the affected file or endpoint, and
the expected impact. If the issue involves sensitive deployment details, report
it privately to the project maintainer instead of opening a public issue.

## Public Demo Data

Use synthetic data for demos, screenshots, tests, and bug reports. Replace real
names, phone numbers, license plates, customer names, contract files, invoices,
and payment details before sharing anything publicly.
