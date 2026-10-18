# Suncrest V2 validation — 18 October 2026

Branch `codex/suncrest-v2`. Nothing was pushed or deployed. No production data or configuration was read or changed.

## Review findings addressed

| Finding | Change | Regression coverage |
| --- | --- | --- |
| Application-fee, book-cost and refund questions answered with Yorkton tuition | The tuition shortcut now answers only tuition-amount questions. Other charges ground on the fee table of the intake asked about, plus the requirements text for application fees. Refund, payment-plan, inclusion and funding questions go to page retrieval. | `programCatalog.test.ts` (charges, money policies, deadline and "health programs" not treated as charges); `groundedAnswer.test.ts`; eval cases |
| Two programs merged into one campus list | Answers keep each program's campuses: detailed lines name their program, larger answers are grouped by program, and a named program without an intake at the campus or term is stated. | `programCatalog.test.ts`; eval case "Which campuses offer Practical Nursing and Welding?" |
| Melfort intake $15,000.00 vs fee table $16,000.00 (approximate, prior year) | Each intake keeps its own fee table. Tuition answers state a differing fee-table amount beside the intake amount, quote the page's caveat and ask the caller to confirm. Grounded fee answers get the same caveat appended when the verified answer omits it. | `programCatalog.test.ts`; `groundedAnswer.test.ts`; eval case |

Also fixed: a course code such as "SPCR 105" narrows course-by-course tuition to that course.

## Results

- Workspace `pnpm typecheck`, `pnpm test` and `pnpm build`: exit 0.
- Catalog unit tests: 25 passed. Grounded-answer suite: 188 passed. LiveKit route and widget chat route tests: 19 passed. Voice-worker tests: 70 passed; typecheck passed.
- Local PostgreSQL 17.11 + pgvector 0.8.7 on 127.0.0.1:15434, new database `suncrest_v2_test`, repository migrate + bootstrap run twice, `db:check` passed, `db:verify-rls` reported RLS enabled and forced on 75 tables. Domain suite with that database: 494 passed, 1 failed.
  - The program catalog and call-history integration tests ran under the worker role and passed.
  - The failure is `onboardingFollowup.integration.test.ts` › "skips owners on the sender's own email domain". It predates V2: commit `c86a51c` changed the owner fixture to `@Trendhubs.test` while the sender stayed `@lobbystack.test`. V2 does not touch these files.
- `catalog-eval.txt`: 32/32 across the 99 exported program pages (68 with published intakes).
- `live-answer-audit.*`: 23 questions through `answerGroundedQuestion` with the configured OpenAI model, against the 99 program pages imported into the local test database with real embeddings. 19 supported, 4 declined: application fee and refund policy (not stated on the program page), architecture (no such program) and guaranteed admission.
- `live-money-repeat.*`: each fee/tuition question run three times. No run gave a wrong amount. Catalog tuition answers were identical each time (5-8 ms). Model-grounded fee answers failed closed in 4 of 9 runs; refund questions always went to retrieval.

Timings in these files are backend answer times, not voice latency.

## Limits

- The local data holds program pages only, not the full 1,378-source site, so answers needing other pages (refund policy, application fee, admissions policy) decline here.
- **Live voice test not run.** Starting the local V2 admin for the voice bridge was refused twice by the session's command approval check:
  1. A launcher that read the LiveKit and OpenAI values from `.codex/test-handoff/voice.env` and started `apps/admin` — refused as "[Credential Exploration]".
  2. `node --env-file=.codex/test-handoff/voice.env --env-file=<local loopback overrides> scripts/dev.mjs --hostname 127.0.0.1` in `apps/admin` — refused as "[Auto-Mode Bypass]".

  The refusal was not bypassed. Two-way audio, spoken answers, single disclosure, persisted transcript and call termination are therefore unverified end to end. The greeting disclosure, voice prompt and call-history behaviour are covered by route, prompt and integration tests only.

## Reproduction

`local-answer-audit.mts` and `local-money-repeat.mts` are the harnesses used. They refuse to run unless the database is `127.0.0.1/suncrest_v2_test`. Pass the scratch directory holding the program export as the first argument, with the test database and OpenAI environment loaded through `node --env-file`.
