import { expect, test } from "@playwright/test";

function tomorrowVn(): string {
  const now = new Date(Date.now() + 24 * 60 * 60 * 1000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

test("customer registers and completes the four-step booking flow", async ({ page }) => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await page.goto("/register.html");
  await page.getByLabel("Full name").fill("E2E Customer");
  await page.getByLabel("Email").fill(`e2e-${suffix}@test.local`);
  await page.getByLabel("Phone number").fill("0912345678");
  await page.getByLabel(/Password/).fill("Password#1");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/index\.html/);

  await page.getByLabel("Date").fill(tomorrowVn());
  await page.getByLabel("Duration").selectOption("120");
  await page.getByLabel("Start time").selectOption("09:00");
  await page.getByLabel("Guests").fill("2");
  await page.getByRole("button", { name: "Find available rooms" }).click();
  await expect(page).toHaveURL(/rooms\.html/);
  await page.getByRole("link", { name: "Book this room" }).first().click();

  await expect(page.getByRole("heading", { name: "Choose a movie (optional)" })).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "Pre-order food (optional)" })).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "Review and confirm" })).toBeVisible();
  await page.getByRole("button", { name: "Confirm booking" }).click();

  await expect(page).toHaveURL(/booking-view\.html\?code=CN-/);
  await expect(page.getByRole("heading", { level: 2 })).toContainText("CN-");
  // Release the time slot so this smoke test can be rerun against the demo database.
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Cancel booking" }).click();
  await expect(page.getByRole("heading", { level: 2 })).toContainText("Cancelled");
});
