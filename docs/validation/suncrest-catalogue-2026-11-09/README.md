# Shared catalogue retrieval and Suncrest browser validation — 9 November 2026

## Change

Course discovery now reads a business-scoped catalogue from active indexed program/course pages and course-provider product pages. It uses published category links and curriculum relationships, not a generated guess or a handful of vector-search excerpts. The Suncrest corpus contains 1,311 catalogue entries: 99 program pages, 1,163 course pages and 49 training-product pages, with 14 published category labels. These counts describe indexed entries, not distinct currently open courses.

Lists are paged (five entries for voice, eight for chat), include sources, and distinguish catalogue presence from enrolment availability. Category selection and continuation retain their filter. Explicit new broad questions reset browsing; topic changes do not reuse stale pagination. Natural continuations such as “show more Business courses” advance the correct list. A category can follow an interrupted list; an interrupted spoken page is restarted rather than skipping unheard entries. Ordinal requests such as “the first one” resolve only to a current indexed item from the last listed page and then use the existing grounded detail/requirements path.

The shared `answerGroundedQuestion` entry point covers browser chat and LiveKit voice for all tenants, including businesses without “College” in their name. The shared `searchKnowledge` tool also uses the same resolver with per-call browsing state, covering the worker's receptionist agent. Businesses without eligible catalogue sources retain their existing grounded lookup. No schema change, re-crawl, new provider, or Suncrest-only rule was added.

The loader checks business ownership, active/indexed status and current revision membership. Its parsed cache is scoped by business, invalidated by source/revision changes, and bounded to 32 businesses. Source text stays untrusted reference material. Published titles and categories are preserved; generic “Learn More” navigation and enrolment calls-to-action are not treated as category or availability claims.

## Verification

Focused tests cover the user's exact failures, category selection, paging without repeats, explicit catalogue reset, subject isolation, ordinal follow-ups, topic switches, interrupted-list recovery, basic French catalogue continuation, source ownership, active/revision invalidation, and cache isolation. Existing programme requirements, fee caveats, search and call-control checks remain included. Final deployment and live browser/API/audio evidence are recorded alongside this report.

Source checkouts retain their existing branches and working-tree changes. No new commit was created.

## Detail follow-ups

An ordinal such as “the first one” is resolved against the last displayed page and validated against the current source catalogue. Its source URL pins both programme matching and fallback passage retrieval, so similarly named Certificate/Diploma pages do not get combined. Category matching excludes function words (including “for” in “Skills for Success”). A live-index check verifies the Business Certificate follow-up can be answered by copying its published requirements without a model draft or paraphrase.

The focused suites currently pass 288 agent-core tests, 86 catalogue/programme/search tests, and nine worker call tests. The original local `.log` outputs are ignored by Git; source tests and the committed acceptance JSON capture the results. Fresh workspace-wide checks are recorded in `../../handoff/verification-2026-11-15.md`. All new catalogue behaviour is in the shared domain/agent core; the voice worker's audio, phone pronunciation and interrupted-transcript code are unchanged.


## Voice follow-up correction

A recorded candidate call exposed an additional failure: the voice model sent “What categories of courses does Suncrest offer? Business courses.” and then appended “Show more.” on the next tool call. A generic category-menu match took priority over the explicit Business selection. The shared resolver now gives a named published category priority; a regression covers both the concatenated category selection and its continuation. The failing candidate is retained separately from final acceptance and is not counted as a pass.


The browser replay also caught a broad question after a filtered page being interpreted as continuation because it contained “other.” Explicit “more”/“next” continuations still advance, while “Okay, what other interesting courses are there that I can study at Suncrest?” resets to all published areas. This scenario is included in the final API/browser/voice replays.


## Final deployment and browser/API results

Final Railway deployments are admin `999121a9-0f25-4993-a985-7aa42efa8736` and worker `bc779691-60f4-416e-9a16-e586c9a5b174`, both `SUCCESS`. The admin readiness endpoint returned HTTP 200 with database and storage checks passing. One local readiness request timed out during rollout before the final test run; earlier browser testing also observed a transient request failure during a candidate rollout. Those attempts are not counted as successful checks.

All 15 final API cases pass, using actual internal response and transcript-event endpoints with a synthetic billing-excluded QA call. The synthetic API call was removed after the run. These cases include both original questions, category menus/selection, paging without duplicate sources, individual-course/program filters, the Business Certificate requirements follow-up with its source pinned, unrelated-business isolation, concatenated voice-tool questions, and broad reset after Business paging.

The actual Suncrest browser chat passed both original questions on the final deployment. The first was also replayed immediately after a Business list to prove that it resets to all areas. Category switching, pagination, the concatenated voice-tool query, and Business Certificate ordinal requirements were exercised in the same browser conversation. The retained browser transcript includes earlier candidate failures as well as the final successful replays; final claims refer to the last matching replay. `browser-catalogue-final.jpg` shows the final exact list question and eight sourced entries.

Shared automated regression checks cover tenant scoping and shared entry points; live tenant verification in this report is Suncrest only. Category membership comes from explicit published links/curriculum relationships. Entries without those links remain available in the all-areas list. Neither an index entry nor a listed intake guarantees that enrolment is currently open. This is scoped catalogue validation, not certification of every platform workflow or every tenant.


## Final recorded voice results

Two real WebRTC QA calls completed against the deployed voice agent and shared backend. Call `08d92ff0-33d2-4584-97d3-85d3d2ba96fa` replayed both exact course-list questions; call `a75471b3-2f09-49ba-8ab4-b5ad9df8db6a` requested categories, selected Business, continued to entries 6–10, and then reset to all areas using the original “other interesting courses” question. All expected answers appear in the received audio and the saved final transcripts (seven and eleven turns respectively). Both calls were internal QA and excluded from billing.

The received agent audio was isolated from each stereo recording and independently transcribed without answer hints. It confirms both broad lists, Business pages 1–5 and 6–10, and the subsequent all-areas reset. This verifies semantic catalogue answers; it is not a phonetic certification of every course code or place name. Audio: `voice-exact.mp3` and `voice-categories.mp3`. Detailed saved transcript/audio comparison: `voice-verification.json`.

Total scoped automated verification: 383 tests (288 agent core, 86 catalogue/programme/search, nine worker call tests), plus successful builds/type checking and production image builds. Final API: 15/15. Browser and two recorded voice calls: passed. PSTN calls and human transfers were not tested in this task; these voice calls use the deployed WebRTC runtime. The LiveKit agent runtime remains `gcWEGTtmsk6m`; this release changes the shared backend catalogue logic.


Temporary database QA proxy removed after verification; PostgreSQL proxy listing is empty. Final readiness and deployment identities were rechecked after cleanup. `git diff --check` passes.
