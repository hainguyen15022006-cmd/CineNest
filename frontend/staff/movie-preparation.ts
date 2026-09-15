// Chuẩn bị phim – Thành Lê (người 4). READY dùng khóa lạc quan expectedVersion (MOV06).
import { mountLayout, $, setState, escapeHtml, badge, run, toast } from "../shared/layout";
import { api } from "../shared/api";
import { requireRole } from "../shared/auth";
import { todayVn, timeVn } from "../shared/format";

type Row = { id: number; code: string; startAt: string; room: { name: string }; movieTitleSnapshot: string; movieDurationSnapshot: number; preparationStatus: string; movieVersion: number };

await mountLayout("Movie preparation");
await requireRole("STAFF");
const dateInput = $<HTMLInputElement>("#date"); dateInput.value = todayVn();
const list = $("#list");

async function load() {
  setState(list, "loading");
  try {
    const rows = await api.get<Row[]>(`/api/staff/preparation?date=${dateInput.value}`);
    if (!rows.length) return setState(list, "empty", "No movies need preparation on this date");
    list.innerHTML = `<table><thead><tr><th>Time</th><th>Room</th><th>Booking</th><th>Movie</th><th>Status</th><th></th></tr></thead><tbody>${rows
      .map((r) => `<tr><td>${timeVn(r.startAt)}</td><td>${escapeHtml(r.room.name)}</td><td>${escapeHtml(r.code)}</td><td>${escapeHtml(r.movieTitleSnapshot)} (${r.movieDurationSnapshot}′)</td><td>${badge(r.preparationStatus)}</td>
        <td>${r.preparationStatus !== "READY" ? `<button type="button" class="small" data-id="${r.id}" data-v="${r.movieVersion}" data-s="READY">Ready</button>` : ""}
            <button type="button" class="small secondary" data-id="${r.id}" data-v="${r.movieVersion}" data-s="UNAVAILABLE">Mark unavailable</button></td></tr>`).join("")}</tbody></table>`;
    list.querySelectorAll<HTMLButtonElement>("button[data-id]").forEach((btn) =>
      btn.addEventListener("click", () => run(async () => {
        await api.patch(`/api/staff/bookings/${btn.dataset.id}/preparation`, { status: btn.dataset.s, expectedVersion: Number(btn.dataset.v) });
        toast("Updated successfully", "success"); await load();
      }, btn)),
    );
  } catch (e) {
    setState(list, "error", (e as Error).message);
  }
}
$<HTMLFormElement>("#date-form").addEventListener("submit", (e) => { e.preventDefault(); void load(); });
await load();
