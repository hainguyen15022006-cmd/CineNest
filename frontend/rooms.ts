// Kết quả tìm phòng – Chúc (người 2). GET /api/rooms/availability (API được đo ở PF01).
import { mountLayout, $, setState, escapeHtml } from "./shared/layout";
import { api, qs } from "./shared/api";
import { money } from "./shared/format";
import type { Availability } from "./shared/types";

await mountLayout("Available rooms");
const p = new URLSearchParams(location.search);
const q = { date: p.get("date") ?? "", startTime: p.get("startTime") ?? "", duration: p.get("duration") ?? "120", guests: p.get("guests") ?? "2" };
$("#summary").textContent = `Date ${q.date} · ${q.startTime} · ${Number(q.duration) / 60}-hour session · ${q.guests} guests`;

const box = $("#results");
setState(box, "loading");
try {
  const data = await api.get<Availability>(`/api/rooms/availability${qs(q)}`);
  if (!data.rooms.length) {
    setState(box, "empty", "No rooms are available for this time slot. Please choose another time or date.");
  } else {
    box.innerHTML = data.rooms.map((r) => `
      <article class="card">
        ${r.cover ? `<img src="${escapeHtml(r.cover)}" alt="" style="width:100%;border-radius:8px;aspect-ratio:16/10;object-fit:cover">` : ""}
        <h3 style="margin:8px 0 4px">${escapeHtml(r.name)}</h3>
        <p class="muted">Up to ${r.capacity} guests · ${money(r.hourlyPriceVnd)}/hour</p>
        <p><strong>Room charge: ${money(r.roomTotalVnd ?? 0)}</strong></p>
        <div class="row">
          <a class="btn" href="./booking.html${qs({ roomId: r.id, ...q })}">Book this room</a>
          <a class="btn secondary" href="./room.html?id=${r.id}">Details</a>
        </div>
      </article>`).join("");
  }
} catch (e) {
  setState(box, "error", (e as Error).message);
}
