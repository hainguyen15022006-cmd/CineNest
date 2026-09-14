// Trang quản trị – Dương (người 1).
import { mountLayout, $, setState } from "../shared/layout";
import { api } from "../shared/api";
import { requireRole } from "../shared/auth";

await mountLayout("Quản trị");
await requireRole("MANAGER");
const box = $("#content");
setState(box, "loading");
try {
  const pending = await api.get<unknown[]>("/api/admin/adjustments");
  box.innerHTML = `
    <a class="card" href="./adjustments.html"><h2>Duyệt điều chỉnh</h2><p style="color:${pending.length ? "var(--err)" : "inherit"}">${pending.length} đề nghị chờ duyệt</p></a>
    <a class="card" href="./reports.html"><h2>Báo cáo</h2><p>Booking, doanh thu, giờ phòng, chưa thu và miễn</p></a>
    <a class="card" href="./rooms.html"><h2>Phòng và giá</h2></a>
    <a class="card" href="./movies.html"><h2>Phim</h2></a>
    <a class="card" href="./menu.html"><h2>Menu</h2></a>
    <a class="card" href="./employees.html"><h2>Nhân viên</h2></a>
    <a class="card" href="../staff/schedule.html"><h2>Lịch phòng (màn hình nhân viên)</h2></a>`;
} catch (e) {
  setState(box, "error", (e as Error).message);
}
