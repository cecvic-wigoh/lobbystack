# Suncrest V2 admissions and spoken-fee fixes

Verified on production on 18 October 2026. Both requested regressions passed in chat and in an actual production audio call.

## Deployed revisions

| Component | Application revision | Deployment |
| --- | --- | --- |
| Admin/backend | `7c548038fa5641c05fd34ba29e814b264a8650a3` | Railway `05708f3f-36df-4e55-9255-abcc1f8165bc` — SUCCESS |
| Railway worker | `7c548038fa5641c05fd34ba29e814b264a8650a3` | Railway `dced527e-8797-4fa3-a070-e9e88dc6bc7c` — SUCCESS |
| LiveKit voice worker | `c74e4ff3946492924191f9a9a0dcd7cd85bc6349` | Active version `KFzbY2nVR7hS`, Running |

Both fixes were pushed to the respective repositories' `codex/suncrest-v2` branches. The backend's configured `codex/resend-email` release branch was fast-forwarded without force. No credentials, environment settings, database migrations, or public limits were changed.

## Changes and regression proof

General college admissions contact requests now read the unique email from the stored, explicitly headed Admissions & Applications Inquiries section on the contact page. Contact details are not hard-coded. Missing or ambiguous sections, other source paths, specific program/student-group questions, and extra unrelated requests fall back to existing factual validation. The regression tests failed before the fix and passed afterward.

Voice previously had a general 25-word brevity preference that competed with preserving the complete verified fee answer. Verified lookup answers now explicitly take precedence over that preference, including every estimate/prior-year/change warning, source discrepancy, and confirmation instruction. The prompt regression failed before this change and passed afterward. Resolving conflicting instructions follows the [official OpenAI voice prompting guidance](https://developers.openai.com/api/docs/guides/voice-prompting); production behavior, rather than guidance alone, establishes the result below.

Automated verification: **199 agent-core tests, 26 program-catalog tests, and 71 voice-worker tests passed**. Agent-core and voice-worker TypeScript checks and diff checks passed. Railway's production builds and health checks completed successfully.

## Production chat

[Demo](https://admin-production-ad1d.up.railway.app/en/demo/suncrest)

All three questions returned the same published email and `https://suncrestcollege.ca/contact-us` source:

1. “Who should I contact about admission to Suncrest College?”
2. “Who do I contact for admissions?”
3. “What is the admissions email address?”

Answer: “For general admissions and applications inquiries, email admissions@suncrestcollege.ca.”

“What are the fees for Practical Nursing in Melfort?” retained the $16,000 total tuition, $700 annual fees, $252 annual health/dental, conflicting $15,000 intake tuition, full prior-year estimate/change warning, and confirmation advice.

“What is the capital of France?” was refused as outside business information/services.

See [chat transcript](chat-results.txt) and [chat screenshot](chat-results.png).

## Production voice

[Saved call](https://admin-production-ad1d.up.railway.app/calls/d5b53d85-7809-4b4f-9415-00f7cb78133d) — dashboard duration **2m 48s**, completed with persisted transcript. Harness duration including setup and cleanup: **170.843 seconds**.

The synthetic caller used the real public widget/session routes and published audio into the production LiveKit room. Agent audio was received and recorded; no replacement local agent or public-limit bypass was used.

Admissions answer spoken:

> For general admissions and application questions, please email admissions at suncrestcollege dot ca.

Melfort fee answer spoken:

> At the Melfort Winter 2027 intake, the fee table lists total tuition as sixteen thousand dollars. It also shows fees of seven hundred dollars per year, and a health and dental fee of two hundred fifty-two dollars per year.
>
> There’s a discrepancy: the intake listing shows domestic tuition as fifteen thousand dollars, while the fee table shows sixteen thousand dollars. The fee table also notes these amounts are approximate, based on last year’s program, and may change at any time, so please confirm the current amount with the college.

The call also answered the Practical Nursing campus question, resolved the contextual Melfort follow-up, accepted an interruption during speech and switched to the Medical Laboratory Assistant start date (August 26, 2027, Yorkton), identified itself as AI when asked, and said goodbye.

First acknowledgment audio began about **1.8–3.4 seconds** after caller speech ended for factual questions. Substantive answer audio began about **7.4–8.7 seconds** after caller speech ended. These are separate from the duration needed to speak the complete answer; no claim of a latency improvement is made.

The test room `lobby-4a2bfabb-a433-4408-aac1-e0b062fac2ca` was absent afterward and the dashboard showed a completed timestamp. The harness's final delete request returned 404 because the room was already absent; this was not a successful 204 delete assertion. No active test room was left behind.

Evidence: [recording](voice-call.mp3) (caller left, agent right), [event timeline](voice-timeline.json), [persisted dashboard transcript](dashboard-transcript.txt), [completed call](call-completed.png), [spoken warning screenshot](voice-fee-warning.png), [deployment record](deployments.json).

## Limits

This is focused regression verification, not a load test or a guarantee of every future model response. Voice naturalness and all browser/device microphone configurations were not independently graded. One short synthetic “Hi” was transcribed as a Chinese greeting, but subsequent English questions and answers remained in English. The existing generated `apps/admin/next-env.d.ts` modification was left untouched. The unrelated known onboarding fixture failure was not changed or reclassified as passing.

Evidence contains synthetic conversation and routine business contact information; credential-pattern checks were run before committing. The evidence-only follow-up commit does not alter the deployed application revisions above.
