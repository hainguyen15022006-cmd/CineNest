# Menu and Food Order Operations

## Scope

The menu module covers catalogue maintenance, customer pre-orders, staff add-on orders, serving states, invoice integration, and early-ending behavior. It shares stable contracts with booking and payment services.

## Main workflow

### Customer pre-order

1. The customer opens the Food step during booking.
2. The menu picker displays the item image, name, category, price, quantity, and subtotal.
3. The browser submits only `menuItemId` and `quantity`.
4. The backend reloads the current active menu item and stores `itemNameSnapshot` and `unitPriceVnd`.

The browser never controls the authoritative price.

### Staff add-on order

1. Staff searches for an active booking.
2. Add-on food is accepted only while the booking is `IN_USE` and `UNPAID`.
3. The backend locks the booking during order creation so checkout cannot race with a new order.
4. Staff processes the order through the supported service states.

### Service states

```text
PENDING -> PREPARING -> SERVED
PENDING -> CANCELLED
```

Cancelled orders do not contribute to the invoice. Pending and Preparing orders normally block checkout. Served orders remain chargeable.

### Early ending

When staff ends a session early:

- Pending food orders are cancelled and excluded from the invoice.
- Preparing and Served orders remain chargeable.
- Preparing food is not falsely marked Served merely to permit payment.
- Staff may request an adjustment when the café should absorb part of a Preparing order.

## Catalogue images

The shared demo menu uses images committed under `frontend/public/images/menu/`. Existing databases receive their paths through migration `20260927000005_menu_images`.

Manager input accepts:

- HTTPS image URLs.
- Safe local paths matching `/images/menu/<file>.<jpg|jpeg|png|webp|avif>`.

Plain HTTP URLs and paths outside the menu image directory are rejected.

## Demo sequence

1. Open a customer booking and select one drink and one snack.
2. Show that changing quantities updates the subtotal.
3. Confirm the booking and point out the stored item name and price.
4. Sign in as Staff and open Food orders.
5. Move the order from Pending to Preparing.
6. Open checkout and show the unresolved-order blocker.
7. Mark the order Served and reload the invoice.
8. Collect the exact amount once.

## Questions and answers

### Why store name and price snapshots?

Managers can edit catalogue names and prices later. A historical booking must retain what the customer accepted. The service therefore copies the trusted database values into each order line when the order is created.

### Why can staff not add food before check-in?

Add-on orders represent food requested during an active room session. Pre-arrival choices belong to the booking's pre-order. Separating them keeps the workflow and audit history clear.

### Why does Pending or Preparing food block checkout?

Payment should not close while staff may still change the fulfilled order. Serving or cancelling the order resolves the operational decision before money is collected.

### Why use a transaction and row lock?

Checkout and add-on ordering may happen at nearly the same time. Locking the same booking row in a consistent order ensures either the order is recorded before checkout or checkout closes the booking first. The system never accepts food after payment.

### What happens if an item becomes inactive while the form is open?

The backend rejects the stale selection and returns the current state. The frontend reloads the menu instead of accepting an unavailable item.

### How are duplicate items handled?

The API rejects a request containing the same menu item ID more than once. The UI normally combines quantity in one input, while server validation protects direct API callers.

## Relevant files

- `backend/src/modules/menu/menu.routes.ts`
- `backend/src/modules/menu/menu.service.ts`
- `backend/src/modules/menu/menu.staff.routes.ts`
- `frontend/shared/menu-picker.ts`
- `frontend/staff/orders.ts`
- `frontend/admin/menu.ts`
- `backend/tests/menu.test.ts`
