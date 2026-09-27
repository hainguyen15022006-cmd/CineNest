# CineNest API Reference

All routes use the `/api` prefix. The detailed business rules are defined in the product specification and enforced by the services referenced below.

## Response format

Successful response:

```json
{ "ok": true, "data": {} }
```

Error response:

```json
{
  "ok": false,
  "error": {
    "code": "ROOM_TAKEN",
    "message": "This room is no longer available.",
    "details": {}
  }
}
```

Common status codes:

| Status | Meaning                                                                     |
| ------ | --------------------------------------------------------------------------- |
| 400    | Malformed request                                                           |
| 401    | Missing or expired session                                                  |
| 403    | Authenticated user does not have the required role                          |
| 404    | Resource does not exist                                                     |
| 409    | Business conflict, duplicate operation, stale state, or overlapping booking |
| 422    | Input violates a business rule                                              |
| 429    | Login or request rate limit exceeded                                        |

Dates and start times are submitted in Vietnam local time using `YYYY-MM-DD` and `HH:mm`. API timestamps such as `startAt`, `endAt`, and `occupiedUntil` are returned as ISO UTC strings. Monetary values are integer VND.

## Idempotent operations

The following operations require an `Idempotency-Key` header containing a UUID:

- `POST /bookings`
- `POST /staff/bookings`
- `POST /staff/bookings/:id/checkout`

Repeating the same key and payload returns the original result with `Idempotent-Replayed: true`. Reusing a key with a different payload returns 422.

## Authentication

| Method and path       | Access    | Request / behavior                                                            |
| --------------------- | --------- | ----------------------------------------------------------------------------- |
| `POST /auth/register` | Public    | `{ name, email, phone, password }`; always creates a Customer and signs in    |
| `POST /auth/login`    | Public    | `{ email, password }`; five failed attempts within ten minutes may return 429 |
| `POST /auth/logout`   | Signed in | Destroys the current session                                                  |
| `GET /me`             | Signed in | Returns the current user; returns 401 after account deactivation              |

## Rooms and availability

| Method and path                                          | Access | Purpose                                                     |
| -------------------------------------------------------- | ------ | ----------------------------------------------------------- |
| `GET /rooms`                                             | Public | List active rooms                                           |
| `GET /rooms/:id`                                         | Public | Get active room details                                     |
| `GET /rooms/availability?date&startTime&duration&guests` | Public | Return `{ window, rooms[] }` with calculated `roomTotalVnd` |

## Movies

| Method and path                             | Access | Purpose                                                              |
| ------------------------------------------- | ------ | -------------------------------------------------------------------- |
| `GET /movies?q&genre&maxMinutes&page&limit` | Public | Search active movies; paginated, default 24 and maximum 100 per page |
| `GET /movies/genres`                        | Public | Return `{ genre, count }[]`                                          |
| `GET /movies/:id`                           | Public | Get one active movie                                                 |

Search is case-insensitive. `maxMinutes` is normally the session duration minus the ten-minute preparation margin.

## Menu

| Method and path   | Access | Purpose                          |
| ----------------- | ------ | -------------------------------- |
| `GET /menu-items` | Public | List active food and drink items |

## Customer booking

| Method and path                         | Access                | Purpose                                                        |
| --------------------------------------- | --------------------- | -------------------------------------------------------------- |
| `POST /bookings`                        | Customer              | Create an online booking                                       |
| `GET /me/bookings?scope=upcoming\|past` | Signed in             | List the current customer's bookings                           |
| `GET /bookings/:idOrCode`               | Owner, Staff, Manager | Return booking, food, adjustment, payment, and history details |
| `POST /bookings/:id/cancel`             | Owner, Staff          | Cancel within policy; staff must provide a reason              |
| `PATCH /bookings/:id/movie`             | Owner, Staff          | Select, replace, or clear a movie using `{ movieId: number     | null }` |

Create-booking body:

```json
{
  "roomId": 1,
  "date": "2026-10-02",
  "startTime": "18:00",
  "duration": 120,
  "guests": 2,
  "contactName": "Demo Customer",
  "contactPhone": "0900000003",
  "movieId": 12,
  "items": [{ "menuItemId": 3, "quantity": 2 }],
  "note": "Optional note",
  "expectedTotalVnd": 248000
}
```

Important conflicts include `ROOM_TAKEN`, `PRICE_CHANGED`, `BOOKING_LIMIT`, `OVER_CAPACITY`, and `TOO_SOON`. A room conflict may include a suggested alternative in `error.details.suggest`.

## Staff booking operations

