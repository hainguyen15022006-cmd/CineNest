// Kết quả tìm phòng – Chúc (người 2). GET /api/rooms/availability (API được đo ở PF01).
import { mountLayout, $, setState, escapeHtml } from "./shared/layout";
import { api, qs } from "./shared/api";
import { money } from "./shared/format";
import type { Availability } from "./shared/types";

await mountLayout("Available rooms");
const p = new URLSearchParams(location.search);
const q = { date: p.get("date") ?? "", startTime: p.get("startTime") ?? "", duration: p.get("duration") ?? "120", guests: p.get("guests") ?? "2" };
const box = $("#results");
if (!q.date || !q.startTime) {
  $("#summary").textContent = "No search parameters provided.";
  setState(box, "empty", "Please choose date and start time to search for available rooms.");
  box.insertAdjacentHTML("beforeend", `<p style="text-align:center;margin-top:12px"><a class="btn" href="./index.html">Go to search</a></p>`);
} else {
  $("#summary").textContent = `Date: ${q.date} · Start: ${q.startTime} · ${Number(q.duration) / 60}-hour session · ${q.guests} guests`;
  setState(box, "loading");
  try {
    const data = await api.get<Availability>(`/api/rooms/availability${qs(q)}`);
    if (!data.rooms.length) {
      setState(box, "empty", "No rooms are available for this time slot. Please choose another time or date.");
      box.insertAdjacentHTML("beforeend", `<p style="text-align:center;margin-top:12px"><a class="btn secondary" href="./index.html">Change search criteria</a></p>`);
    } else {
      box.innerHTML = data.rooms.map((r) => `
        <article class="card">
          ${r.cover ? `<img src="${escapeHtml(r.cover)}" alt="" style="width:100%;border-radius:8px;aspect-ratio:16/10;object-fit:cover">` : ""}
          <h3 style="margin:8px 0 4px">${escapeHtml(r.name)}</h3>
          <p class="muted">Up to ${r.capacity} guests · ${money(r.hourlyPriceVnd)}/hour</p>
          ${Array.isArray(r.amenities) && r.amenities.length ? `<div style="display:flex;gap:4px;flex-wrap:wrap;margin:6px 0">${r.amenities.slice(0, 3).map((a) => `<span class="badge">${escapeHtml(a)}</span>`).join("")}</div>` : ""}
          <p style="margin:8px 0"><strong>Room charge: ${money(r.roomTotalVnd ?? 0)}</strong> <span class="muted">(${Number(q.duration) / 60}h)</span></p>
          <div class="row">
            <a class="btn" href="./booking.html${qs({ roomId: r.id, ...q })}">Book this room</a>
            <a class="btn secondary" href="./room.html${qs({ id: r.id, ...q })}">Details</a>
          </div>
        </article>`).join("");
    }
  } catch (e) {
    setState(box, "error", (e as Error).message);
  }
}
