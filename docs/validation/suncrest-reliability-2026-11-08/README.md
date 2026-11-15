# Suncrest reliability fixes — 8 November 2026

Suncrest's knowledge and browser voice fixes are deployed. Fresh-content verification accounts for all 1,729 previously active website sources: **1,683 match the fresh extracted content; 46 unavailable or navigation-only sources are quarantined**. The 80 previously disabled sources retain their original activity, status, revision and content hash. No source documents or historical chunks were deleted for quarantine.

## Deployed changes

- Preserve nested admission sections, complete academic alternatives, English-language conditions and wrapped Crawl4AI fee tables. Use deterministic published readouts when the source provides a bounded, complete requirements block.
- Retrieve an exactly identified course's prerequisite section before answering; preserve registration and eligibility conditions, and disclose a published enrollment closure. This fixes NFPA 1140 Level I without substituting another course or level.
- Consistently explain that the receptionist cannot guarantee a personal admission decision.
- Speak configured greetings and verified answers through TTS without a second voice-model rewrite. Complete the tool call with an empty result so subsequent questions do not see a dangling lookup. Cancellation still suppresses an obsolete readout.
- Preserve existing content if an indexed source changes revision or is disabled during refresh.
- Use the explicit Crawl4AI PDF strategy. Correct the shared PDF extractor so page-counter-only text triggers the existing OCR fallback.

The attempted optimization that substituted the latest raw transcript for a tool question was removed after a live test exposed a timing race. It is absent from the final voice release.

## Release identifiers

| Service | Deployed version | State |
| --- | --- | --- |
| Railway admin | `303222a8-2982-4e9e-b992-1240223389a5` | SUCCESS |
| Railway worker | `2b118b06-e152-43fe-8940-8df1068456e5` | SUCCESS |
| Railway Crawl4AI | `70b3223d-f91c-4999-89d5-7df87bffaaa0` | SUCCESS |
| LiveKit voice agent | `eobvGYjPZ89F` / `CA_QYUz6BvyPBiS` | Running |

Admin readiness returned database and storage OK. The worker passed its deployed readiness health check. Both checkouts remain on `codex/suncrest-v2`; releases used working-tree snapshots. This task did not create a Git commit, push or PR, or run a schema migration.

## Verified outcomes

| Check | Result |
| --- | --- |
| Electrician admission requirements, repeated | Grade 11, all three math alternatives, exclusion of Modified/General Math credits, and English-language condition returned and heard twice |
| Practical Nursing requirements | 65%, all math/science/social-studies alternatives and English-document deadline heard |
| Melfort Practical Nursing fees | **$16,500 tuition**, **$700 annual fees**, **$252 annual health/dental**; approximation, prior-year basis and change warning returned and heard |
| Medical Laboratory Assistant requirements | All academic alternatives, earlier Saskatchewan courses, 25 wpm, 90% accuracy, five-minute test/report and language conditions heard |
| NFPA 1140 Level I | Eligible emergency-service membership, ICS 100, email/registration conditions and not-open-for-enrollment caveat returned and heard |
| AI disclosure | Heard at the start of all three final calls |
| Interruption | Fee readout stopped; caller switched to MedLab and heard the correct August 26, 2027 start |
| Unpublished program / admission guarantee / unrelated business | Safe unknown or out-of-scope responses; no invented confirmation |

The final 24 deployed backend checks passed explicit content/outcome assertions: 18 supported answers, four unknowns and two out-of-scope refusals. Median **255 ms**, p95 **5.51 s**, maximum **5.81 s**. The original 24-check run had median 2,004 ms, p95 9,933 ms and maximum 17,088 ms. These are small-sample HTTP timings; they do not measure complete voice latency.

### Final recorded calls

| Scenario | Call ID | Completed duration |
| --- | --- | --- |
| Public widget: contact, Electrician, repeat, Nursing | `78b0e5e4-bef9-45d3-893c-7e532453f0ac` | 240 s |
| Internal QA: fresh fees, NFPA and MedLab | `402ee66d-e125-40e1-bf18-899bc738b5a8` | 201 s |
| Internal QA: follow-up, interruption and identity | `271ce07e-3be5-45cf-97f0-39e719c28ecd` | 115 s |

