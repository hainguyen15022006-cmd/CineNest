import { expect, test } from "@playwright/test";

function tomorrowVn(): string {
  const now = new Date(Date.now() + 24 * 60 * 60 * 1000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

test("khách đăng ký và hoàn thành luồng đặt phòng bốn bước", async ({ page }) => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await page.goto("/register.html");
  await page.getByLabel("Họ tên").fill("Khách E2E");
  await page.getByLabel("Email").fill(`e2e-${suffix}@test.local`);
  await page.getByLabel("Số điện thoại").fill("0912345678");
  await page.getByLabel(/Mật khẩu/).fill("Password#1");
  await page.getByRole("button", { name: "Tạo tài khoản" }).click();
  await expect(page).toHaveURL(/index\.html/);

  await page.getByLabel("Ngày").fill(tomorrowVn());
  await page.getByLabel("Gói").selectOption("120");
  await page.getByLabel("Giờ bắt đầu").selectOption("09:00");
  await page.getByLabel("Số khách").fill("2");
  await page.getByRole("button", { name: "Tìm phòng trống" }).click();
  await expect(page).toHaveURL(/rooms\.html/);
  await page.getByRole("link", { name: "Đặt phòng này" }).first().click();

  await expect(page.getByRole("heading", { name: "Chọn phim (tùy chọn)" })).toBeVisible();
  await page.getByRole("button", { name: "Tiếp tục" }).click();
  await expect(page.getByRole("heading", { name: "Đặt món trước (tùy chọn)" })).toBeVisible();
  await page.getByRole("button", { name: "Tiếp tục" }).click();
  await expect(page.getByRole("heading", { name: "Kiểm tra và xác nhận" })).toBeVisible();
  await page.getByRole("button", { name: "Xác nhận đặt phòng" }).click();

  await expect(page).toHaveURL(/booking-view\.html\?code=CN-/);
  await expect(page.getByRole("heading", { level: 2 })).toContainText("CN-");
  // Trả lại khung giờ để smoke test có thể chạy lặp trên cùng CSDL demo.
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Hủy booking" }).click();
  await expect(page.getByRole("heading", { level: 2 })).toContainText("Đã hủy");
});
