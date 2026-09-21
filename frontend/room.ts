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
      ? `<div class="grid room-gallery">${r.images.map((i) => `<img src="${escapeHtml(i.url)}" alt="${escapeHtml(r.name)}">`).join("")}</div>`
      : "";

    const amenitiesHtml = (Array.isArray(r.amenities) && r.amenities.length > 0)
      ? `<div><h3>Amenities</h3><div class="amenity-list">${r.amenities.map((a) => `<span class="badge">${escapeHtml(a)}</span>`).join("")}</div></div>`
      : "";

    const bookingBarHtml = hasSlot
      ? `<div class="card selected-slot">
          <p><strong>Selected slot:</strong> ${escapeHtml(date)} at ${escapeHtml(startTime)} (${Number(duration) / 60} hours, ${escapeHtml(guests)} guests)</p>
          <div class="row">
            <a class="btn" href="./booking.html${qs({ roomId: r.id, date, startTime, duration, guests })}">Book this room now</a>
            <a class="btn secondary" href="./rooms.html${qs({ date, startTime, duration, guests })}">View other rooms</a>
          </div>
        </div>`
      : `<div class="action-row">
          <a class="btn" href="./index.html">Find an available time</a>
        </div>`;

    box.innerHTML = `
      <article class="card">
        ${imagesHtml}
        <h2>${escapeHtml(r.name)}</h2>
        <p class="room-price"><strong>${money(r.hourlyPriceVnd)}/hour</strong> <span class="muted">· Up to ${r.capacity} guests</span></p>
        ${r.description ? `<p>${escapeHtml(r.description)}</p>` : ""}
        ${amenitiesHtml}
        ${bookingBarHtml}
        <div class="muted policy-box">
          <strong>Room Policies:</strong>
          <ul>
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
