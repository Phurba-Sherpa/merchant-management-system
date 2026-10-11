# Architecture and Design Decisions

| Date | Decision | Reason |
| --- | --- | --- |
| 2026-10-11 | A1: REVIEWER can read all applications but decide only on assigned applications | Reviewers need visibility across the review queue, but decision rights are strictly scoped to the assigned reviewer. |
| 2026-10-11 | A2: Only ADMIN can assign a reviewer, and the assignee must have the REVIEWER role | Role separation prevents unauthorized assignments and ensures reviewers are qualified. |
| 2026-10-11 | A3: ADMIN cannot record a risk decision | Assignment rule explicitly states "only the assigned REVIEWER". Admins manage assignments but do not override the risk officer role. |
| 2026-10-11 | A4: Status codes: cross-user access returns 404; role mismatch returns 403; non-assigned reviewer decision returns 403; missing/invalid token returns 401 | Prevents enumeration attacks for unauthorized resources (404), while distinguishing authentication (401) and authorization (403). |
| 2026-10-11 | A5: No public user registration endpoint; seed script provisioned | Reduces attack surface; user onboarding is administrative. |
| 2026-10-11 | A6: No refresh tokens; short-lived access tokens (15m) | Minimizes token leakage blast radius without requiring server-side token storage/revocation state. |
| 2026-10-11 | A7: Role is fetched from the database on every request rather than trusting JWT payload | Immediate revocation and role change propagation without token blacklisting. |
| 2026-10-11 | A8: Two independent axes: status (human/process workflow) and riskStatus (verification outcome) | Keeps automated checks distinct from manual underwriting and human decisions. |
| 2026-10-11 | A9: Fixed mutation pattern: LOCK -> AUTHZ -> STATE -> VALIDATE -> MUTATE -> AUDIT -> COMMIT | Prevents race conditions, double submissions, double assignments, and audit drift across transactions. |
| 2026-10-11 | A10: No third-party network or provider calls inside database transactions | Eliminates connection pool starvation and long-held pessimistic locks during slow network responses. |
| 2026-10-11 | A11: Three-layer idempotency for risk assessment (jobId, unique DB constraint, worker state check) | Handles at-least-once BullMQ delivery safely without duplicated risk reviews. |
| 2026-10-11 | A12: Redis job payloads contain IDs only (applicationId, submissionNumber, riskReviewId) | Prevents leaking sensitive PII or business financial metrics into queue memory/logs. |
| 2026-10-11 | A13: Allowlist-based audit sanitizer and append-only database trigger | Deny-by-default audit trail protection; Postgres row trigger blocks raw UPDATE and DELETE statements on audit_logs. |
| 2026-10-11 | A14: Enqueue-after-commit with startup recovery service | Production ideal is transactional outbox; take-home uses post-commit enqueue with bootstrap recovery for simplicity and reliability. |
