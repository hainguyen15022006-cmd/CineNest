# CineNest Release Integration Review

Review date: 28 September 2026
Release candidate: `fix/menu-review`
Target branch: `main`

## Integrated scope

| Area           | Final behavior                                                                                                                                          |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Authentication | Registration, login, logout, PostgreSQL sessions, role protection, login rate limiting, employee deactivation, and session revocation                   |
| Rooms          | Active-room catalogue, detail, images, amenities, capacity and price management, indexed availability search, and cleaning intervals                    |
| Booking        | Customer and walk-in creation, four-step flow, cancellation, schedule, check-in, no-show, mark-used recovery, early ending, and audit history           |
| Movies         | Paginated catalogue, search and genre filtering, runtime checks, large CSV importer, selection changes, preparation versioning, and manager maintenance |
| Menu           | Bundled item images, pre-orders, add-on orders, trusted price snapshots, serving states, cancellation, and manager maintenance                          |
| Payment        | Invoice calculation, food blockers, cash/transfer collection, partial discounts, full waivers, pending-adjustment resolution, and idempotent checkout   |
| Reports        | Booking, revenue, room-hour, unpaid, and waived reports using Vietnam time                                                                              |
| Quality        | Backend integration tests, browser E2E flows, Locust scenarios, Lighthouse evidence, build and type checks                                              |

## Integration corrections

- Removed duplicate payment and reporting routes.
- Restricted payment methods to the database contract: `CASH` and `TRANSFER`.
- Added explicit full-amount collection while a reduction request is pending; the pending request is withdrawn with an audit record.
- Corrected paid invoice display so the remaining amount is zero.
- Standardized transaction locking and lock order across booking, rooms, movies, menu, adjustments, and checkout.
- Mapped Prisma conflicts, foreign-key errors, missing records, and write conflicts to stable HTTP responses.
- Enforced the maximum capacity of six guests across customer, staff, and manager interfaces.
- Rejected reversed report date ranges and applied Vietnam-time grouping.
- Preserved inactive rooms in the staff schedule when they still have bookings.
- Prevented stale movie-preparation actions from applying after a movie change.
- Prevented login redirects from returning an authenticated user to the login page.
- Added persistent room-image and menu-image migrations for existing development databases.
- Allowed safe bundled `/images/menu/` paths while rejecting insecure HTTP image URLs.
- Preserved English interface text while leaving Vietnamese movie titles unchanged.

## Verification result

| Check                     | Result                                                                     |
| ------------------------- | -------------------------------------------------------------------------- |
| Backend tests             | 65 passed across 7 files                                                   |
| Browser integration       | 2 passed in Chromium                                                       |
| Backend TypeScript        | Passed                                                                     |
| Frontend TypeScript       | Passed                                                                     |
| Frontend production build | Passed; all configured pages generated                                     |
| Prisma migrations         | 5 migrations found and applied                                             |
| Menu assets               | 15 source images and 15 built images verified                              |
| Git whitespace check      | Passed                                                                     |
| Merge relationship        | `main` is an ancestor of the release candidate; no branch-content conflict |

The two browser flows cover customer registration and four-step booking, plus an integrated journey from movie and food selection through staff preparation, serving, invoice calculation, and payment.

## Requirements coverage

### Standard requirements

- Complete customer, staff, and manager interfaces.
- Essential room search, booking, lifecycle, food, and payment functions.
- Validation, role protection, responsive interface, and persistent database storage.
- Reproducible setup, shared sample data, and documented demo accounts.

### Advanced requirements

- Database exclusion constraint and application row locking for overlapping bookings.
- Idempotency for booking and checkout.
- Pagination and indexed availability queries for larger datasets.
- A movie importer that supports thousands of records without duplicate source IDs.
- A 10,000-booking history generator.
- Locust PF01–PF03 measurements, including 200-way contention and a 300-user journey.
- Lighthouse before/after evidence.
- Automated integration and real-browser regression tests.

## Known limitations

- Online payment gateway integration is outside the course scope. Staff record cash or bank-transfer settlement at the café.
- The system performs the final conflict check at confirmation and does not create a temporary five-minute hold while the customer is browsing.
- Room images are external HTTPS resources and depend on their source hosts. Menu images are bundled with the application.
- The Kaggle source CSV is intentionally excluded from Git; each environment imports it separately when a large catalogue is required.
- `npm audit` currently reports advisories in Prisma's tooling dependency chain. The automated remediation proposes a breaking Prisma version change, so it was not applied immediately before release. The application uses PostgreSQL and does not use the flagged MySQL driver at runtime.

No blocking functional issue remained after the final review. The release candidate was suitable for merging into `main` after the team completed its manual presentation smoke test.