| Method and path                      | Access | Purpose                                                           |
| ------------------------------------ | ------ | ----------------------------------------------------------------- |
| `GET /staff/bookings?date`           | Staff  | Daily room schedule                                               |
| `GET /staff/bookings/search?q`       | Staff  | Search up to 20 bookings by code or phone number                  |
| `GET /staff/bookings/overdue`        | Staff  | Confirmed or in-use bookings requiring action                     |
| `POST /staff/bookings`               | Staff  | Create a walk-in booking without the online 30-minute lead rule   |
| `POST /staff/bookings/:id/check-in`  | Staff  | Move a confirmed booking to In use                                |
| `POST /staff/bookings/:id/no-show`   | Staff  | Record a no-show with an optional reason                          |
| `POST /staff/bookings/:id/mark-used` | Staff  | Record actual usage when check-in was missed; requires `{ note }` |
| `POST /staff/bookings/:id/end-early` | Staff  | Complete early with `{ reason }`                                  |

## Movie preparation

| Method and path                         | Access | Purpose                                                |
| --------------------------------------- | ------ | ------------------------------------------------------ |
| `GET /staff/preparation?date`           | Staff  | List movie preparation work for a date                 |
| `PATCH /staff/bookings/:id/preparation` | Staff  | Update preparation using `{ status, expectedVersion }` |

A stale preparation screen returns `MOVIE_CHANGED` rather than applying an action to a replacement movie.

## Food orders

| Method and path                   | Access | Purpose                                            |
| --------------------------------- | ------ | -------------------------------------------------- |
| `GET /staff/orders?status`        | Staff  | Filter food orders by service state                |
| `POST /staff/bookings/:id/orders` | Staff  | Add items while a booking is In use and unpaid     |
| `PATCH /staff/orders/:id/status`  | Staff  | Move an order through its permitted service states |

Order requests contain only menu item IDs and quantities. The server reloads current catalogue names and prices and stores snapshots.

## Invoice, payment, and adjustments

| Method and path                        | Access  | Purpose                                                                        |
| -------------------------------------- | ------- | ------------------------------------------------------------------------------ |
| `GET /staff/bookings/:id/invoice`      | Staff   | Return base total, approved adjustment, amount due, `canCollect`, and blockers |
| `POST /staff/bookings/:id/checkout`    | Staff   | Collect by `CASH` or `TRANSFER`; supports `collectFullAmount`                  |
| `POST /staff/bookings/:id/adjustments` | Staff   | Request a partial discount or full waiver                                      |
| `GET /admin/adjustments`               | Manager | List adjustment requests                                                       |
| `POST /admin/adjustments/:id/approve`  | Manager | Approve with an optional note                                                  |
| `POST /admin/adjustments/:id/reject`   | Manager | Reject with an optional note                                                   |

Normal checkout returns `CANNOT_COLLECT` while required work remains unresolved and `ALREADY_PAID` after settlement. An approved full waiver changes `paymentStatus` to `WAIVED` without creating a payment row.

## Manager catalogue and accounts

| Method and path                 | Access  | Purpose                                                           |
| ------------------------------- | ------- | ----------------------------------------------------------------- |
| `GET /admin/staff`              | Manager | List staff and manager accounts                                   |
| `POST /admin/staff`             | Manager | Create an employee account                                        |
| `PATCH /admin/staff/:id/active` | Manager | Activate or deactivate an employee; deactivation removes sessions |
| `GET/POST /admin/rooms`         | Manager | List all rooms or create a room                                   |
| `GET/PATCH /admin/rooms/:id`    | Manager | View or edit active and inactive rooms                            |
| `GET/POST /admin/movies`        | Manager | Search all movies or create a movie                               |
| `PATCH /admin/movies/:id`       | Manager | Edit or deactivate a movie                                        |
| `GET/POST /admin/menu-items`    | Manager | List all menu items or create an item                             |
| `PATCH /admin/menu-items/:id`   | Manager | Edit price, category, image, or active state                      |

Menu images accept HTTPS URLs or safe bundled paths under `/images/menu/`. Plain HTTP and paths outside that directory are rejected.

## Reports

| Method and path                            | Access  | Purpose                                   |
| ------------------------------------------ | ------- | ----------------------------------------- |
| `GET /admin/reports/bookings?from&to`      | Manager | Booking counts grouped by date and status |
| `GET /admin/reports/revenue?from&to`       | Manager | Collected revenue in Vietnam time         |
| `GET /admin/reports/room-hours?from&to`    | Manager | Room utilization hours                    |
| `GET /admin/reports/unpaid-waived?from&to` | Manager | Unpaid and waived booking detail          |

When a new endpoint is introduced, update this reference in the same pull request.
