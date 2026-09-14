// Trang "hôm nay" của nhân viên – Dương (người 1).
import { mountLayout, $, setState } from "../shared/layout";
import { api } from "../shared/api";
import { requireRole } from "../shared/auth";
import type { Booking } from "../shared/types";

await mountLayout("Khu vực nhân viên");
await requireRole("STAFF");
const box = $("#content");
setState(box, "loading");
try {
  const [today, overdue] = await Promise.all([api.get<Booking[]>("/api/staff/bookings"), api.get<Booking[]>("/api/staff/bookings/overdue")]);
  const count = (s: string) => today.filter((b) => b.status === s).length;
  box.innerHTML = `
    <a class="card" href="./schedule.html"><h2>Lịch hôm nay</h2><p>${today.length} booking · ${count("CONFIRMED")} chờ · ${count("IN_USE")} đang dùng · ${count("COMPLETED")} xong</p></a>
    <a class="card" href="./schedule.html#overdue"><h2>Đã qua giờ chưa xử lý</h2><p style="color:${overdue.length ? "var(--err)" : "inherit"}">${overdue.length} booking</p></a>
    <a class="card" href="./walk-in.html"><h2>Khách tại quầy</h2><p>Tạo booking cho khách đến trực tiếp</p></a>
    <a class="card" href="./movie-preparation.html"><h2>Chuẩn bị phim</h2><p>Phim cần sẵn sàng trước giờ</p></a>
    <a class="card" href="./orders.html"><h2>Đơn món</h2><p>Chuẩn bị và phục vụ</p></a>`;
} catch (e) {
  setState(box, "error", (e as Error).message);
}
