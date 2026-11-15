# Suncrest browser test and catalogue discovery gap — 9 November 2026

The production Suncrest demo was opened in the in-app browser. Browser chat returned sourced answers for admissions contact, Electrical requirements, a repeated Electrical question, Melfort Nursing fees and caveats, and NFPA prerequisites/closed-enrolment status. It refused to guarantee admission and declined an unrelated Shercom question. Screenshots and the observed browser state are saved alongside this report.

The browser voice call connected and completed. The user tested it through the microphone. Reviewing its persisted transcript confirmed two refusals: “Okay, what other interesting courses are there that I can study at Suncrest?” and “Can you tell me the list of courses that Suncrest offers?” Both received the generic cannot-confirm response. Deployed admin logs reported `missing_evidence` with `evidenceCount: 0` twice.

The active indexed corpus contains 99 program pages, 1,163 course pages and 49 product pages. These are page counts, not a count of currently open distinct courses. The parsed program catalogue contains 99 entries. Replaying both broad questions directly through the structured catalogue resolver returned `null`; a named Electrical question returned a published intake. The generic catalogue fallback recognizer does not cover the user's “list of courses” wording.

The required next change is a catalogue discovery path: recognize ordinary broad and follow-up requests, retrieve complete source-backed categories/titles, support filtered/paged lists, and distinguish published offerings from current enrolment status. Preserve the safe refusal for genuinely unsupported facts. Regression and live browser tests must include these exact failed questions.

This pass diagnoses the gap; it does not implement or deploy catalogue changes. The earlier latency and contact-number tests were narrower than complete knowledge-base readiness. See `catalogue-failure.json` for the exact observed turns and parser checks.
