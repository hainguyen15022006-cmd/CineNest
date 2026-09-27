# Cross-Module Contracts

These service functions are stable boundaries between rooms, bookings, menu, and payments. Implementations may change internally, but callers and signatures must be updated together in one reviewed change.

## Booking lifecycle transition

Location: `backend/src/modules/bookings/bookings.service.ts`

```ts
transitionBooking(
  tx,
  bookingId,
  to,
  actor,
  reason,
  opts?: { endedEarly?: boolean },
): Promise<Booking>
```

Responsibilities:

- Lock the booking row with `FOR UPDATE`.
- Validate the requested transition.
- Record `checked_in_at` when moving to `IN_USE`.
- Record `ended_at` and the early-ending reason when moving to `COMPLETED`.
- Append a `booking_status_history` row with field `status`.
- Leave `payment_status` unchanged.

Payment checkout and early-ending operations call this function inside their transaction rather than updating booking status directly.

## Time and overlap rules

Location: `backend/src/core/time.ts`

```ts
overlaps(aStart, aEnd, bStart, bEnd): boolean
validateSlot(date, startTime, duration, { source }): Window
computeWindow(startAt, durationMinutes): Window
HOLDING_STATUSES = ["CONFIRMED", "IN_USE", "COMPLETED"]
```

Rules:

- Intervals are half-open: `[start, end)`. Touching boundaries do not overlap.
- `validateSlot` applies opening hours, lead time, advance-booking, duration, and source rules.
- `computeWindow` sets `occupiedUntil` to the session end plus the cleaning buffer.
- Availability SQL and the PostgreSQL exclusion constraint must use the same holding statuses and range semantics.

This alignment ensures that a room shown as available follows the same rules used during final booking creation.

## Food totals and checkout blockers

Location: `backend/src/modules/menu/menu.service.ts`

```ts
computeItemsForBilling(tx, bookingId): Promise<{
  itemsTotalVnd: number;
  unresolvedOrderIds: number[];
  orders: unknown[];
}>

buildPreorder(tx, items): Promise<{ lines: unknown[]; totalVnd: number }>
resolveOrdersOnEarlyEnd(tx, bookingId): Promise<void>
```

Responsibilities:

- `buildPreorder` reloads active menu records and snapshots trusted names and prices.
- `computeItemsForBilling` excludes cancelled orders and reports Pending/Preparing orders as unresolved.
- `resolveOrdersOnEarlyEnd` cancels Pending orders. Preparing and Served orders remain chargeable.

The payment module must use these functions instead of recalculating food totals independently.

## Invoice and payment ownership

Location: `backend/src/modules/payments/payments.service.ts`

The payment module:

- Uses booking and menu contracts rather than directly mutating their state.
- Applies only approved adjustments to the amount due.
- Records payment status changes in history.
- Creates at most one payment record per booking.
- Uses idempotency protection for checkout.

## Shared idempotency contract

Location: `backend/src/core/idempotency.ts`

```ts
withIdempotency(actorId, key, requestHash, run);
```

Behavior:

- The key is unique within an actor's requests.
- Same key and same request hash replay the stored response.
- Same key and different hash return 422.
- A failed operation removes the pending key so a safe retry remains possible.

Every critical create or collect route must use this wrapper and must never implement an incompatible local replay mechanism.
