# Menu module - demo and Q&A notes

Owner: Son - Menu, food ordering, and serving status

## Day 6 regression evidence

The following checks passed on the `feat/menu` branch:

- `npm.cmd run typecheck`
- `npm.cmd test`: 5 test files, 34 tests passed
- `npm.cmd run build`
- Mobile layout at 360 px
- Repeated clicks on Add item and status buttons

Required scenarios:

| Scenario | Evidence | Expected result |
| --- | --- | --- |
| Booking without food | Booking tests using the default payload without `items` | Booking succeeds and food total is zero |
| T01 booking with food | `backend/tests/bookings.test.ts` | Server loads the current menu price and saves snapshots |
| T11 unresolved food order | `backend/tests/checkout.test.ts` and manual UI check | PENDING/PREPARING blocks normal checkout |
| T15/EX02 early end | `backend/tests/checkout.test.ts` and manual UI check | PENDING is cancelled; PREPARING/SERVED remain chargeable |

## Short demo script

### 1. Customer pre-orders food

1. Open the booking flow and move to the Food step.
2. Show item name, category, image, price, quantity, validation, and subtotal.
3. Select one or two items and continue to confirmation.
4. Explain that the browser sends only `menuItemId` and `quantity`; the server reloads the trusted name and price from PostgreSQL.

### 2. Staff processes food orders

1. Sign in as Staff and open Food orders.
2. Add an item using a readable booking code (`CN-...`).
3. Show the Pending, Preparing, Served, and Cancelled filters.
4. Move one order through PENDING -> PREPARING -> SERVED.
5. Explain that food can only be added while the booking is IN_USE and UNPAID.

### 3. Checkout protection

1. Open the invoice while an order is still PENDING or PREPARING.
2. Show the `ORDERS_UNRESOLVED` warning and disabled payment button.
3. Serve or cancel the order, reload the invoice, and show that payment can then be collected.

### 4. Early-end exception

1. Prepare three orders: one PENDING, one PREPARING, and one SERVED.
2. End the session early with a reason.
3. Show that PENDING becomes CANCELLED and is excluded from the bill.
4. Show that PREPARING and SERVED keep their status and remain included in the bill.

### 5. Manager menu maintenance

1. Sign in as Manager and create or edit a menu item.
2. Deactivate the item instead of deleting it.
3. Show that it disappears from the public/staff picker but remains visible in Admin and does not change old snapshots.

## Likely Q&A

### Why store item name and price snapshots?

Menu names and prices can change later. A historical booking must retain the values accepted at booking/order time. The server therefore reads the active item from the database and stores `itemNameSnapshot` and `unitPriceVnd`; it never trusts a price submitted by the browser.

### What are the valid food-order transitions?

- PENDING -> PREPARING
- PENDING -> CANCELLED
- PREPARING -> SERVED
- SERVED and CANCELLED are terminal states

Invalid reverse or repeated transitions return a conflict instead of silently changing data.

### When may Staff add food?

Only when the booking is `IN_USE` and its payment status is `UNPAID`. This prevents orders before check-in, after completion, or after settlement.

### How is the food total calculated?

`computeItemsForBilling` sums `unitPriceVnd * quantity` from saved snapshots for all orders except CANCELLED orders. It also returns IDs of PENDING/PREPARING orders so normal checkout can be blocked.

### Why does PREPARING block normal checkout?

The final result of the order is unresolved. Staff must either finish serving it or cancel it through a valid transition before normal checkout.

### What happens when a session ends early?

`resolveOrdersOnEarlyEnd` cancels PENDING orders because work has not started. PREPARING and SERVED orders remain unchanged and chargeable. A separate approved adjustment can compensate the customer when appropriate.

### What happens when a menu item is deactivated?

It disappears from public and staff selection, but it is not hard-deleted. Admin can still see it, and historical order snapshots remain unchanged.

### How are invalid quantities handled?

The UI accepts only whole numbers from 1 to 20 and resets invalid input. The backend validates the same rule, so bypassing the browser cannot create invalid quantities.

### Can repeated clicks create duplicate orders?

The shared frontend action wrapper disables the clicked button while the request is running. Status transitions are also validated on the server. The add-order endpoint itself is not advertised as idempotent; API clients should not send concurrent duplicate POST requests.

## Final demo checklist

- PostgreSQL service is running.
- Backend is running at `http://localhost:3000/api`.
- Frontend is running at `http://localhost:5173`.
- Demo accounts can sign in.
- At least one booking is IN_USE and UNPAID.
- There are active menu items and sample orders in multiple statuses.
- Keep screenshots of T11 and EX02 as a fallback.
- Do not merge the Pull Request personally; the team lead reviews and merges it.
