# Completed-call summary emails

The worker can email each newly completed voice call to an operator-approved recipient. Full transcripts continue to live in the Calls dashboard. This reuses `email.send`, the existing outbox, and the configured Resend/SMTP provider; no database migration or new queue is required.

Set `CALL_SUMMARY_EMAIL_RECIPIENTS` on the **worker** to a JSON object mapping business UUIDs to validated email addresses. Unlisted businesses do not send these emails. Configure Shercom's business UUID with `contact@trendhubs.io`; do not use the Suncrest or CertNova IDs. This is operator configuration, not a caller-controlled destination.

Finalization locks the call, stores its summary, and queues its email in the same transaction. A repeated finalization does not enqueue another email. The email contains the stored summary, available caller contact details, completion time, and call reference. It does not include the full transcript. Missing email configuration fails the delivery job so the existing retry path can recover.

Resend receives the durable outbox deduplication key as its idempotency key. Keep Resend enabled for this installation. SMTP-only delivery cannot guarantee deduplication if a process crashes after SMTP accepts a message but before the job completes.

Validation: domain and worker type checks; 397 domain tests and 97 worker tests passed. The dedicated PostgreSQL integration test covers atomic enqueue, duplicate finalization, and another business attempting to finalize the call. These integration tests require `LOBBYSTACK_RELIABILITY_TEST_DATABASE_URL` pointing to a dedicated local test database and were skipped in this environment.

Before declaring a client live, verify the recipient mapping, run a fresh voice call, inspect its transcript in the dashboard, and confirm the matching email in Resend's delivery log.
