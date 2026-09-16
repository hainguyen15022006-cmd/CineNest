# Booking integration and regression — Hai Anh (member 3)

## Scope and current status

This branch contains customer booking and staff booking operations, plus tests of their integration with the existing movie, menu and payment modules. No feature from the specification has been removed. No teammate branch has been merged as part of this work.

Passing these tests validates the implementation currently on `feat/bookings`. It does **not** mean that teammates' final modules have been reviewed, or that `main` is feature-complete. Run this suite again against each integrated release candidate.

## Verification recorded on 2026-09-16

Local verification on `feat/bookings` with PostgreSQL test data:

| Check | Result |
| --- | --- |
| Backend and frontend typecheck | Passed |
| Full backend regression | 38/38 tests passed across 5 files |
| T14 mixed contention | 1 created / 199 ROOM_TAKEN / exactly 1 DB booking |
| Chromium E2E | 2/2 passed, including movie Ready and complete checkout |
| Frontend production build | Passed |
| Whitespace check (`git diff --check`) | Passed |

These are local results, not a GitHub Actions run and not the final integrated team release. The E2E suite completed in 5.1 seconds on the final run; that is test execution time, not an API latency benchmark.

## What was completed

### T14: real mixed-source contention

File: `backend/tests/bookings-contention.test.ts`.

- Start one real HTTP server on a dynamically assigned port.
- Create one isolated room and 100 different customer accounts, plus one staff account.
- Sign in through the actual authentication API before starting contention.
- Dispatch 100 online and 100 counter booking requests together with `Promise.all`. All requests target the same room and interval; every request has its own Idempotency-Key.
- Require exactly one HTTP 201 and 199 HTTP 409 responses, all with `ROOM_TAKEN`. Any unexpected 422, 429 or 5xx fails the assertion.
- Query PostgreSQL to require exactly one saved booking and verify the winner's source, customer/staff ownership and room charge.
- Remove only the generated fixtures after the test.

Why separate customer accounts? The three-upcoming-booking quota must not hide a room contention failure. Why unique keys? This tests room locking, not replay of one idempotent action.

The earlier sequential online-then-counter test remains as a simple regression test and no longer carries the T14 label.

This is a correctness stress test. It is **not** a performance benchmark and it does not claim a p95 result. Retain the separate Locust PF02 report for latency evidence.

### Full browser integration

File: `e2e/booking-integration.spec.ts`.

The test uses separate customer and staff browser sessions and interacts with the actual HTML/TypeScript pages:

1. Register a customer and search for an isolated test room.
2. Select a 90-minute movie that fits a two-hour package (maximum movie length 110 minutes).
3. Select two drinks, each costing 35,000 VND.
4. Review and confirm 200,000 VND room charge + 70,000 VND food = 270,000 VND.
5. Verify persisted movie, room-rate and food-price snapshots through the customer API.
6. Simulate the arrival time for **only this test booking** in the isolated test database, preserving the two-hour interval and 30-minute cleaning interval. The real booking API rules are not bypassed when creating the booking.
7. Sign in as staff, find the selected movie in Movie preparation and mark it Ready; then check in and require IN_USE and audit history.
8. Verify payment stays disabled while food is PENDING and PREPARING.
9. Serve the order. It leaves the default In progress list; verify it using the Served filter.
10. Collect cash through the payment UI. Require COMPLETED / PAID and a disabled payment button afterward.
11. Verify exactly one payment row, 270,000 VND amount, saved snapshots and audit history in PostgreSQL.
12. Reopen the booking as the customer and verify the final state.
13. Clean up the isolated fixtures, including failure paths.

The existing customer create/cancel smoke test remains included.

### Payment UI bug fixed

File: `frontend/staff/checkout.ts`.

The generic `run(fn, button)` helper re-enables its button in `finally`. The old payment callback refreshed the invoice inside that helper, so the invoice disabled the settled-payment button and the helper immediately enabled it again.

The payment handler now locks the button itself, awaits the action, and refreshes invoice eligibility after the action helper finishes. It also ignores submissions while disabled. Backend payment and idempotency safeguards remain in place; no payment rule was changed.

### Repeatable booking-code collision regression

The existing Day 4 code-collision test offered only five replacement codes. Repeated local runs consumed all five and caused a fixture failure despite correct retry behavior. It now finds an unused suffix across the actual code alphabet, so the test remains repeatable without resetting the database.

## Isolated test environment

`playwright.config.ts` loads test settings from `backend/.env.test` and allows explicit process environment values for CI. DATABASE_URL must name a database ending in `_test` or `_e2e`. A development DB is rejected before the E2E servers start.

E2E starts its own backend at `http://127.0.0.1:3100` and frontend at `http://127.0.0.1:5175`. It does not reuse your development backend at port 3000 or frontend at port 5173. Port 5175 uses strictPort, so a conflict produces an error instead of silently switching ports.

Dependencies such as pg, bcryptjs and dotenv are loaded from the backend workspace. No new package installation is needed beyond the repository's normal `npm ci`.

Do not run backend tests and E2E simultaneously against the same test database. Backend setup clears login-attempt records; both suites are intended to run sequentially.

## How to run on your machine

From the repository root:

```bash
npm run typecheck
npm test
npm run build
npm run test:e2e
```

Your existing test database should already be configured. On a fresh clone, copy `backend/.env.test.example` to `backend/.env.test`, fill the local database settings and session secret, then prepare the test database:

```bash
npm run db:generate
npm run db:test:setup
npx playwright install chromium
```

Do not run database reset or seed against your development database just to execute these checks. If you exported DATABASE_URL manually, make sure it points to the test database before invoking the commands.

Run only mixed contention:

```bash
npm test --workspace backend -- --run tests/bookings-contention.test.ts
```

Watch the complete browser flow:

```bash
npm run test:e2e -- e2e/booking-integration.spec.ts --headed
```

Inspect local changes without publishing:

```bash
git status
git diff --stat
git diff -- frontend/staff/checkout.ts playwright.config.ts
```

The commands above do not commit, push or merge anything. Local browser traces/screenshots under `test-results` are ignored by Git.

## Manual demonstration for the group

Use the normal development UI and create a booking for the current opening hours. Select a fitting movie and two drinks; explain the room charge and food total before confirming. When the booking start time arrives, staff checks in, moves the food order from Pending to Preparing to Served, then records cash payment. Show that checkout is blocked until food is resolved, and remains disabled after payment. Finally show the customer's completed booking and staff history.

For a demonstration outside opening hours, use the headed isolated E2E test above instead of manually changing normal booking dates in Prisma Studio. Its fixture time adjustment is a testing technique, not a product feature.

Explain T14 separately: the browser demo shows the lifecycle; the API test proves both booking sources cannot sell the same interval under concurrent requests. The database constraint is a second protection in addition to the application lock.

## Work that waits for teammates

- Review final movie, menu and payment changes and confirm contracts/snapshots remain compatible.
- Merge agreed PRs in order and resolve real integration conflicts.
- Rerun backend regression, browser E2E and PF/Lighthouse on the integrated build.
- Record final benchmark results, fix remaining bugs and freeze features.
- Complete main/release, deployment and backup demo, slides and randomized Q&A practice.

The member 4 performance tasks (PF01 with 10,000 bookings, PF03 ramp-up, comparable before/after measurements and Lighthouse) must be included in the final team evidence. The two tests added here do not replace them.
