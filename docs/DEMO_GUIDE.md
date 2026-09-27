# CineNest Demo and Presentation Guide

## Pre-demo checklist

Run these commands before presenting:

```bash
git switch main
git pull
docker compose up -d
npm ci
npm run db:generate
npm run db:migrate
npm run dev
```

If the shared Docker container already exists, use `docker start moviecafe-db`. Do not run `db:seed` immediately before the presentation unless the team intentionally wants to reset the demo database.

Confirm the following:

- `http://localhost:3000/api/health` returns `ok: true`.
- The customer home page displays room images and amenities.
- Menu images load from `/images/menu/`.
- Customer, staff, and manager accounts can sign in.
- The chosen demo date has a free room and an appropriate start time.
- A backup booking already exists in case the live booking slot becomes unavailable.

## Recommended five-to-seven-minute presentation

### 1. Problem and solution — 40 seconds

Movie cafés often coordinate reservations, room usage, films, food, and payment manually. This creates overlapping bookings, missed preparation, inconsistent totals, and weak reporting. CineNest gives customers a guided booking flow and gives staff and managers one operational system.

### 2. Roles and architecture — 45 seconds

Introduce the three roles: Customer, Staff, and Manager. Explain that the browser calls a Node.js/Express API, Prisma accesses PostgreSQL, and Docker gives every team member the same PostgreSQL version. Mention that data remains in a Docker volume while schema and migrations are versioned in GitHub.

### 3. Customer booking — 90 seconds

1. Search by date, time, duration, and guest count.
2. Open a room and show capacity, amenities, hourly price, and calculated session total.
3. Choose a movie or select “Choose at the café.” Demonstrate runtime filtering.
4. Add one drink or snack and show the subtotal.
5. Confirm the booking and open its detail page.

Explain that the backend reloads prices and rejects stale totals. The browser cannot submit its own trusted price.

### 4. Staff operations — 90 seconds

1. Open Today's schedule and locate the new booking.
2. Open booking detail and explain Confirmed, In use, Completed, Cancelled, and No-show.
3. Check the customer in or demonstrate a prepared demo booking already in use.
4. Move a food order from Pending to Preparing to Served.
5. Open checkout and collect payment after blockers are resolved.

### 5. Manager and reporting — 50 seconds

Show one catalogue page and one report page. Explain that managers maintain rooms, movies, menu items, staff accounts, and adjustment approvals. Historical item and room prices remain stable because bookings store snapshots.

### 6. Advanced engineering — 60 seconds

- PostgreSQL exclusion constraint plus application row locking prevents double booking.
- Idempotency prevents repeated clicks from creating duplicate bookings or payments.
- Sessions, role authorization, login rate limiting, and employee session revocation protect access.
- Pagination supports thousands of films.
- Vitest/Supertest, Playwright, Locust, and Lighthouse provide correctness and performance evidence.
- PF02 produced one successful booking from 200 simultaneous attempts.

## Manual acceptance checklist

### Public and customer flow

1. Room list and detail load without signing in.
2. Search rejects invalid dates, closed hours, unsupported durations, and excess guests.
3. Registration creates a Customer session.
4. Movie selection can be changed after filtering; only the latest choice remains selected.
5. A two-hour session only offers movies within the allowed runtime.
6. Food quantities update the subtotal.
7. Confirmation creates one booking and My bookings displays it.
8. A conflicting second booking returns a clear room-taken message.

### Staff flow

1. Staff lands on Today's schedule after login.
2. Walk-in booking enforces capacity and overlap rules.
3. Check-in is available at the permitted arrival time.
4. Overdue confirmed bookings can be checked in or marked no-show.
5. Food states follow Pending → Preparing → Served, or Pending → Cancelled.
6. Unresolved food blocks normal checkout.
7. Early ending requires a reason and resolves pending food correctly.
8. Payment can be collected only once.

### Manager flow

1. Manager can create, edit, deactivate, and reactivate catalogue records.
2. Local menu image paths and HTTPS image URLs are accepted; insecure HTTP URLs are rejected.
3. Deactivating an employee invalidates that employee's session.
4. Adjustment approval changes the invoice; rejection does not.
5. Reports reject reversed date ranges and use Vietnam time.

## Automated verification

```bash
npm run db:test:setup
npm run typecheck
npm test
npm run test:e2e
npm run build
```

Expected release result:

- 65 backend tests passed.
- 2 Playwright tests passed.
- TypeScript checks passed.
- Frontend production build passed.

## Common questions

### Why use Docker?

Docker provides the same PostgreSQL 16 environment on every machine and preserves local data in a named volume. Node.js and Vite still run directly on the host during development.

### Is Prisma the database?

No. PostgreSQL is the database. Prisma provides the TypeScript client, schema model, and migration tooling. SQL migrations create the real database constraints and indexes.

### Why does the repository not contain the live database?

Git stores code, schema, migrations, seed logic, and small sample data. Live rows are stored in the PostgreSQL Docker volume. A new machine reconstructs the database by applying migrations and optionally running the seed/importer.

### Why is payment not online?

The four-week course scope prioritizes reliable booking, operations, and checkout. Payment is recorded at the café by cash or transfer. A sandbox payment gateway is a future extension.

### Why is there no temporary five-minute hold?

The final conflict check occurs atomically when the customer confirms. This avoids abandoned holds and expiry jobs in the course scope. The interface returns a clear conflict and suggested alternatives if another customer books first.

### What is the most advanced feature?

The strongest evidence is double-booking prevention under concurrency: application locks and a PostgreSQL exclusion constraint allow exactly one winner from 200 simultaneous requests.
