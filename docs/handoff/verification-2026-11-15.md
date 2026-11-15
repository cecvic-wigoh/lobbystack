# Developer handoff verification — 15 November 2026

| Check | Result |
| --- | --- |
| Backend `pnpm test` | 2,514 passed; 102 skipped |
| Backend `pnpm typecheck` | Passed, including scripts |
| Backend `pnpm build` | Passed; 32 localized public routes verified and widget loader copied |
| Voice standalone frozen install, pnpm 11.23.0 | Passed; pinned SDK/plugin patches retained |
| Voice `pnpm test` | 126 passed across 15 files |
| Voice `pnpm typecheck` | Passed |
| Original control-plane web tests | 84 passed across 18 files |
| Original control-plane web typecheck | Passed |
| Original control-plane web production build | Passed |

## Scope and limits

Checked locally on 15 November 2026 with Node 26.9.0. Production/CI pin different Node versions (backend CI 22.12; voice/control-plane CI/Docker 24); passing local checks does not replace those CI environments. This was a source/documentation handoff, not a new runtime release or new live-call acceptance run.

The last detailed Suncrest browser/API/WebRTC acceptance is dated 10 November in the backend's catalogue validation directory. Deployment readback on 15 November confirmed admin `999121a9-0f25-4993-a985-7aa42efa8736`, worker `bc779691-60f4-416e-9a16-e586c9a5b174`, Crawl4AI `70b3223d-f91c-4999-89d5-7df87bffaaa0` all SUCCESS, and LiveKit `gcWEGTtmsk6m` Running. These are prior CLI releases, not a claim that this handoff commit has been deployed.

Database/RLS integration suites that require dedicated services were not supplied a fresh test database; backend test output reports 102 skipped tests. No production migration, restore, provider billing/booking mutation, PSTN/staff-transfer test or new crawl was run for this handoff. The unchanged marketing frontend and preserved legacy standalone workspace were not rebuilt. Their source and existing configuration remain in Git.

Publication checks: modified/untracked textual files were scanned for common high-confidence private-key/API-token patterns (no findings), and new JSON evidence was inspected for populated credential fields (none). This targeted scan is not a complete security audit. Provider credentials, ignored `.env` files, temporary operator scripts/logs and generated OCR caches are excluded. Committed evidence contains test/business facts rather than provider credentials.

`git diff --check` and relative Markdown links in the handoff documents were checked before commit. The voice handoff pins the saved backend commit so the two-repository checkpoint can be reproduced. Save future paired source SHAs together with exact deployed version IDs.
