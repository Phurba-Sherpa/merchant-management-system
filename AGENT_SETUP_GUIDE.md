# Project Setup Guide — Merchant Applications API (NestJS)

> **Audience:** the coding agent. Read this whole file before writing any code.
> **Scope:** scaffolding, infrastructure, cross-cutting concerns, authentication/authorization, and the test harness.
> The merchant-application lifecycle, BullMQ risk worker, and audit trail are covered in a separate guide. Do NOT implement them yet.

---

## 0. Rules of engagement

1. Work through the phases in section 11 **in order**. After each phase run `npm run lint && npm run build && npm test`, run that phase's checkpoint, then make one commit.
2. Install **only** packages from the allowlist in section 3. If you think another package is needed, do not install it. Write the reason in `docs/OPEN_QUESTIONS.md` and continue without it.
3. Never set `synchronize: true` in any environment. Schema changes happen only through reviewed migrations.
4. Never commit secrets. `.env` is git-ignored; `.env.example` contains placeholders only. Test data uses fake values on `example.com`.
5. Never log request bodies, `Authorization` headers, passwords, or tokens.
6. TypeScript `strict` stays on. No `any` (use `unknown` and narrow).
7. The acting user's identity and role come **only** from the verified JWT plus a database lookup, never from the request body, query string, or path.
8. Keep controllers thin: parse input, call a service, return a DTO. Business rules live in services and policies.
9. Do not add features outside the current phase.
10. If your memory of a library API disagrees with the compiler or the installed version's types, trust the compiler and the installed version (`npm ls <pkg>`). Do not guess.
11. Whenever you make a choice this guide does not specify, append one line to `docs/DECISIONS.md` (`date | decision | reason`).
12. Add a short comment explaining *why* at every non-obvious security decision. The human owner must be able to explain every line in an interview.

---

## 1. Locked decisions (do not revisit)

| # | Decision | Choice | Reason |
|---|----------|--------|--------|
| 1 | Starting point | `nest new` from scratch. No boilerplate or template repo. | The assignment auto-fails copied work and requires the candidate to explain all code. Boilerplates also carry unrelated features (mailer, i18n, social login). |
| 2 | NestJS major | **11.x**, CommonJS, Jest | Assignment says "NestJS 10+" and requires Jest. Nest 12's default for new ESM projects is Vitest, and ecosystem compatibility with v12 was not verified. |
| 3 | Runtime | Node 22 LTS, **npm** | Lowest friction for reviewers cloning the repo. Pin in `.nvmrc` and the Dockerfile. |
| 4 | Authentication | Own implementation: `@nestjs/jwt` + custom guards | The assignment grades JWT handling, guards, and object-level authorization in Nest directly. No Passport, no Better Auth. |
| 5 | Password hashing | `argon2` (argon2id) | OWASP-recommended first choice. |
| 6 | Authorization | Three layers: JwtAuthGuard → RolesGuard → ApplicationPolicy + scoped queries | Guards run before the resource is loaded, so object-level checks cannot live in guards. |
| 7 | ORM | TypeORM 0.3 + PostgreSQL 16, migrations only | Required by assignment. |
| 8 | Validation | `class-validator` + `class-transformer` with a global `ValidationPipe` | Nest default. |
| 9 | Logging | `nestjs-pino` with path redaction | Redaction is declarative and testable. |
| 10 | Tests | Jest (unit) + Supertest (e2e) against **real** Postgres and Redis | The assignment requires integration tests proving authorization cannot be bypassed. |

---

## 2. Assumptions (defaults to implement; log each in `docs/DECISIONS.md`)

The assignment is ambiguous in a few places. Use these defaults unless the human owner changes them.

