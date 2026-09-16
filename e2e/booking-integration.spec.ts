import { expect, test } from "@playwright/test";
import { createRequire } from "node:module";
import { resolve } from "node:path";
// These packages belong to the backend workspace; do not depend on npm hoisting.
const backendRequire = createRequire(resolve("backend/package.json"));
const { Pool } = backendRequire("pg");
const { hash } = backendRequire("bcryptjs");
import { randomUUID } from "node:crypto";

function futureDateVn() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date(Date.now() + 5 * 86_400_000));
}

test("customer selects movie and food; staff checks in, serves food and collects the exact invoice", async ({ page, browser }) => {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl || !/_(test|e2e)$/.test(new URL(databaseUrl).pathname.slice(1))) {
    throw new Error("Integration fixtures and time simulation require an isolated test database");
  }
  const db = new Pool({ connectionString: databaseUrl });
  const suffix = randomUUID().slice(0, 8);
  const roomName = `E2E Room ${suffix}`;
  const movieTitle = `E2E Movie ${suffix}`;
  const itemName = `E2E Lemonade ${suffix}`;
  const staffEmail = `e2e-staff-${suffix}@test.local`;
  const customerEmail = `e2e-customer-${suffix}@test.local`;
  let roomId: number | undefined;
  let movieId: number | undefined;
  let itemId: number | undefined;
  const staffContext = await browser.newContext({ baseURL: "http://127.0.0.1:5175" });
  try {
    roomId = (await db.query(`INSERT INTO room (name,capacity,hourly_price_vnd) VALUES ($1,4,100000) RETURNING id`, [roomName])).rows[0].id;
    movieId = (await db.query(`INSERT INTO movie (title,genre,duration_minutes,age_label) VALUES ($1,'Adventure',90,'P') RETURNING id`, [movieTitle])).rows[0].id;
    itemId = (await db.query(`INSERT INTO menu_item (name,category,price_vnd) VALUES ($1,'DRINK',35000) RETURNING id`, [itemName])).rows[0].id;
    await db.query(`INSERT INTO "user" (name,email,phone,password_hash,role) VALUES ('E2E Staff',$1,'0900000000',$2,'STAFF')`, [staffEmail, await hash("Password#1", 4)]);

    await test.step("Register a real customer and find the isolated room", async () => {
      await page.goto("/register.html");
      await page.getByLabel("Full name").fill("E2E Integration Customer");
      await page.getByLabel("Email").fill(customerEmail);
      await page.getByLabel("Phone number").fill("0912345678");
      await page.getByLabel(/Password/).fill("Password#1");
      await page.getByRole("button", { name: "Create account" }).click();
      await expect(page).toHaveURL(/index\.html/);
      await page.getByLabel("Date").fill(futureDateVn());
      await page.getByLabel("Duration").selectOption("120");
      await page.getByLabel("Start time").selectOption("09:00");
      await page.getByLabel("Guests").fill("2");
      await page.getByRole("button", { name: "Find available rooms" }).click();
      await expect(page).toHaveURL(/rooms\.html/);
      await page.locator("#results article").filter({ hasText: roomName })
        .getByRole("link", { name: "Book this room", exact: true }).click();
    });
    let bookingId = 0;
    let bookingCode = "";
    await test.step("Choose a fitting movie, two drinks, and confirm 270,000 VND", async () => {
      await page.getByLabel("Search movies").fill(movieTitle);
      await page.locator("#movies label.movie-card").filter({ hasText: movieTitle }).getByRole("radio").check();
      await page.getByRole("button", { name: "Continue", exact: true }).click();
      await page.locator("#menu tr").filter({ hasText: itemName }).locator('input[type="number"]').fill("2");
      await page.getByRole("button", { name: "Continue", exact: true }).click();
      await expect(page.locator("#review")).toContainText(movieTitle);
      await expect(page.locator("#review")).toContainText(`${itemName} × 2`);
      await expect(page.locator("#review")).toContainText("270,000 VND");
      const createdPromise = page.waitForResponse((response) => response.url().endsWith("/api/bookings") && response.request().method() === "POST");
      await page.getByRole("button", { name: "Confirm booking" }).click();
      const created = await createdPromise;
      expect(created.status()).toBe(201);
      await expect(page).toHaveURL(/booking-view\.html\?code=CN-/);
      bookingCode = new URL(page.url()).searchParams.get("code")!;
      // The page immediately navigates after POST; read persisted data through the same customer session.
      const detail = await page.request.get(`/api/bookings/${bookingCode}`);
      expect(detail.status()).toBe(200);
      const booking = (await detail.json()).data;
      bookingId = booking.id;
      expect(booking).toMatchObject({ movieId, movieTitleSnapshot: movieTitle, movieDurationSnapshot: 90,
        roomRateSnapshot: 100_000, roomTotal: 200_000 });
      expect(booking.foodOrders[0].items[0]).toMatchObject({ menuItemId: itemId, quantity: 2, unitPriceVnd: 35_000, itemNameSnapshot: itemName });
      await expect(page).toHaveURL(/booking-view\.html/);
      await expect(page.locator("#content")).toContainText(bookingCode);
    });

    // The API uses the real server clock. Shift ONLY this fixture's interval in the test DB.
    // This preserves the two-hour package and cleaning interval without waiting five days.
    const arrivalDate = (await db.query(`UPDATE booking SET start_at=now()-interval '5 minutes', end_at=now()+interval '115 minutes', occupied_until=now()+interval '145 minutes', updated_at=now() WHERE id=$1 AND room_id=$2 RETURNING to_char(start_at AT TIME ZONE 'Asia/Ho_Chi_Minh','YYYY-MM-DD') AS arrival_date`, [bookingId, roomId])).rows[0].arrival_date;
    const staff = await staffContext.newPage();
    await test.step("Staff signs in and checks in; pending food blocks checkout", async () => {
      await staff.goto("/login.html");
      await staff.getByLabel("Email").fill(staffEmail);
      await staff.getByLabel("Password", { exact: true }).fill("Password#1");
      await staff.getByRole("button", { name: "Sign in", exact: true }).click();
      await expect(staff).toHaveURL(/staff\/schedule\.html/);
      await staff.goto("/staff/movie-preparation.html");
      await staff.getByLabel("Date", { exact: true }).fill(arrivalDate);
      await staff.getByRole("button", { name: "View", exact: true }).click();
      const preparation = staff.locator("#list tbody tr").filter({ hasText: bookingCode });
      await expect(preparation).toContainText(movieTitle);
      await preparation.getByRole("button", { name: "Ready", exact: true }).click();
      await expect(preparation.locator(".badge")).toContainText("Ready");
      await staff.goto(`/staff/booking-detail.html?id=${bookingId}`);
      await staff.getByRole("button", { name: "Check-in", exact: true }).click();
      await expect(staff.locator("#content h2")).toContainText("In use");
      await expect(staff.locator("#history")).toContainText("CONFIRMED → IN_USE");
      await staff.getByRole("link", { name: "Invoice / payment / end early", exact: true }).click();
      await expect(staff.locator("#invoice")).toContainText("Food orders are still pending");
      await expect(staff.getByRole("button", { name: "Record payment", exact: true })).toBeDisabled();
    });
    await test.step("Preparing food still blocks payment; served food unlocks it", async () => {
      await staff.goto(`/staff/orders.html?bookingId=${bookingId}`);
      const order = staff.locator("#list tbody tr").filter({ hasText: bookingCode });
      await order.getByRole("button", { name: "Start preparing", exact: true }).click();
      await expect(order.getByRole("button", { name: "Served", exact: true })).toBeVisible();
      await staff.goto(`/staff/checkout.html?bookingId=${bookingId}`);
      await expect(staff.locator("#invoice")).toContainText("Food orders are still pending");
      await expect(staff.locator("#btn-pay")).toBeDisabled();
      await staff.goto(`/staff/orders.html?bookingId=${bookingId}`);
      await order.getByRole("button", { name: "Served", exact: true }).click();
      await expect(order).toHaveCount(0); // Served orders leave the default "In progress" list.
      await staff.locator('button[data-status="SERVED"]').click();
      await expect(order.locator(".badge")).toContainText("Served");
      await staff.goto(`/staff/checkout.html?bookingId=${bookingId}`);
      await expect(staff.locator("#invoice")).toContainText("Payment can be collected.");
      await expect(staff.locator("#btn-pay")).toBeEnabled();
    });
    await test.step("Collect cash once and verify final state, snapshots and audit history", async () => {
      await expect(staff.locator("#invoice tr").filter({ hasText: "Amount due" })).toContainText("270,000 VND");
      await staff.getByLabel("Payment method").selectOption("CASH");
      staff.once("dialog", (dialog) => dialog.accept());
      const paidPromise = staff.waitForResponse((response) => response.url().endsWith(`/bookings/${bookingId}/checkout`) && response.request().method() === "POST");
      await staff.getByRole("button", { name: "Record payment", exact: true }).click();
      const paid = await paidPromise;
      expect(paid.status()).toBe(201);
      await expect(staff.locator("#invoice h2")).toContainText("Completed");
      await expect(staff.locator("#invoice h2")).toContainText("Paid");
      await expect(staff.locator("#btn-pay")).toBeDisabled();
      const saved = (await db.query(`SELECT b.status,b.payment_status,b.checked_in_at,b.room_rate_snapshot,b.movie_title_snapshot,p.amount_vnd,p.original_total_vnd,p.adjustment_vnd,p.method FROM booking b JOIN payment p ON p.booking_id=b.id WHERE b.id=$1`, [bookingId])).rows;
      expect(saved).toHaveLength(1);
      expect(saved[0]).toMatchObject({ status: "COMPLETED", payment_status: "PAID", amount_vnd: 270_000,
        original_total_vnd: 270_000, adjustment_vnd: 0, method: "CASH", room_rate_snapshot: 100_000, movie_title_snapshot: movieTitle });
      expect(saved[0].checked_in_at).toBeTruthy();
      const history = (await db.query(`SELECT field,new_value FROM booking_status_history WHERE booking_id=$1`, [bookingId])).rows;
      expect(history).toEqual(expect.arrayContaining([
        expect.objectContaining({ field: "preparation_status", new_value: "READY" }),
        expect.objectContaining({ field: "status", new_value: "IN_USE" }),
        expect.objectContaining({ field: "status", new_value: "COMPLETED" }),
        expect.objectContaining({ field: "payment_status", new_value: "PAID" }),
      ]));
      await page.goto(`/booking-view.html?code=${bookingCode}`);
      await expect(page.locator("#content h2")).toContainText("Completed");
      await expect(page.locator("#content h2")).toContainText("Paid");
    });
  } finally {
    await staffContext.close();
    // Narrow cleanup: never truncate seed data or other tests' records.
    const client = await db.connect();
    try {
      await client.query("BEGIN");
      for (const table of ["payment", "adjustment", "booking_status_history"]) {
        await client.query(`DELETE FROM ${table} WHERE booking_id IN (SELECT id FROM booking WHERE room_id=$1)`, [roomId]);
      }
      await client.query(`DELETE FROM food_order_item WHERE order_id IN (SELECT id FROM food_order WHERE booking_id IN (SELECT id FROM booking WHERE room_id=$1))`, [roomId]);
      await client.query(`DELETE FROM food_order WHERE booking_id IN (SELECT id FROM booking WHERE room_id=$1)`, [roomId]);
      await client.query("DELETE FROM booking WHERE room_id=$1", [roomId]);
      await client.query(`DELETE FROM idempotency_request WHERE actor_id IN (SELECT id FROM "user" WHERE email=ANY($1::text[]))`, [[staffEmail, customerEmail]]);
      await client.query(`DELETE FROM session WHERE user_id IN (SELECT id FROM "user" WHERE email=ANY($1::text[]))`, [[staffEmail, customerEmail]]);
      await client.query("DELETE FROM login_attempt WHERE email=ANY($1::text[])", [[staffEmail, customerEmail]]);
      await client.query(`DELETE FROM "user" WHERE email=ANY($1::text[])`, [[staffEmail, customerEmail]]);
      await client.query("DELETE FROM room WHERE id=$1", [roomId]);
      await client.query("DELETE FROM movie WHERE id=$1", [movieId]);
      await client.query("DELETE FROM menu_item WHERE id=$1", [itemId]);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
      await db.end();
    }
  }
});
