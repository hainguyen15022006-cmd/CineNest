# Booking Integration and Regression Evidence

## Purpose

Booking is the system's central transaction. It connects room availability, movie runtime, menu pricing, customer limits, staff operations, invoice calculation, and reports. This document records the checks that protect those boundaries in the integrated release.

## Current verification

| Check                     | Result                                                |
| ------------------------- | ----------------------------------------------------- |
| Backend integration suite | 65/65 passed across 7 files                           |
| Chromium E2E suite        | 2/2 passed                                            |
| TypeScript checks         | Backend and frontend passed                           |
| Production build          | Passed                                                |
| Mixed-source contention   | Exactly 1 booking created from 200 competing requests |

These are local release checks using dedicated test databases. Performance latency is reported separately in `perf/reports/RESULTS.md`.

## Concurrency scenario: T14 / PF02

File: `backend/tests/bookings-contention.test.ts`

The scenario:

1. Starts a real HTTP server on a dynamic port.
2. Creates one isolated room, 100 customer accounts, and one staff account.
3. Authenticates through the real API.
4. Sends 100 online and 100 walk-in booking requests concurrently for the same room and interval.
5. Gives every request a unique idempotency key so the test measures room contention rather than replay.
6. Requires one HTTP 201 and 199 HTTP 409 `ROOM_TAKEN` results.
7. Queries PostgreSQL and requires exactly one saved booking.

Different customer accounts prevent the three-upcoming-booking quota from masking the overlap test. Unique keys ensure every request is an independent booking attempt.

This proves correctness under contention. It is not, by itself, a latency benchmark.

## Browser integration flows

### Customer booking smoke test

File: `e2e/booking-smoke.spec.ts`

The browser:

1. Registers a new customer.
2. Searches for an available session.
3. Chooses a room.
4. Completes the movie, food, and confirmation steps.
5. Opens the resulting booking detail.

This test verifies page wiring, session cookies, API calls, navigation, and persisted booking data.

### Customer-to-staff invoice flow

File: `e2e/booking-integration.spec.ts`

The browser and API flow verifies:

- Customer movie selection and food pre-order.
- Staff movie-preparation state.
- Check-in and food service.
- Invoice totals using room and food snapshots.
- Payment collection and final status.

## Booking safeguards covered by backend tests

- Opening hours and supported session lengths.
- Online lead time and advance-booking window.
- Room capacity and active state.
- Customer's three-upcoming-booking limit.
- Movie runtime and active state.
- Trusted room/menu prices and `PRICE_CHANGED` recovery.
- Half-open interval semantics and the 30-minute cleaning buffer.
- Application row locking and the PostgreSQL exclusion constraint.
- Same-key replay and different-payload idempotency rejection.
- Customer cancellation deadline and required staff reasons.
- Check-in timing, late arrival handling, no-show, and mark-used recovery.
- Early ending and food-order resolution.
- Checkout blockers, approved adjustments, full waivers, and duplicate payment rejection.

## Lifecycle used by the tests

```text
CONFIRMED -> IN_USE -> COMPLETED
CONFIRMED -> CANCELLED
CONFIRMED -> NO_SHOW
CONFIRMED -> COMPLETED  (recorded usage when check-in was missed)
```

`paymentStatus` is tested independently as `UNPAID`, `PAID`, or `WAIVED`.

## Running the suite

Create a dedicated test environment once:

```bash
cp backend/.env.test.example backend/.env.test
npm run db:test:setup
```

Run the checks:

```bash
npm run typecheck
npm test
npm run test:e2e
npm run build
```

Do not point `backend/.env.test` at the development database. The setup validates that the database name ends in `_test` or `_e2e` before clearing fixtures.

## Presentation evidence

For a live demonstration, show one successful booking, one conflict, one staff lifecycle action, and one invoice. Use the automated results to explain race conditions that are difficult to reproduce reliably by clicking in a browser.
