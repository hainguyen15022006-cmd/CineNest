import { mountLayout, $, setState, escapeHtml, param } from "./shared/layout";
import { api, qs } from "./shared/api";
import { money } from "./shared/format";
import type { Room } from "./shared/types";

await mountLayout("Room details");
const box = $("#content");
setState(box, "loading");

const searchParams = new URLSearchParams(location.search);
const date = searchParams.get("date");
const startTime = searchParams.get("startTime");
const duration = searchParams.get("duration") ?? "120";
const guests = searchParams.get("guests") ?? "2";
const hasSlot = Boolean(date && startTime);

const roomId = param("id");
if (!roomId) {
  setState(box, "error", "Room ID is missing");
} else {
  try {
    const r = await api.get<Room>(`/api/rooms/${roomId}`);
    const imagesHtml = (r.images && r.images.length > 0)
      ? `<div class="grid" style="margin-bottom:16px">${r.images.map((i) => `<img src="${escapeHtml(i.url)}" alt="${escapeHtml(r.name)}" style="width:100%;border-radius:8px;aspect-ratio:16/10;object-fit:cover">`).join("")}</div>`
      : "";

    const amenitiesHtml = (Array.isArray(r.amenities) && r.amenities.length > 0)
      ? `<div style="margin:12px 0"><h3 style="font-size:1rem;margin-bottom:6px">Amenities</h3><div style="display:flex;gap:6px;flex-wrap:wrap">${r.amenities.map((a) => `<span class="badge">${escapeHtml(a)}</span>`).join("")}</div></div>`
      : "";

    const bookingBarHtml = hasSlot
      ? `<div class="card" style="background:#edf7f9;border-color:#bce1e8;margin:16px 0">
          <p style="margin:0 0 8px"><strong>Selected slot:</strong> ${escapeHtml(date)} at ${escapeHtml(startTime)} (${Number(duration) / 60} hours, ${escapeHtml(guests)} guests)</p>
          <div class="row">
            <a class="btn" href="./booking.html${qs({ roomId: r.id, date, startTime, duration, guests })}">Book this room now</a>
            <a class="btn secondary" href="./rooms.html${qs({ date, startTime, duration, guests })}">View other rooms</a>
          </div>
        </div>`
      : `<div style="margin-top:16px">
          <a class="btn" href="./index.html">Find an available time</a>
        </div>`;

    box.innerHTML = `
      <article class="card">
        ${imagesHtml}
        <h2>${escapeHtml(r.name)}</h2>
        <p class="muted" style="font-size:1rem;margin:6px 0"><strong>${money(r.hourlyPriceVnd)}/hour</strong> · Up to ${r.capacity} guests</p>
        ${r.description ? `<p style="margin:12px 0">${escapeHtml(r.description)}</p>` : ""}
        ${amenitiesHtml}
        ${bookingBarHtml}
        <div style="margin-top:20px;padding-top:12px;border-top:1px solid var(--line)" class="muted">
          <strong>Room Policies:</strong>
          <ul style="margin:6px 0;padding-left:20px">
            <li>Available sessions: 2 hours or 3 hours.</li>
            <li>Each session includes a mandatory 30-minute cleaning buffer between guests.</li>
            <li>Cancellations are allowed up to 2 hours prior to the scheduled start time.</li>
            <li>Arriving late does not extend the session end time.</li>
            <li>Payment is processed in person at the counter.</li>
          </ul>
        </div>
      </article>`;
  } catch (e) {
    setState(box, "error", (e as Error).message);
  }
}
