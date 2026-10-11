# Implementation Plan - Merchant Application Lifecycle

Following `MERCHANT_LIFECYCLE_README.md`, this plan details the step-by-step implementation through phases L0 to L7.

---

## Architecture & Principles
1. **Pure Logic First (L1)**: State machine, policy, scoring rules, masking, audit sanitizer, and domain exceptions as zero-dependency TypeScript modules with 100% unit test coverage.
2. **One Mutation Pattern**: `LOCK (FOR UPDATE) -> AUTHZ -> STATE -> VALIDATE -> MUTATE -> AUDIT -> COMMIT` inside a database transaction.
3. **No network calls in DB transactions**: Provider assessment runs outside database transactions.
4. **No sensitive data in Redis**: Queue payload contains only `{ applicationId, submissionNumber, riskReviewId }`.
5. **Idempotency across 3 layers**:
   - BullMQ `jobId = risk-review-${applicationId}-${submissionNumber}`
   - DB Unique constraint on `risk_reviews(application_id, submission_number)`
   - Worker checks `status === 'COMPLETED'` and submission count match before processing.
6. **Authorization & Status Codes**:
   - 401 unauthenticated
   - 403 role mismatch or object-policy violation (e.g. non-assigned reviewer or ADMIN deciding)
   - 404 not found or cross-tenant SALES access
   - 409 invalid state transition or uneditable state
   - 400 validation failures / reviewer not eligible / comment required

---

## Phases and Milestones

### Phase L0: Precondition Check
- Verify docker services (postgres, redis) and existing tests pass.

### Phase L1: Pure Domain Logic & Unit Tests
- Create `src/applications/application.enums.ts`:
  - `ApplicationStatus`: `DRAFT`, `SUBMITTED`, `IN_REVIEW`, `NEEDS_INFO`, `APPROVED`, `REJECTED`
  - `RiskStatus`: `NOT_STARTED`, `PENDING`, `CLEAR`, `FLAGGED`, `FAILED`
  - `BusinessType`: `SOLE_PROPRIETORSHIP`, `PARTNERSHIP`, `LLC`, `CORPORATION`, `NON_PROFIT`
  - `RiskReviewStatus`: `PENDING`, `PROCESSING`, `COMPLETED`, `FAILED`
  - `RiskLevel`: `LOW`, `MEDIUM`, `HIGH`
  - `DecisionType`: `APPROVE`, `REJECT`, `REQUEST_INFO`
- Create `src/applications/state-machine/`:
  - `application.state-machine.ts`: `TRANSITIONS` table, `nextStatus`, `assertTransition`, `isEditable`, `isAssignable`
  - Tests in `application.state-machine.spec.ts` covering 100% of transitions and terminal checks.
- Create `src/common/errors/domain.exception.ts`:
  - `DomainException(code, httpStatus, message)`
  - Concrete subclasses: `InvalidStateTransitionException`, `ApplicationNotEditableException`, `ReviewerNotEligibleException`, `CommentRequiredException`
  - Update `AllExceptionsFilter` to handle `DomainException` extracting `code` into the payload.
- Create `src/risk/scoring/risk-scorer.ts`:
  - `scoreRisk(input)` logic with rules (+10 base, +40 high risk MCC, +20 high volume, +15 ticket spread, +10 no website), capping at 100, level thresholds (<30 LOW, 30-59 MEDIUM, >=60 HIGH), flags mapping.
  - Tests in `src/risk/scoring/risk-scorer.spec.ts`.
- Create `src/common/masking/masking.ts`:
  - `maskTaxId`, `maskEmail`, `maskPhone`
  - Tests in `src/common/masking/masking.spec.ts`.
- Create `src/audit/audit-sanitizer.ts`:
  - Allowlist-based entity sanitizer, redaction of sensitive fields, global key blocklist.
  - Tests in `src/audit/audit-sanitizer.spec.ts`.
- Extend and update `src/applications/application.policy.ts` and `src/applications/application.policy.spec.ts`.