- **A1.** REVIEWER can *read* all applications (they need to see the queue) but can *decide* only on applications assigned to them.
- **A2.** Only ADMIN can assign a reviewer. The assignee must have role REVIEWER.
- **A3.** ADMIN **cannot** record a risk decision. The rule says "only the assigned REVIEWER", and an assignee must be a REVIEWER, so ADMIN is excluded by design. Do not "fix" this.
- **A4.** Response codes: SALES requesting another user's application → **404** (do not reveal existence). Wrong role → **403**. Non-assigned REVIEWER attempting a decision → **403**. Missing/invalid token → **401**.
- **A5.** No public registration endpoint. Users are created by a seed script.
- **A6.** No refresh tokens. Access tokens are short-lived (15 min). Document this as a trade-off in the README.
- **A7.** Role is read from the database on every request, not trusted from the token. This means role changes and deactivation apply immediately.

---

## 3. Dependency allowlist

**Runtime**
- `@nestjs/common`, `@nestjs/core`, `@nestjs/platform-express` (all `^11`)
- `@nestjs/config`, `joi` (env validation)
- `@nestjs/typeorm`, `typeorm`, `pg`
- `@nestjs/jwt`
- `@nestjs/swagger`
- `@nestjs/throttler`
- `@nestjs/bullmq`, `bullmq` (wiring only in this guide)
- `class-validator`, `class-transformer`
- `argon2`
- `helmet`
- `nestjs-pino`, `pino-http`, `pino`

**Dev**
- Everything `nest new` generates (Jest, ts-jest, ESLint, Prettier, Supertest, `@types/*`)
- `pino-pretty`

**Explicitly forbidden:** `better-auth`, `passport*`, `@nestjs/passport`, `bcrypt`, `bcryptjs`, `mongoose`, `@nestjs/mongoose`, `prisma`, `drizzle-orm`, `@casl/*`, any boilerplate generator.

---

## 4. Target structure

```
.
├── docker/postgres/init.sql          # creates the app_test database
├── docker-compose.yml
├── Dockerfile
├── .env.example
├── .nvmrc
├── docs/
│   ├── DECISIONS.md
│   └── OPEN_QUESTIONS.md
├── src/
│   ├── main.ts                       # bootstrap only; calls configureApp()
│   ├── configure-app.ts              # pipes, filters, helmet, swagger. Shared with e2e tests
│   ├── app.module.ts
│   ├── config/
│   │   ├── env.validation.ts         # Joi schema
│   │   └── configuration.ts
│   ├── database/
│   │   ├── data-source.ts            # used by the TypeORM CLI
│   │   ├── database.module.ts
│   │   ├── migrations/
│   │   └── seeds/seed-users.ts
│   ├── common/
│   │   ├── filters/all-exceptions.filter.ts
│   │   ├── decorators/               # public.decorator, roles.decorator, current-user.decorator
│   │   └── types/authenticated-user.ts
│   ├── auth/
│   │   ├── auth.module.ts / auth.controller.ts / auth.service.ts
│   │   ├── guards/jwt-auth.guard.ts
│   │   ├── guards/roles.guard.ts
│   │   └── dto/                      # login.dto, login-response.dto
│   ├── users/
│   │   ├── user.entity.ts / users.service.ts / users.module.ts
│   │   └── role.enum.ts
│   ├── applications/                 # created in the next guide; policy contract defined here (9.7)
│   └── health/                       # GET /health: Postgres + Redis ping
└── test/
    ├── jest-e2e.json
    ├── global-setup.ts               # runs migrations on app_test
    └── helpers/                      # create-test-app, db reset, create-user-and-token
```

Feature modules own their entities, services, controllers, and DTOs. Nothing in `common/` may import from a feature module.

---

## 5. Environment and configuration

`.env.example` (placeholders only, no real values):

```
NODE_ENV=development
PORT=3000
LOG_LEVEL=debug

DB_HOST=localhost
DB_PORT=5432
DB_USER=
DB_PASSWORD=
DB_NAME=merchant_app
DB_NAME_TEST=app_test

REDIS_HOST=localhost
REDIS_PORT=6379

# generate with: openssl rand -base64 48
JWT_SECRET=
JWT_EXPIRES_IN=15m
JWT_ISSUER=merchant-api
JWT_AUDIENCE=merchant-api-clients

# used only by the seed script
SEED_ADMIN_PASSWORD=
SEED_REVIEWER_PASSWORD=
SEED_SALES_PASSWORD=
```

