# Suncrest voice reliability verification — 9 November 2026

## Release

Shared LiveKit worker `CA_QYUz6BvyPBiS`, version `DzcUbCTmdvFX`, deployed and Running. Runtime source: `/Users/cec-mac/kai-projs/ai-receptionist`, branch `codex/suncrest-v2`, based on `5374bbf` plus working-tree changes. Backend: `/Users/cec-mac/kai-projs/suncrest-lobbystack`, branch `codex/suncrest-v2`, based on `fe1c095` plus the previously deployed knowledge fixes. This release changed the shared voice worker; the Railway backend and knowledge corpus were not redeployed or recrawled for this voice-only task. No schema migration was needed. Changes remain uncommitted.

## Changes and evidence

Lookup turns no longer speak a generated acknowledgement before the verified answer. The realtime model produces text, the generation filter preserves tool execution and suppresses messages on lookup-only turns, and the existing TTS speaks the backend's verified response. Ordinary conversation and booking/transfer notices remain allowed. This applies to all businesses using the shared LobbyStack voice path; other live tenants were not called during this focused Suncrest run.

LiveKit 1.9.3's direct TTS interruption path committed the full generated answer. Its synchronized caption can also run ahead of actual playback. A pinned source/ESM/CJS patch now prevents that text from being committed. The worker captures outgoing PCM in memory, cuts it at the output playback position, and recognizes only that played fragment. Interrupted turns are marked `[interrupted]`; unavailable recognition is explicitly marked instead of substituting the full answer. Sequence numbers are reserved before asynchronous recognition, and shutdown flushes pending transcript writes. Hang-up recovery only falls back to a uniquely owned audio capture, avoiding cross-speech attribution.

Audio capture is bounded to five minutes per utterance and discarded after playback; this production path does not save audio files. Recognition uses the existing OpenAI connection and a five-second timeout. It adds a transcription request only for interrupted speech. Recognition near a cut-off word or number remains an estimate, not phoneme-perfect proof. See [OpenAI speech-to-text documentation](https://developers.openai.com/api/docs/guides/speech-to-text). The pinned SDK patch and upgrade requirements are documented in the voice worker's `patches/README.md`.

## Validation

- 118 voice tests passed, including installed-SDK interruption and shutdown tests, played-audio clipping, ambiguous capture rejection, ASR failure handling, lookup suppression, and existing booking/transfer logic. TypeScript and diff whitespace checks passed.
- 271 agent-core tests passed.
- 24/24 deployed backend acceptance cases passed: 18 supported, four unknown, two out of scope. Median 321 ms, p95 5,343 ms, maximum 6,405 ms. These API timings are not spoken-answer timings.
- Four real WebRTC calls exercised the deployed worker with synthetic caller audio. Calls used `internal_qa`, were excluded from billing, and did not create customer contacts or send notifications. Received agent audio was recorded and independently transcribed, then compared with persisted turns. Client captions alone were not used as proof.

The interrupted fee answer saved only `Practical Nursing, Melfort, Winter 2027 fee table. Tuition total. [interrupted]`, matching the independently transcribed received audio. The following Medical Laboratory Assistant question was answered correctly. Hang-up saved `Practical Nursing, Melfort. [interrupted]` and completed the call without the unplayed fee amounts.

First substantive answer audio on the main call took 9.482 seconds for admissions contact, 6.211 seconds for Electrical requirements, 14.282 seconds for the repeated requirements, and 7.495 seconds for Nursing requirements. In the interruption call it took 6.644 seconds for campuses, 4.527 seconds for the fee follow-up, and 3.551 seconds for the replacement Medical Laboratory question. Measurements run from caller audio end to received agent audio start; scripted inter-question pauses are excluded. These are small-sample observations, not latency targets.

The saved admissions answer contained the correct `866 638 8618`, but three independent recognizers rendered the received audio as `866-638-618`. This is an unresolved spoken-number verification concern: the audio or its recognition may have merged a repeated digit. The contact-number readout is not certified by this run. Broader numeral and date readout checks remain necessary before claiming full production readiness.

Final call records and timing measurements are in the accompanying evidence files.

## Limits

Suncrest has no configured phone-number records, so these are real WebRTC voice tests, not PSTN calls. A live telephone route, staff transfer, and real recipient notification delivery were not exercised. The preamble stage is removed, but backend/model/TTS waiting time remains; this run does not establish a production latency SLA. Regression tests exercise shared platform behavior; live audio certification here covers Suncrest only.

## Artifacts

`acceptance.json`, `deployment.json`, `backend-acceptance.json`, `call-state.json`, and `persistence-and-audio.json` contain final evidence. Full recordings, raw event timelines, intermediate candidate comparisons, and test logs are retained locally under `.tmp/suncrest-voice-2026-11-09/` in the backend checkout. Earlier candidates are retained separately and are not counted as final release acceptance.

Temporary database TCP access used for verification was deleted after the checks; the final proxy inventory is empty.
