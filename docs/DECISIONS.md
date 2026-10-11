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