Rules:
- Validate with Joi at boot and **fail fast**. `JWT_SECRET` must be at least 32 characters. Missing required values abort startup with a clear message.
- Access config through a typed `ConfigService`. Never read `process.env` outside `src/config` and `src/database/data-source.ts`.
- `docker-compose.yml` must reference secrets via `${VAR:?message}` so it refuses to start without a `.env`.

---

## 6. Docker Compose and Dockerfile

**Services**
- `postgres`: `postgres:16-alpine`, named volume, `healthcheck` using `pg_isready`, mounts `docker/postgres/init.sql` into `/docker-entrypoint-initdb.d/` (it runs `CREATE DATABASE app_test;`).
- `redis`: `redis:7-alpine`, started with `redis-server --maxmemory-policy noeviction` (BullMQ requires this so queued jobs are never evicted), healthcheck with `redis-cli ping`.
- `api`: builds from the Dockerfile, `depends_on` both with `condition: service_healthy`, environment from `.env`.

**Dev workflow:** `docker compose up -d postgres redis`, then run the API on the host with `npm run start:dev`. `docker compose up --build` must also work end to end.

**Dockerfile:** multi-stage, `node:22-slim` (Debian, avoids musl problems with native modules like `argon2`), `npm ci`, build, then a final stage with production dependencies only, running as the non-root `node` user.

---

## 7. Database and migrations

`src/database/data-source.ts` exports one `DataSource`:
- `type: 'postgres'`, `synchronize: false`, `migrationsRun: false`.
- `uuidExtension: 'pgcrypto'` so `@PrimaryGeneratedColumn('uuid')` uses Postgres's built-in `gen_random_uuid()`.
- Entity and migration globs must resolve in both ts-node and compiled `dist` (use `__dirname`-relative paths with `{ts,js}`).
- `AppModule` reuses the same options through `TypeOrmModule.forRootAsync`.

`package.json` scripts:
```
"typeorm": "typeorm-ts-node-commonjs",
"migration:generate": "typeorm-ts-node-commonjs migration:generate -d src/database/data-source.ts",
"migration:run": "typeorm-ts-node-commonjs migration:run -d src/database/data-source.ts",
"migration:revert": "typeorm-ts-node-commonjs migration:revert -d src/database/data-source.ts",
"seed": "ts-node src/database/seeds/seed-users.ts"
```
Usage: `npm run migration:generate -- src/database/migrations/CreateUsers`.

Migration rules:
- Generate, then **read and edit** the file. Names must be descriptive. Every migration needs a working `down`.
- Use native Postgres enums for `role`, and (later) application status values.
- Use `timestamptz` for all timestamps, `uuid` primary keys, explicit foreign keys, and indexes on columns used in filters.
- Never edit a migration that has been committed; add a new one.

**Seed script:** creates one ADMIN, one REVIEWER, and two SALES users (so cross-user isolation can be tested by hand). Emails are `admin@example.com`, `reviewer@example.com`, `sales1@example.com`, `sales2@example.com`. Passwords come from the `SEED_*` env vars. The script is idempotent (upsert by email).

---

## 8. App bootstrap and cross-cutting concerns

Put everything below in `configureApp(app)` in `src/configure-app.ts`. `main.ts` and the e2e test helper both call it, so tests exercise the same pipeline as production.

