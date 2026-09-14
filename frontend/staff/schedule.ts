// Lịch ngày theo phòng + bộ lọc quá hạn – Hải Anh (người 3). Cột = slot 30 phút từ 09:00 đến 23:00 (28 cột).
import { mountLayout, $, setState, escapeHtml, badge } from "../shared/layout";
import { api } from "../shared/api";
import { requireRole } from "../shared/auth";
import { todayVn, timeVn, dateTimeVn, label } from "../shared/format";
import type { Booking, Room } from "../shared/types";

await mountLayout("Lịch ngày theo phòng");
await requireRole("STAFF");
const dateInput = $<HTMLInputElement>("#date");
dateInput.value = new URLSearchParams(location.search).get("date") ?? todayVn();
const SLOT_MS = 30 * 60_000;

function dayStartUtc(date: string): number {
  return new Date(`${date}T09:00:00+07:00`).getTime();
}

async function load() {
  const grid = $("#grid");
  setState(grid, "loading");
  try {
    const [rooms, bookings] = await Promise.all([api.get<Room[]>("/api/admin/rooms").catch(() => api.get<Room[]>("/api/rooms")), api.get<Booking[]>(`/api/staff/bookings?date=${dateInput.value}`)]);
    const base = dayStartUtc(dateInput.value);
    const head = Array.from({ length: 28 }, (_, i) => `<div class="cell head">${new Date(base + i * SLOT_MS).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Ho_Chi_Minh" })}</div>`).join("");
    const rows = rooms.map((r) => {
      const cells: string[] = [];
      for (let i = 0; i < 28; i++) {
        const t = base + i * SLOT_MS;
        const b = bookings.find((x) => x.roomId === r.id && ["CONFIRMED", "IN_USE", "COMPLETED"].includes(x.status) && new Date(x.startAt).getTime() <= t && t < new Date(x.occupiedUntil ?? x.endAt).getTime());
        if (!b) cells.push(`<div class="cell"></div>`);
        else if (t >= new Date(b.endAt).getTime()) cells.push(`<div class="cell"><span class="slot slot-cleanup" title="Dọn phòng">dọn</span></div>`);
        else cells.push(`<div class="cell"><a class="slot slot-${b.status}" href="./booking-detail.html?id=${b.id}" title="${escapeHtml(b.code)} – ${label(b.status)}">${new Date(b.startAt).getTime() === t ? `${escapeHtml(b.code.slice(-4))} ${label(b.status)}` : ""}</a></div>`);
      }
      return `<div class="cell room">${escapeHtml(r.name)}</div>${cells.join("")}`;
    });
    grid.innerHTML = `<div class="schedule"><div class="cell head">Phòng</div>${head}${rows.join("")}</div>`;
  } catch (e) {
    setState(grid, "error", (e as Error).message);
  }

  const od = $("#overdue");
  setState(od, "loading");
  try {
    const rows = await api.get<Booking[]>("/api/staff/bookings/overdue");
    if (!rows.length) return setState(od, "empty", "Không có booking quá hạn");
    od.innerHTML = `<table><thead><tr><th>Mã</th><th>Phòng</th><th>Khách</th><th>Giờ</th><th>Trạng thái</th><th></th></tr></thead><tbody>${rows
      .map((b) => `<tr><td>${escapeHtml(b.code)}</td><td>${escapeHtml(b.room.name)}</td><td>${escapeHtml(b.contactName)} ${escapeHtml(b.contactPhone)}</td><td>${dateTimeVn(b.startAt)} – ${timeVn(b.endAt)}</td><td>${badge(b.status)}</td><td><a href="./booking-detail.html?id=${b.id}">Xử lý</a></td></tr>`).join("")}</tbody></table>`;
  } catch (e) {
    setState(od, "error", (e as Error).message);
  }
}
$<HTMLFormElement>("#date-form").addEventListener("submit", (e) => { e.preventDefault(); void load(); });
await load();
