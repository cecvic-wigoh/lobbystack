# Suncrest readiness check — 8 November 2026

**Decision: Suncrest does not yet meet a client-facing production acceptance bar.**
The deployed system can answer several common questions well, but the same
published admissions question can succeed once and fail on repeat. Stored prices
also differ from the current website. Healthy services and HTTP 200 responses do
not establish answer correctness.

## What was exercised

- 12 questions, each twice: 24 requests to the deployed
  `/api/internal/livekit/respond` endpoint, with two controlled request lanes.
  Test call records were marked internal QA, excluded from billing, and removed.
- Two actual deployed LiveKit browser voice sessions, using generated caller
  speech and capturing the received assistant audio. Sessions lasted 152 and 86
  seconds. These are browser voice calls, not telephone/PSTN calls or human
  microphone tests.
- Independent transcription of the received audio, compared with streaming and
  persisted transcripts. Both calls are stored as completed: 13 and 11 turns.
- Fresh authenticated Crawl4AI reads of Practical Nursing, Electrician Applied
  Certificate, Medical Laboratory Assistant, and Contact Us. Existing website
  knowledge was not overwritten.
- Replay of the fresh Markdown through the real cleaner, chunker, and program
  parser; comparison with the existing indexed program text.

No staff transfers, appointment bookings, or outbound messages were initiated by
the test scripts. Product code and customer knowledge were not changed in this
pass. The existing uncommitted parser correction remains uncommitted and was not
released as part of these tests.

## Release blockers

| Priority | Finding | Proof | Required correction |
| --- | --- | --- | --- |
| P0 | Stored Nursing tuition is stale. | The live page now lists domestic tuition of $16,500 for both Yorkton and Melfort. The repeated Melfort answer still reports a $15,000 intake figure and $16,000 fee-table figure from older indexed text. | Refresh source data after fixing crawler-format compatibility; make source age and refresh failures visible. Retest each campus against the current page. |
| P1 | Electrician admissions are inconsistent and slow. | Identical backend questions: a partial supported answer in 9.9 seconds, then refusal in 17.1 seconds. Both spoken variants in the first voice session refused. The live page and stored chunks contain Grade 11, the three accepted math choices, the modified/general-math exclusion, and the English-language policy. | Release a verified nested-heading parser correction and test the complete evidence-to-spoken-answer path repeatedly. Do not rely on a generative fallback to recover facts discarded by parsing. |
| P1 | Crawl4AI refresh regresses existing structured Nursing answers. | Using the same fresh source, Nursing requirements and Melfort fees change from `answer` to `evidence` in the program parser. Crawl4AI emits star bullets, italic emphasis, and multiline table cells that the existing parser does not fully handle. | Support both old and new Markdown shapes at the owning parsing boundary, preserving every fee, campus, option, and qualification. Run these replays before bulk reindexing. |
| P1 | A known course's prerequisites are not found. | NFPA 1140 prerequisites were refused twice. Its active indexed course page explicitly contains the prerequisite section, eligible-service requirement and ICS 100, plus the email/registration condition. | Verify exact course-code and query-URL retrieval, including `courses.suncrestcollege.ca`, rather than treating a retrieval miss as missing published information. |
| P1 | Some admissions answers omit usable choices. | Medical Laboratory Assistant answers refer to “listed math options” rather than naming all accepted options, even though the caller cannot see that list. | Assert coverage of every applicable subject choice, percentage, AND/OR relationship, English-language rule and document condition in the final spoken answer. |

Price reference: [Practical Nursing](https://suncrestcollege.ca/programs/practical-nursing-diploma).
Admissions references: [Electrician Applied Certificate](https://suncrestcollege.ca/programs/electrical-applied-certificate),
[Medical Laboratory Assistant](https://suncrestcollege.ca/programs/medical-laboratory-assistant),
[NFPA 1140](https://courses.suncrestcollege.ca/product?catalog=NFPA1140-1).

## Voice findings and working behavior

- Admissions contact was answered correctly with the published admissions email.
- Nursing campus answers were repeatable. The full Nursing academic answer
  preserved the overall percentage, named subject options, AND/OR choices,
  English-language policy, document deadline, and acceptance-conditions notice.
- The interruption test changed from Nursing fees to Medical Laboratory
  Assistant's start date. The recorded audio stopped the old response and answered
  the new question. This establishes one successful interruption, not broad
  interruption reliability.
- AI identity was disclosed when asked. The opening was inconsistent: the first
  call disclosed AI; the second opened with an offer to help and omitted that
  disclosure until the caller asked.
- The agent still spoke checking/pausing preambles. First audio therefore must
  not be counted as the first useful answer. In the baseline, the first Electrician
  refusal started about 7.5 seconds after the caller finished speaking.
- The interrupted response's persisted text extends beyond the words present in
  the independent audio transcription. Treat stored text as insufficient proof
  of what the caller actually heard; verify cancelled speech when assessing calls.
- Both calls ended and persisted. The second caller cleanup returned 404 after
  the agent ended the room; the database call was already completed. This is not
  evidence that the conversation failed to end.
- Cross-business questions were declined twice. No guaranteed admission was
  promised, but the admission-guarantee question alternated between an unrelated-
  topic refusal and an unknown answer: safe, but poor and inconsistent handling of
  a legitimate college question.

## Measured backend behavior

24/24 requests returned HTTP 200. Median response time was 2.004 seconds; nearest-
rank p95 was 9.933 seconds; maximum was 17.088 seconds. These are small-sample
client-observed API times, not voice latency or a load-test certification.

The API labelled 15 results `supported`, six `unknown`, and three `out_of_scope`.
Those labels are **not** an accuracy score: some supported answers use stale
prices or omit useful requirements. Judge against fresh approved source facts.

## Next release gate

1. Fix Markdown compatibility and nested admissions boundaries in the shared
   parser, with the current page layouts as regression fixtures.
2. Recrawl and reindex Suncrest, including its course subdomain and policy PDFs;
   retain inactive-source choices and stop on missing/failed source coverage.
3. Repeat this exact question pack against current facts, adding conversation
   follow-ups and exact course codes. Critical answers must be correct and complete
   on every repeat; a correct refusal is required when a fact is not published.
4. Repeat browser audio tests for first useful answer time, full spoken conditions,
   interruption, disclosure and transcript persistence. Then test the configured
   telephone path with an approved test line; no active Suncrest line was supplied
   during this pass.
5. Make this a release gate for the shared answer path, so improvements are checked
   against existing businesses before the next demo. Do not use a service-health
   check or one successful answer as the acceptance test.

## Evidence

- [Backend responses](backend-baseline.json)
- [Fresh-source parser replay](source-compatibility.json)
- [Voice timeline summaries](voice-results.json)
- [Database completion, turns, and independent audio transcriptions](persistence-and-audio.json)
- Full frozen source text, harnesses, WAV recordings and generated caller clips
  remain under `.tmp/suncrest-readiness-2026-11-08/` in this checkout; no credentials
  were written into the evidence files.

Temporary public crawler networking and the diagnostic PostgreSQL TCP proxy were
removed after testing. No full Suncrest recrawl is claimed: source refresh is held
behind the demonstrated compatibility blocker above.
