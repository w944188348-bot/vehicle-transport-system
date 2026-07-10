# Open Source Safety Audit

Date: 2026-07-10

## Conclusion

The current working tree has been prepared for public review, but the full Git
history should not be pushed directly to a public GitHub repository.

Use one of these publication paths:

1. Create a clean export branch with a new root commit from the sanitized tree.
2. Create a fresh public repository from an archive of the sanitized tree.
3. Rewrite history only after explicit maintainer approval.

The reason is that earlier private documentation commits contained deployment
details that are no longer present in the current tree but remain recoverable
from normal Git history.

## What Was Changed For Public Safety

- `README.md` was rewritten for open-source users and no longer carries private
  deployment history.
- `AGENTS.md` was rewritten as public maintainer and agent guidance.
- `SECURITY.md`, `CONTRIBUTING.md`, and `LICENSE` were added.
- Internal operation wording was removed from the obsolete-code audit note.

## Scan Summary

Commands run during this audit:

```bash
git status --short
git ls-files
find . -maxdepth 3 -type f \( -name '.env*' -o -name '*credential*' -o -name '*secret*' -o -name '*key*' -o -name '*token*' -o -name '*admin*' \) -not -path './.git/*' -print
rg -n -i "password|passwd|secret|token|private key|BEGIN (RSA|OPENSSH|EC|DSA)|cookie|authorization|api[_-]?key|ssh|credential" --glob '!data/**' --glob '!node_modules/**' --glob '!*.bak' .
git log --all --name-only --pretty=format:'commit %H' -- data
git log --all --name-only --pretty=format:'commit %H' -- '*secret*' '*credential*' '*key*' '*token*' '*admin*'
```

Findings:

- Working tree was clean before the audit document was created.
- Tracked `data/` history contains only `data/.gitkeep`.
- Local runtime authentication files exist under ignored `data/`, but they are
  not tracked by Git.
- Secret-like words in tracked source are expected authentication code,
  password UI labels, security guidance, and audit guidance. No actual secret
  value was found in the scanned text output.
- Private deployment terms were removed from the current public-facing docs.

## Remaining Risks

- Git history still contains earlier private deployment documentation. Do not
  publish this branch with full history as a public repository.
- Binary presentation files and images were not OCR-reviewed in this pass. If
  the public repository must be strict, review or remove those assets before
  publication.
- The repository contains authentication code that creates local credentials on
  first use. This is expected behavior, but public users need to keep generated
  `data/` files private.

## Recommended Publication Flow

1. Finish final syntax and test verification on the sanitized tree.
2. Create a clean export branch or a fresh repository from the sanitized tree.
3. Push the clean export branch to a private GitHub repository first.
4. Review the GitHub page, file list, and rendered docs.
5. Switch the GitHub repository to public only after that review passes.