- `helmet()`.
- Global `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })`. Extra properties are rejected, which is the mass-assignment defence.
- Global `AllExceptionsFilter`: consistent JSON shape `{ statusCode, error, message, path, timestamp }`. Never leak stack traces or SQL. Map Postgres unique violation (`23505`) to 409.
- `app.enableShutdownHooks()`.
- Swagger at `/docs` with `addBearerAuth()`; controllers use `@ApiBearerAuth()`; every DTO property has `@ApiProperty`.
- Logging via `nestjs-pino`. Redact at least: `req.headers.authorization`, `req.headers.cookie`, `req.body.password`, `*.passwordHash`, `*.token`, `*.accessToken`. Do not log bodies.
- `@nestjs/throttler` registered globally with a generous default, and a strict limit on `POST /auth/login` (5 requests per minute per IP). Provide an env override so e2e tests are not rate-limited.

---

## 9. Authentication and authorization

### 9.1 Mental model

| Layer | Question | Where it lives | Failure |
|-------|----------|----------------|---------|
| 1. Authentication | Who are you? | `JwtAuthGuard` (global) | 401 |
| 2. Role gate | Is your *kind* of user allowed on this route? | `RolesGuard` (global) + `@Roles()` | 403 |
| 3. Object-level | Are you allowed to touch *this specific* record? | `ApplicationPolicy` + scoped queries in the service | 404 / 403 |

Layer 3 is the heart of the assignment. It is domain logic, so no auth library solves it for you.

### 9.2 User entity

`id` (uuid), `email` (unique, lowercased before save), `passwordHash` (`select: false`), `fullName`, `role` (enum `ADMIN | REVIEWER | SALES`), `isActive` (default true), `createdAt`, `updatedAt`.
Never return a `User` entity from a controller. Return explicit response DTOs.

### 9.3 Endpoints

- `POST /auth/login` (`@Public()`, throttled). Body: `{ email, password }`. Returns `{ accessToken, expiresIn, user: { id, email, fullName, role } }`.
- `GET /auth/me`. Returns the current user.

Login rules:
- Normalize email (trim, lowercase).
- Load the user with `passwordHash` explicitly selected.
- If the user does not exist, still run `argon2.verify` against a precomputed dummy hash, so response time does not reveal which emails exist.
- Unknown email, wrong password, and inactive account all return the **same** 401 with the same message (`Invalid credentials`).
- Token payload: `{ sub: user.id }` plus `iss`, `aud`, `iat`, `exp`. No role or email inside the token.

### 9.4 JWT configuration

- `JwtModule.registerAsync` reading secret, issuer, audience, and expiry from config.
- Algorithm **HS256**, pinned explicitly on both sign and verify (`algorithms: ['HS256']`). Never accept the algorithm from the token header.
- Verify `iss` and `aud`.

### 9.5 Guards (both registered with `APP_GUARD`, in this order)

1. **`JwtAuthGuard`**
   - If the handler or class has `@Public()`, allow.
   - Read `Authorization: Bearer <token>`; missing or malformed → 401.
   - `verifyAsync` the token; any failure → 401 (same message for expired and invalid).
   - Load the user by `sub`; missing or `isActive === false` → 401.
   - Attach `request.user = { id, role }` typed as `AuthenticatedUser`.
2. **`RolesGuard`**
   - Read `@Roles(...)` metadata with `Reflector` (handler first, then class).
   - No `@Roles` metadata → allow any authenticated user (object-level checks still apply).
   - Role not in the list → 403.

### 9.6 Decorators

- `@Public()` sets metadata consumed by `JwtAuthGuard`.
- `@Roles(...roles: Role[])` sets metadata consumed by `RolesGuard`.
- `@CurrentUser()` param decorator returning `AuthenticatedUser`. This is the **only** way services learn who the actor is.

**Route inventory test (required):** a test that enumerates every route and asserts each is either `@Public()` or has `@Roles(...)`, or is explicitly listed in an allowlist with a comment. This proves deny-by-default was not forgotten on a new endpoint.

### 9.7 ApplicationPolicy contract (implement now as a pure class; used by the next guide)

A plain class with no database access, unit-testable with plain objects:

