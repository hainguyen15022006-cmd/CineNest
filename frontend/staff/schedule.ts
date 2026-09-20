// Lịch ngày theo phòng + bộ lọc quá hạn – Hải Anh (người 3). Cột = slot 30 phút từ 09:00 đến 23:00 (28 cột).
import { mountLayout, $, setState, escapeHtml, badge } from "../shared/layout";
import { api } from "../shared/api";
import { requireRole } from "../shared/auth";
import { todayVn, timeVn, dateTimeVn, label } from "../shared/format";
import type { Booking, Room } from "../shared/types";

await mountLayout("Daily room schedule");
await requireRole("STAFF");
const dateInput = $<HTMLInputElement>("#date");
dateInput.value = new URLSearchParams(location.search).get("date") ?? todayVn();
const SLOT_MS = 30 * 60_000;

function dayStartUtc(date: string): number {
  return new Date(`${date}T09:00:00+07:00`).getTime();
}

function bookingRows(rows: Booking[]): string {
  return `<table><thead><tr><th>Code</th><th>Room</th><th>Customer</th><th>Time</th><th>Status</th><th>Action</th></tr></thead><tbody>${rows
    .map((b) => `<tr><td>${escapeHtml(b.code)}</td><td>${escapeHtml(b.room.name)}</td><td>${escapeHtml(b.contactName)} ${escapeHtml(b.contactPhone)}</td><td>${dateTimeVn(b.startAt)} – ${timeVn(b.endAt)}</td><td>${badge(b.status)}</td><td><a href="./booking-detail.html?id=${b.id}">Manage</a></td></tr>`).join("")}</tbody></table>`;
}

async function load() {
  const grid = $("#grid");
  setState(grid, "loading");
  try {
    const [rooms, bookings] = await Promise.all([api.get<Room[]>("/api/rooms"), api.get<Booking[]>(`/api/staff/bookings?date=${encodeURIComponent(dateInput.value)}`)]);
    const base = dayStartUtc(dateInput.value);
    const head = Array.from({ length: 28 }, (_, i) => `<div class="cell head">${new Date(base + i * SLOT_MS).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Ho_Chi_Minh" })}</div>`).join("");
    // The public room list contains active rooms only. Preserve schedule rows for
    // rooms that were deactivated after bookings had already been created.
    const scheduleRooms: Array<Pick<Room, "id" | "name">> = rooms.map(({ id, name }) => ({ id, name }));
    for (const booking of bookings) {
      if (!scheduleRooms.some((room) => room.id === booking.room.id)) scheduleRooms.push(booking.room);
    }
    scheduleRooms.sort((a, b) => a.name.localeCompare(b.name, "en", { numeric: true }));
    const rows = scheduleRooms.map((r) => {
      const cells: string[] = [];
      for (let i = 0; i < 28; i++) {
        const t = base + i * SLOT_MS;
        const b = bookings.find((x) => x.roomId === r.id && ["CONFIRMED", "IN_USE", "COMPLETED"].includes(x.status) && new Date(x.startAt).getTime() <= t && t < new Date(x.occupiedUntil ?? x.endAt).getTime());
        if (!b) cells.push(`<div class="cell"></div>`);
        else if (t >= new Date(b.endAt).getTime()) cells.push(`<div class="cell"><span class="slot slot-cleanup" title="Cleaning">cleaning</span></div>`);
        else cells.push(`<div class="cell"><a class="slot slot-${b.status}" href="./booking-detail.html?id=${b.id}" title="${escapeHtml(b.code)} – ${label(b.status)}">${new Date(b.startAt).getTime() === t ? `${escapeHtml(b.code.slice(-4))} ${label(b.status)}` : ""}</a></div>`);
      }
      return `<div class="cell room">${escapeHtml(r.name)}</div>${cells.join("")}`;
    });
    grid.innerHTML = `<div class="schedule"><div class="cell head">Room</div>${head}${rows.join("")}</div>`;
  } catch (e) {
    setState(grid, "error", (e as Error).message);
  }

  const od = $("#overdue");
  setState(od, "loading");
  try {
    const rows = await api.get<Booking[]>("/api/staff/bookings/overdue");
    if (!rows.length) return setState(od, "empty", "No overdue bookings");
    od.innerHTML = bookingRows(rows);
  } catch (e) {
    setState(od, "error", (e as Error).message);
  }
}
$<HTMLFormElement>("#date-form").addEventListener("submit", (e) => { e.preventDefault(); void load(); });
$<HTMLFormElement>("#search-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const input = $<HTMLInputElement>("#query"), results = $("#search-results"), button = $<HTMLButtonElement>("#btn-search");
  setState(results, "loading");
  button.disabled = true;
  try {
    const rows = await api.get<Booking[]>(`/api/staff/bookings/search?q=${encodeURIComponent(input.value.trim())}`);
    if (!rows.length) return setState(results, "empty", "No matching bookings");
    results.innerHTML = bookingRows(rows);
  } catch (error) {
    setState(results, "error", (error as Error).message);
  } finally {
    button.disabled = false;
  }
});
await load();
if (location.hash === "#overdue") document.querySelector("#overdue-section")?.scrollIntoView();
