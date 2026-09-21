# CineNest integration review

Review date: 21 September 2026  
Integration branch: `codex/integrate-team-final`

## Integrated contributions

| Owner | Remote branch | Review result |
| --- | --- | --- |
| Dương — authentication and integration | `origin/feat/auth` | Integrated. Login/session, role protection, staff-account management and lockout flows compile and pass automated tests. Database not-found errors are now returned as 404 instead of 500. |
| Chúc — rooms and availability | `origin/feat/rooms-optimization-and-ui` | Integrated after reconciling the six-guest limit and transaction locking. Availability now uses an index-compatible status predicate, room detail/search/admin interfaces are improved, inactive-room admin detail is supported, and ten dedicated room tests pass. |
| Hải Anh — booking | `origin/feat/bookings` | Integrated. Customer and staff booking flows, cleaning buffer, duplicate prevention, idempotency, three-active-booking limit, check-in grace period and lifecycle actions pass tests. |
| Thành Lê — movies and performance | `origin/feat/movies-performance` | Movie catalogue/import and movie preparation are integrated. Concurrency protection was added for movie selection, deactivation and preparation changes. Performance scripts exist, but the evidence package is incomplete; see Remaining submission work. |
| Sơn — menu and food orders | `origin/feat/menu` | Integrated. Pre-order, add-on orders, price snapshots and service states work. Locks now prevent a food order from being added during checkout and keep menu price/availability validation consistent. |
| Công Thành — payment, exceptions and reports | `origin/thanh/feature-payments-reports` | Integrated after corrections. Duplicate routes/services and unsupported methods were removed. Checkout supports CASH/TRANSFER, approved adjustments, explicit full collection while an adjustment is pending, and Vietnamese-timezone reports. |

All six member feature branches are integrated into this branch. Chúc's room contribution was merged on 21 September and reconciled with the earlier cross-module concurrency fixes.

## Corrections made during integration

- Removed duplicate payment and manager-report routes that conflicted with the established API.
- Restricted payment methods to the database contract: `CASH` and `TRANSFER`.
- Added explicit handling for collecting the original invoice total while a reduction request is pending; the request is withdrawn with an audit-history record.
- Corrected paid invoice display so the remaining amount is zero.
- Added transaction locks and consistent lock ordering across booking, rooms, movies, menu, adjustments and checkout.
- Added standard mappings for Prisma conflict, foreign-key, not-found and write-conflict errors.
- Enforced the agreed maximum of six guests in the customer search and room management UI/API.
- Corrected report date defaults and rejected reversed date ranges.
- Added recovery when room, movie, menu availability or menu price changes while a customer or staff member is filling a booking form.
- Kept inactive rooms visible in the staff schedule when they still have bookings for the selected date.
- Preserved English user-facing UI text; Vietnamese movie titles remain unchanged.

## Verification result

- Backend automated tests: **64 passed** across authentication, booking, rooms, movies, menu and checkout/report suites.
- Browser integration tests: **2 passed**: the customer four-step booking flow and the full customer-to-staff invoice flow.
- Backend and frontend TypeScript checks: passed.
- Frontend production build: passed; all configured pages were generated.
- Git whitespace/error check: passed.

## Requirements coverage

The integrated application contains the three required interfaces:

- Customer: register/login, search rooms, four-step booking, optional movie, food pre-order, booking list/detail and cancellation.
- Staff: daily schedule, overdue filter and search, walk-in booking, check-in/no-show/mark-used, movie preparation, food service, early ending, adjustment request and payment.
- Manager: staff accounts, rooms, movies, menu, adjustment decisions and operational/revenue reports.

The main advanced engineering features are implemented: database overlap exclusion, transaction locks, idempotency, session/rate-limit controls, indexes, pagination/cache support, Locust scenarios and browser performance artifacts.

## Remaining submission work

These items do not block the application from running, but they are not yet sufficient as final assessment evidence:

1. Re-run and retain raw evidence for PF01 and PF03. Only PF02 raw CSV files are currently committed.
2. Reconcile the PF02 result: `perf/reports/RESULTS.md` states a 1.5-second booking p95, while the tracked `pf02_stats.csv` and `docs/performance/PF02_2026-09-16.md` show 9.5 seconds from another run. Label each machine/run clearly and do not present 1.5 seconds without its source CSV.
3. Run Lighthouse five times on the home, room-results and room-detail pages, then report the median for each page. The repository currently contains one home-page before/after JSON pair.
4. Add the final deployed URL, ERD/database diagram, group presentation slides and demo/backup instructions. The repository currently contains only the movies/performance member slide deck.
5. `npm audit --omit=dev` currently reports four high-severity advisories through Prisma tooling dependencies. Do not run `npm audit fix --force`, because its proposed major downgrade can break the Prisma 7 project. Record this as a known toolchain issue and reassess against a compatible Prisma update before submission.

The current code is a stable integration candidate. It should be treated as feature-frozen while the team completes the evidence and presentation items above.