```ts
canView(actor, application): boolean
canEdit(actor, application): boolean      // role/ownership only; state check lives in the state machine
canSubmit(actor, application): boolean
canAssign(actor): boolean
canDecide(actor, application): boolean
```

| Action | ADMIN | REVIEWER | SALES |
|--------|-------|----------|-------|
| View / list | all | all (A1) | only where `createdById = actor.id` |
| Create | yes | no | yes (`createdById` set server-side) |
| Edit | yes | no | own only |
| Submit | yes | no | own only |
| Assign reviewer | yes | no | no |
| Record decision | **no** (A3) | only if `assignedReviewerId = actor.id` | no |

**Scoped queries:** every read path that can return applications goes through one helper (e.g. `applyVisibilityScope(queryBuilder, actor)`) that adds `createdById = :actorId` for SALES. SALES never "load then check"; the row is simply not found. List endpoints cannot be widened by a client-supplied filter.

**Mass assignment:** `createdById`, `status`, `riskStatus`, `assignedReviewerId`, and timestamps must never appear in create/update DTOs.

### 9.8 Required tests for this guide

Unit:
- `ApplicationPolicy`: every cell of the table above, including ADMIN-cannot-decide.
- `AuthService.login`: success, unknown email, wrong password, inactive user (all failures same error); dummy-hash path is exercised.
- `RolesGuard`: allowed, denied, no metadata, class-level vs handler-level metadata.

E2E (Supertest, real DB):
- Login success and failure shapes; response contains no `passwordHash`.
- No token → 401; malformed token → 401; expired token → 401; token signed with a different secret → 401; token signed with `alg: none` → 401.
- Token for a deactivated user → 401.
- Wrong role on a role-restricted route → 403.
- Route inventory test (9.6).
- Login is rate limited when the throttle override is off.

(The cross-user SALES tests and the assigned-reviewer tests are added in the lifecycle guide, but the helpers they need — `createUserAndToken(role)` — must exist after this phase.)

### 9.9 README "Security" section (write at the end of this phase)

- The three-layer model and where each layer lives.
- Why no Passport and no Better Auth.
- Trade-offs: no refresh tokens or server-side revocation (A6); HS256 shared secret vs asymmetric keys; DB lookup per request (A7) and what it costs.
- Sensitive-data note: list which owner/contact and processing fields would need **field-level encryption at rest** in production (for example tax ID, bank account details, date of birth, phone, email) and state that masking happens in logs and audit payloads. Documenting is required; implementing is not.

---

## 10. Test harness

- `test/jest-e2e.json`: `rootDir: ".."`, `testRegex: ".e2e-spec.ts$"`, `globalSetup: "<rootDir>/test/global-setup.ts"`, run with `--runInBand` (single shared database).
- `global-setup.ts`: connect to `app_test`, run migrations (never `synchronize`), disconnect.
- `createTestApp()`: builds the Nest app from `AppModule`, calls `configureApp(app)`, returns `{ app, dataSource }`.
- `resetDb(dataSource)`: truncates all application tables with `RESTART IDENTITY CASCADE` before each test file or test.
- `createUserAndToken(app, role)`: inserts a user directly through the repository (argon2 cost may be lowered under `NODE_ENV=test`), signs in through the real `/auth/login`, returns `{ user, token }`.
- BullMQ in tests: use a distinct Redis key prefix (e.g. `bull-test`) and flush it in setup. (Worker tests come in the next guide.)
- Scripts: `test` (unit), `test:e2e`, `test:cov`.

---

## 11. Build phases and checkpoints

**Phase 0: Scaffold**
- `npx @nestjs/cli@11 new merchant-api --package-manager npm --strict`. Choose **CommonJS/Jest** if prompted. Confirm `package.json` shows `@nestjs/*` at `^11`.
- Add `.nvmrc` (`22`), `docs/DECISIONS.md`, `docs/OPEN_QUESTIONS.md`.
- Checkpoint: `npm run build && npm test` pass.

