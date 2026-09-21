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
  box.insertAdjacentHTML("beforeend", `<p class="state"><a class="btn" href="./index.html">Go to search</a></p>`);
} else {
  $("#summary").textContent = `Date: ${q.date} · Start: ${q.startTime} · ${Number(q.duration) / 60}-hour session · ${q.guests} guests`;
  setState(box, "loading");
  try {
    const data = await api.get<Availability>(`/api/rooms/availability${qs(q)}`);
    if (!data.rooms.length) {
      setState(box, "empty", "No rooms are available for this time slot. Please choose another time or date.");
      box.insertAdjacentHTML("beforeend", `<p class="state"><a class="btn secondary" href="./index.html">Change search criteria</a></p>`);
    } else {
      box.innerHTML = data.rooms.map((r) => `
        <article class="card room-card">
          ${r.cover ? `<img class="room-card-media" src="${escapeHtml(r.cover)}" alt="${escapeHtml(r.name)}">` : ""}
          <div class="room-card-body"><h3>${escapeHtml(r.name)}</h3>
          <p class="room-meta">Up to ${r.capacity} guests · ${money(r.hourlyPriceVnd)}/hour</p>
          ${Array.isArray(r.amenities) && r.amenities.length ? `<div class="amenity-list">${r.amenities.slice(0, 4).map((a) => `<span class="badge">${escapeHtml(a)}</span>`).join("")}</div>` : ""}
          <p class="room-price"><strong>Room charge: ${money(r.roomTotalVnd ?? 0)}</strong> <span class="muted">(${Number(q.duration) / 60}h)</span></p>
          <div class="room-actions">
            <a class="btn" href="./booking.html${qs({ roomId: r.id, ...q })}">Book this room</a>
            <a class="btn secondary" href="./room.html${qs({ id: r.id, ...q })}">Details</a>
          </div></div>
        </article>`).join("");
    }
  } catch (e) {
    setState(box, "error", (e as Error).message);
  }
}
