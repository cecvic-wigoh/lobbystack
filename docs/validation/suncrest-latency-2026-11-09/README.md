# Suncrest spoken-answer latency and phone accuracy — 9 November 2026

## Scope

Deploy the shared voice worker and the grounded-answer backend, then compare real received Suncrest audio with the previous runtime. Preserve knowledge grounding, complete answers, interruption handling, and action confirmation. No recrawl or schema changes are part of this release.

## Diagnosed causes and fixes

The pinned OpenAI LiveKit plugin used `response.arrayBuffer()` before emitting any PCM, making playback wait for the entire synthesis HTTP response. A direct provider probe measured first PCM at 1,084 ms but full completion at 5,401 ms for the Electrical requirements text. The installed-plugin regression test reproduced the delay by withholding HTTP EOF; it failed before the patch and passed afterward. The patch now emits PCM incrementally and flushes the final partial frame. Source, ESM and CJS builds are covered by the standalone lockfile and Docker build.

The admissions contact request fell through to generated grounding because Crawl4AI preserved plain, wrapped contact labels rather than Markdown headings. The backend now recognizes both formats and reads the exact current admissions section using a business-scoped lexical source search, without an embedding or language-model round trip. It preserves published contact details, rejects conflicting sections, and leaves specialized or compound questions on the grounded path. Existing catalog handling also covers explicitly repeated program requirements.

The shared TTS adapter now pronounces formatted North American phone numbers and +1 E.164 as individual digit words. This makes both adjacent eights in `866 638 8618` explicit. Captions and persisted canonical contact facts keep the original number; speech synthesis receives the pronunciation text. French calls use French digit words. Prices, percentages, dates, course codes, and email addresses are unchanged.

TTS first-byte timing is now logged with existing turn, model, and backend lookup metrics. No transcript text is added to these timing logs.

## Validation method

A fresh baseline WebRTC call was made before deployment. The final main call reuses the exact baseline caller clips. Additional calls exercise fees, NFPA prerequisites, Medical Laboratory requirements, barge-in, and hang-up. The calls run against deployed runtimes with real LiveKit audio, synthetic callers, billing-excluded internal QA sessions, and no customer contact creation or notifications. Received audio is recorded and independently recognized, then compared with persisted transcripts. Estimated live captions alone are not accepted as proof of spoken words.

Latency is measured from the end of caller audio to the first received agent speech; scripted inter-question waiting is excluded. Small-sample measurements do not establish a production SLA.

## Evidence

Final deployment versions, exact call IDs, per-question latency comparisons, test counts, independent audio transcripts, and persisted turns are in the accompanying evidence files. Full recordings and diagnostic logs are local under `.tmp/suncrest-latency-2026-11-09/` in this checkout.

## Operational limits

Live voice certification here covers Suncrest through WebRTC. Other tenants are covered by shared code and regression tests, not new live calls. Suncrest's PSTN route and staff transfer cannot be certified without a configured phone line. Recognition near interrupted word boundaries remains an estimate; unavailable recognition is explicitly marked. Both pinned SDK patches must be reviewed when upgrading LiveKit.

## Final results

Shared LiveKit agent `CA_QYUz6BvyPBiS` version `gcWEGTtmsk6m` is Running. Railway admin deployment `6becc7bc-a8fa-42ea-9f5a-4a9fa6e5907d` is SUCCESS and passed `/api/health/ready` before the final calls. Source working trees and base commits are recorded in `source-state.json`; no new commit was created.

| Main question | Fresh baseline | Final release |
|---|---:|---:|
| Admissions contact | 9.449 s | 2.422 s |
| Electrical requirements | 6.909 s | 3.390 s |
| Repeat Electrical requirements | 5.640 s | 2.299 s |
| Nursing requirements | 9.009 s | 2.898 s |

Main factual-answer median fell from **7.959 s to 2.660 s**, a **66.6% reduction**. Additional final answers started at 3.294 s for fees, 5.773 s for NFPA prerequisites, and 2.916 s for Medical Laboratory requirements. NFPA remains the slowest measured factual case; no fixed latency guarantee is claimed for untested queries or production load.

The contact readout was independently recognized as **866-638-8618** by both `gpt-4o-mini-transcribe` on the full received recording and `gpt-transcribe` on the extracted contact clip, with no expected-number prompt supplied. The canonical persisted number is also correct. The short proof clip is `admissions-contact.mp3`; its second independent result is `phone-audio-verification.json`.

Full Electrical requirements (including every math option), Nursing requirements, fee amounts and caveats, NFPA prerequisites/closed-enrollment warning, and Medical Laboratory typing and language requirements were retained in received audio. The facts caller spoke during the end of the greeting; that greeting was correctly marked interrupted. The other main call provided the complete AI disclosure. The harness now waits for the disclosure caption before advancing from the greeting.

Automated validation passed **126 voice tests**, **276 agent-core tests**, and **60 focused catalog/search tests**, plus the applicable TypeScript builds/type checks. All **24 deployed backend cases** passed (18 supported, four unknown, two out of scope); API median 343 ms, p95 5,140 ms, maximum 5,587 ms. Those API measurements are distinct from spoken-answer timing.

All four final QA calls completed with ordered transcripts and billing exclusion. Barge-in saved only `Practical Nursing, Melfort, Winter 2027 fee table. Tuition total. [interrupted]`; the replacement Medical Laboratory question was answered correctly. Hang-up saved `Practical Nursing, Melfort. [interrupted]`. The independent full-call recognizer disagreed around the cut-off fee numeral; no complete amount was persisted. Numeric fragments at interruption boundaries are not certified as word-perfect.

Final acceptance assertions and call IDs are in `acceptance.json`; current persisted turns are in `persistence-and-audio.json`. `runtime-timings.json` includes only the final four call IDs and timing fields. The short contact proof clip is [admissions-contact.mp3](/Users/cec-mac/kai-projs/suncrest-lobbystack/docs/validation/suncrest-latency-2026-11-09/admissions-contact.mp3).

The isolated received fee fragment was also independently transcribed as “Practical Nursing, Melfort, Winter 2027 fee table. Tuition total.”, corroborating the persisted interrupted prefix; see `interrupted-audio-verification.json`.

Final post-test deployment checks confirmed the same Running voice version and successful admin deployment. Temporary database TCP access was deleted, with an empty final proxy inventory.