**Phase 1: Config, Docker, health**
- Joi env validation, typed config, `docker-compose.yml`, `Dockerfile`, `init.sql`, `.env.example`.
- `GET /health` pings Postgres and Redis.
- Checkpoint: `docker compose up -d postgres redis`; app boots; `/health` returns OK; boot fails with a clear error when `JWT_SECRET` is missing or short.

**Phase 2: Cross-cutting bootstrap**
- `configureApp()`, ValidationPipe, exception filter, helmet, Swagger, pino redaction, throttler.
- Checkpoint: `/docs` loads; invalid body returns the consistent 400 shape; a request with an `Authorization` header produces a log line without the header value (add a test for the redaction config).

**Phase 3: Database baseline**
- `data-source.ts`, `DatabaseModule`, scripts, `User` entity, first reviewed migration, seed script.
- Checkpoint: `migration:run` then `migration:revert` then `migration:run` all succeed on a clean DB; `npm run seed` twice produces four users, not eight.

**Phase 4: Authentication and authorization foundations**
- Everything in section 9 except the application-specific parts: users module, login, `/auth/me`, guards, decorators, `ApplicationPolicy` (pure class + unit tests), route inventory test.
- Checkpoint: all tests in 9.8 pass; Swagger "Authorize" works with a token from `/auth/login`.

**Phase 5: Test harness**
- Section 10 helpers, global setup, first e2e specs (auth).
- Checkpoint: `npm run test:e2e` green from a clean checkout after `docker compose up -d postgres redis`.

**Phase 6: Queue plumbing (connection only)**
- Register `BullModule.forRootAsync` using the Redis config and a `risk-review` queue. No processor logic yet.
- Checkpoint: app boots; `/health` still green; no jobs are enqueued.

Stop after Phase 6 and report. Do not continue to the lifecycle, worker, or audit work.

---

## 12. Repository hygiene

- `.gitignore` must include: `node_modules`, `dist`, `coverage`, `.env`, `.env.*` (but not `.env.example`).
- Small, focused commits with conventional messages (`feat(auth): ...`, `chore(docker): ...`).
- Before every push: `git diff --cached` scan for anything resembling a secret, token, or real personal data.
- README must contain: quick start (three commands), architecture overview, auth/security section (9.9), decisions and trade-offs (link `docs/DECISIONS.md`), and an **AI assistance disclosure** listing tools used (planning assistant, coding agent) and the human verification performed (tests run, code read line by line, manual authorization checks).

---

## 13. Out of scope for this guide

Application entity and lifecycle/state machine, assignment and decision endpoints, risk-review worker (retries, backoff, idempotency), audit trail and masking utilities, optional webhook/Mongo/ADR work. These come in the next guide and depend on the contracts defined in sections 9 and 10.

---

## 14. Reading list (for the human owner)

- NestJS authentication: https://docs.nestjs.com/security/authentication
- NestJS authorization: https://docs.nestjs.com/security/authorization
- NestJS guards: https://docs.nestjs.com/guards
- NestJS testing (e2e): https://docs.nestjs.com/fundamentals/testing
- NestJS queues (BullMQ): https://docs.nestjs.com/techniques/queues
- OWASP API1:2023 Broken Object Level Authorization: https://owasp.org/API-Security/editions/2023/en/0xa1-broken-object-level-authorization/
- OWASP Password Storage Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html
- JWT best current practices (RFC 8725): https://datatracker.ietf.org/doc/html/rfc8725
- BullMQ going to production (Redis eviction policy): https://docs.bullmq.io/guide/going-to-production
- BullMQ idempotent jobs: https://docs.bullmq.io/patterns/idempotent-jobs
- Why not Better Auth here: its NestJS integration page (community-maintained) https://better-auth.com/docs/integrations/nestjs and its database page https://better-auth.com/docs/concepts/database
- NestJS 12 overview (CJS/ESM split, Jest vs Vitest): https://trilon.io/blog/nestjs-12-is-coming