### Phase L2: Data Model & Migrations
- Transformers: `ColumnNumericTransformer` for bigint minor units to number.
- Entities:
  - `MerchantApplication` (`src/applications/entities/merchant-application.entity.ts`)
  - `RiskReview` (`src/risk/entities/risk-review.entity.ts`)
  - `ReviewDecision` (`src/applications/entities/review-decision.entity.ts`)
  - `AuditLog` (`src/audit/entities/audit-log.entity.ts`)
- Migration:
  - Create migration for tables, check constraints, unique constraints, foreign keys, indexes, and the append-only trigger on `audit_logs`.
  - Include working `down` migration.
  - Test migration run, revert, and re-run. Test append-only trigger.

### Phase L3: Audit Service
- Create `src/audit/audit.actions.ts` and `AuditModule` with `AuditService.record(manager, ...)`.
- Enforce that `AuditService` has no update or delete method.
- Unit and integration tests proving audit writing inside transaction and rollback behavior.

### Phase L4: Application CRUD
- DTOs:
  - `CreateApplicationDto`, `UpdateApplicationDto` (PartialType), query parameters DTO with sort whitelist map, `AssignReviewerDto`, `RecordDecisionDto`.
  - Strict validations, forbidden property rejection.
- Mapper: `mappers/application.mapper.ts` (flat DB columns -> nested API structure, tax ID masked, DOB omitted).
- `ApplicationsService` & `ApplicationsController`:
  - CRUD endpoints (`POST /applications`, `GET /applications`, `GET /applications/:id`, `PATCH /applications/:id`).
  - Swagger documentation on all endpoints.
  - Scoped reads, pagination, sorting whitelist.
  - E2E tests for application CRUD and access control.

### Phase L5: Submit, Assign, Decision
- Implement `submit(id, user)`: locks row, validates policy, validates transition, increments submission count, inserts `risk_reviews` row (PENDING), audits `APPLICATION_SUBMITTED`.
- Implement `assign(id, reviewerId, user)`: validates ADMIN, validates target is active REVIEWER, audits `REVIEWER_ASSIGNED`.
- Implement `recordDecision(id, dto, user)`: validates assigned REVIEWER, checks `IN_REVIEW`, validates comment rules, transitions application (`APPROVED` / `REJECTED` / `NEEDS_INFO`), records decision, audits `DECISION_RECORDED`.
- Implement `GET /applications/:id/decisions`.
- E2E tests for full authorization matrix and transition rules.

### Phase L6: Asynchronous Risk Review (BullMQ & Worker)
- Risk provider abstraction (`RISK_PROVIDER`, `RiskProvider`, `SimulatedRiskProvider`, transient/permanent error types).
- Wire submit to enqueue BullMQ job after commit: `risk-review-${appId}-${submissionNumber}`.
- Implement `RiskReviewProcessor`:
  - Idempotent processing steps (check `COMPLETED`, check stale submission, mark `PROCESSING`, call provider outside tx, lock & persist result in tx, update app to `IN_REVIEW`, audit).
  - Failure handler (`@OnWorkerEvent('failed')`): handle final attempt exhaustion, mark review `FAILED`, app riskStatus `FAILED`, audit `RISK_REVIEW_FAILED`.
- Implement `RiskReviewRecoveryService` (`OnApplicationBootstrap`): re-enqueue un-enqueued pending reviews.
- Configurable env vars: `RISK_PROVIDER_LATENCY_MS`, `RISK_PROVIDER_FAILURE_RATE`, BullMQ retry backoff, worker concurrency.
- Comprehensive concurrency and async E2E tests.

### Phase L7: Hardening, Audit Querying, & Documentation
- Implement `GET /audit-logs` (ADMIN only, paginated).
- Optional COULD item: `POST /applications/:id/risk-review/retry`.
- Update `docs/DECISIONS.md` with all architectural decisions.
- Add lifecycle documentation to `README.md`.
- Run full test suite (`npm run lint && npm run build && npm test && npm run test:e2e`).