Each call has a completed persistence record and an independent transcription of the received agent audio. The two internal QA calls are excluded from billing. Repeated public sessions correctly reached the widget rate limit; customer limits were unchanged. Internal QA used the same deployed agent and production context/respond/transcript endpoints, with authenticated SDK setup instead of the public session-start route.

One harness wait timed out because it expected an exact structured heading for the repeat answer. The actual repeated answer used a valid alternate heading and contained every required option; independent audio verification confirmed its completeness. Intermediate failed calls were retained under `.tmp/suncrest-readiness-2026-11-08/` and are excluded from final acceptance.

## Safe recrawl and shared regression coverage

The crawl was staged before replacement. A validated, permission-restricted rollback archive contains all 1,809 original website documents and their chunks/vectors at `.tmp/suncrest-readiness-2026-11-08/recrawl/rollback.ndjson.gz`. Promotion used the existing cleaner, chunker, embedding configuration and transactional indexer, bounded concurrency and source revision guards. The embedding model/fingerprint did not change. Disabled sources were never reactivated.

Crawl4AI handled public HTML and PDF sources. One download-only DOCX used the existing DOCX extractor; a scanned seven-page form used the existing bilingual OCR fallback after its page-counter bug was fixed. Unavailable/empty sources were rechecked before quarantine. All 1,729 original active sources are accounted for, with zero content-hash mismatches among the remaining active sources. The ingestion job now records the Crawl4AI provider, completion and quarantine counts, and the business snapshot was refreshed.

**1,024 automated tests passed:** domain 462, agent-core 271, worker 101, providers 89, voice 101. The domain suite skipped 76 database integration tests because their test database was not configured. Relevant type checks and production builds passed; both source trees pass `git diff --check`.

Eleven deployed cross-business checks covered Shercom and CertNova. Shercom returned its product, material, warranty and price-condition information; unrelated Suncrest requests were refused. CertNova overview/contact and tenant isolation checks passed. Its CBA pricing request safely asked a clarification, so this pass does not certify a complete CertNova pricing answer. Their website document counts remain 79 (55 active) and 190 (190 active), respectively; this refresh wrote only Suncrest knowledge.

## Remaining production gates

- Suncrest has no configured phone-number records. **PSTN/carrier calls and real staff transfers remain untested.** These recordings validate browser WebRTC voice.
- The realtime model still adds some “let me check” preambles; substantive audio latency remains longer than backend retrieval latency. This needs a focused voice-routing improvement before promising a strict response-time SLA.
- An interrupted stored assistant transcript can contain text beyond what was audible. Received audio is the evidence for what was heard; exact heard-text alignment is not certified.
- This pass covers Suncrest knowledge retrieval and browser voice. Signup, time-zone UI, platform-admin onboarding, CRM completeness, sustained load/failure recovery and a recurring source-freshness policy need separate acceptance checks.

## Diagnostic cleanup

The temporary refresh service was removed from production, the temporary crawler public domain and PostgreSQL TCP proxy were deleted, and temporary local SSH key files were removed. No SSH key was registered. The private crawler connection and production services remain configured. See [cleanup record](cleanup.json).

## Evidence

- [Backend acceptance](backend-acceptance.json) and [responses](backend-after.json)
- [Audio acceptance](audio-acceptance.json), [call records and received-audio transcripts](persistence-and-audio-after.json)
- [Main audio transcript](voice-after-audio.txt), [facts audio transcript](voice-facts-after-audio.txt), [interruption transcript](voice-interruption-after-audio.txt)
- [Recrawl verification](recrawl-verification.json), [quarantined URLs and reasons](quarantined-sources.json), [final refresh state](final-refresh.json)
- [Railway deployments](railway-deployments-final.json) and [LiveKit deployment](voice-deployment-final.json)

Raw recordings and timelines remain in `.tmp/suncrest-readiness-2026-11-08/voice-after/`, `voice-facts-after/` and `voice-interruption-after/`.
