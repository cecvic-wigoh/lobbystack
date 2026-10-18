# Suncrest V2 production verification — 18 October 2026

## Release state

User explicitly authorized pushing both Suncrest V2 branches, deploying backend and voice worker, and testing production including voice. No application code was changed during this verification.

| Component | Deployed application revision | Verified deployment |
| --- | --- | --- |
| LobbyStack admin/backend | `06e7ba5c253bbc208893713dcf0e254a1ac87edc` | Railway `599a1e39-73db-46b4-9c5d-4e4c8e7ba09c`, SUCCESS |
| LobbyStack worker | `06e7ba5c253bbc208893713dcf0e254a1ac87edc` | Railway `51a32a04-e1a9-4eb3-a90e-81406fe0c153`, SUCCESS |
| LiveKit voice agent | `42aa3fc5103c7f8a2cb4c2442326224dafd88b46` | Agent `CA_QYUz6BvyPBiS`, active version `YELmMkh5Jw3v` |

Both repositories' `codex/suncrest-v2` branches were pushed. The configured Railway branch `codex/resend-email` was fast-forwarded to `06e7ba5` without force. The later evidence-only commit on this V2 branch does not change deployed application code. No environment changes or database migrations were performed.

Production demo: https://admin-production-ad1d.up.railway.app/en/demo/suncrest

## Result: deployed, but client-readiness signoff withheld

Production voice connected and completed; factual answers, follow-ups, interruption handling, transcript persistence, and cleanup worked in this synthetic call. Two answer-quality issues remain:

1. **Admissions contact phrasing fails.** “Who should I contact about admission to Suncrest College?” returned a generic cannot-confirm answer. “What is the admissions email address?” correctly returned `admissions@suncrestcollege.ca` with the contact page as source. This is phrase-sensitive answer/retrieval validation failure, rather than evidence that all contact knowledge is missing. Backend logs showed a `quote_mismatch` decline with nine evidence items, but no request-correlated trace was captured to conclusively associate that log with this exact question.
2. **Spoken fee qualification is incomplete.** Voice gave the Melfort $16,000 tuition, $700 annual fees, $252 annual health/dental figures, flagged the conflicting $15,000 domestic tuition, and asked the caller to confirm. It omitted the explicit warning that estimates are based on last year's program and can change. Chat retained that warning consistently.

These findings were reported without modifying product code or weakening grounding rules.

## Production browser chat

| Test | Result |
| --- | --- |
| Practical Nursing and Welding campus comparison | PASS: separate program/campus mappings and three program source links |
| Exact Melfort fee question, repeated three times | PASS: identical figures, discrepancy, prior-year estimate caveat, and source |
| Yorkton Practical Nursing application fee | SAFE DECLINE: did not confuse tuition with the application fee; exact application fee was not established by this test |
| General admissions contact question | FAIL: cannot-confirm response despite published contact information |
| Direct admissions email question | PASS: published admissions email and contact-page source |
| Capital of France | PASS: refused as unrelated to business information/services |

See [chat results](chat-results.txt) and [screenshot](chat-results.png). The live Practical Nursing page was checked against the fee answer. Its Melfort intake shows domestic tuition of $15,000 while its fee table shows $16,000; the agent should preserve and explain this source inconsistency rather than choose an unsupported current price.

## Actual production voice call

Call: https://admin-production-ad1d.up.railway.app/calls/7ee3d0db-bf34-4065-82f5-55b2d454bf8c

The test used prerecorded synthetic caller audio through the production public-widget session and LiveKit voice-session routes. It used normal public limits, no quota bypass, no human phone call, and no local replacement agent. Received agent audio and transcription were captured. This validates a real production audio exchange; it does not independently grade naturalness or every browser microphone/device configuration.

- Dashboard duration: **1 minute 59 seconds**; harness elapsed time including setup/cleanup: **123.218 seconds**.
- Correctly answered Practical Nursing campuses as Yorkton and Melfort.
- Resolved a contextual Melfort fee follow-up with the qualification limitation above.
- Interrupted the Yorkton tuition acknowledgment while the agent was speaking; agent switched to the Medical Laboratory Assistant start-date question and answered August 26, 2027 at Yorkton.
- Identified itself as AI in the opening, and again when explicitly asked whether it was a real person.
- Saved the full transcript and completed state in the dashboard.
- End-session request returned HTTP 204; the specific LiveKit room was subsequently absent from the room list.

Measured from caller speech end: first agent audio took approximately **0.8–3.6 seconds**. Substantive factual answer audio began approximately **4.8–6.6 seconds** after caller speech ended. Acknowledgments are not counted as substantive answers.

Evidence: [recording](voice-call.mp3) (caller left, agent right), [event timeline](voice-timeline.json), [saved dashboard transcript](dashboard-transcript.txt), [transcript screenshot](voice-transcript.png).

## Automated checks and limits

- Catalog unit tests: **26 passed**; two opt-in integration tests skipped in this run.
- Voice worker: TypeScript check passed; **70 tests passed**.
- Whitespace/diff checks passed.
- Existing exact-revision build/full-test evidence from Claude was reviewed rather than rerunning every suite against production.
- A previously identified onboarding integration fixture sender-domain mismatch remains outside this V2 verification; do not interpret this report as an all-repository test-suite pass.
- No email-delivery, real telephone handoff, load test, or long-duration reliability test was performed in this run.
- Existing generated `apps/admin/next-env.d.ts` working-tree modification was left untouched and excluded from the evidence commit.

Evidence files contain synthetic test conversation and routine business information. Credential-pattern checks were run before committing; session tokens and credentials were not included.
