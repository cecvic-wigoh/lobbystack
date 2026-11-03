# Call quality review foundation — work in progress

The requested destination is the existing admin dashboard, covering all clients.

This checkpoint adds the database and domain layer only. There is no dashboard
page or API route yet, and migration `0072_call_quality_reviews.sql` has not been
applied to production.

The queue is derived from calls with an end timestamp, including historical
calls, with unreviewed as the default. Saved reviews contain status, issue flags,
correction notes, and reviewer identity; the transcript stays in its existing
canonical table. Platform administrators can read across clients. Ordinary tenant
administrators cannot access the review records or other tenants' calls.

Viewing a transcript and saving a review create audit records without copying
transcript content into those records. Problem and resolved reviews require an
issue flag and a correction or retest note. Review notes are separate human-authored
content and currently last until the review or its call/business is deleted.

Validation: local PostgreSQL migration, database health check, RLS verification
including role-spoofing checks, domain typecheck, and four focused tests covering
validation, historical call inclusion, review updates, audit records, and ordinary
tenant administrator denial.

Remaining: dashboard/API integration, translations, UI verification, review edit
conflict handling, and production release verification. This is not an automatic
accuracy score or a fix for Shercom's retrieval failures.
