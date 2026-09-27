# CineNest v1.8 Specification Addendum

This addendum supplements `DacTa_MovieCafeBookingSystem_v1.7.pdf`. The v1.7 business requirements remain in force; the sections below record the final system name, team boundaries, movie data policy, and verification policy used by the implemented release.

## Product identity

- Official name: **CineNest**
- Descriptive name: **CineNest — Movie Café Booking System**
- Booking code format: `CN-YYMMDD-XXXX`
- Repository: `CineNest`

## Team responsibilities

- **Hải Anh — Booking and release lead:** booking flows, staff schedule, lifecycle operations, integration, pull-request review, conflict resolution, release demo, and main-branch stability.
- **Dương — Authentication and shared integration:** accounts, sessions, authorization, employee management, shared frontend utilities, CI, and schema review.
- **Chúc — Rooms:** room catalogue, availability search, room management, and availability-query optimization.
- **Thành Lê — Movies and performance:** catalogue, importer, movie preparation, performance scenarios, and benchmark evidence.
- **Sơn — Menu:** menu catalogue, customer pre-orders, staff add-on orders, and serving status.
- **Công Thành — Payment and reports:** invoices, payment collection, adjustments, early-ending exceptions, and management reports.

Every database change is added as a new migration. Committed migrations are immutable. Schema changes require review before release integration.

## Parallel-development boundaries

- `backend/src/modules/staff/staff.routes.ts` mounts staff routers owned by their domain modules.
- Staff routes remain beside the service they operate: `bookings.staff.routes.ts`, `movies.staff.routes.ts`, `menu.staff.routes.ts`, and `payments.staff.routes.ts`.
- `frontend/shared/movie-picker.ts` owns reusable movie selection.
- `frontend/shared/menu-picker.ts` owns reusable menu selection.
- `frontend/booking.ts` coordinates the customer booking steps and consumes both widgets through their public interfaces.
- Cross-module service signatures are documented in `docs/CONTRACTS.md`.

## Movie catalogue policy

- The selected source is The Movies Dataset on Kaggle, based on TMDB metadata.
- `backend/prisma/import-movies.ts` imports `movies_metadata.csv`, filters by runtime, vote count, poster, description, and adult flag, and writes data in batches.
- Each imported film stores `source` and `external_id`. Their unique combination makes repeated imports idempotent and distinguishes films with the same title.
- Missing Vietnamese age classifications remain `NR`. A manager may change a rating only after verifying an appropriate source.
- The large CSV and ZIP files are not committed. The repository contains the importer and small representative samples.
- Movie list endpoints are paginated so the frontend never loads the complete catalogue at once.

## Verification policy

- Vitest and Supertest cover authentication, rooms, booking, movies, menu, payment, reporting, and concurrency behavior.
- Playwright covers customer registration and booking, plus the integrated customer-to-staff invoice flow.
- Locust records room search, 200-request booking contention, and a full journey ramp to 300 users.
- Lighthouse records frontend performance, accessibility, best practices, and SEO.
- Performance targets are never presented as measured results. Reports must include the actual machine, versions, dataset size, run date, load shape, latency, error rate, and business outcome.

## Performance API response

`GET /api/rooms/availability` returns:

```json
{
  "ok": true,
  "data": {
    "window": {},
    "rooms": []
  }
}
```

Locust reads the room list with:

```python
(response.json().get("data") or {}).get("rooms") or []
```

This response contract must remain aligned across the API reference, frontend client, tests, and performance scenarios.
