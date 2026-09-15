// Chi tiết phòng – Chúc (người 2).
import { mountLayout, $, setState, escapeHtml, param } from "./shared/layout";
import { api } from "./shared/api";
import { money } from "./shared/format";
import type { Room } from "./shared/types";

await mountLayout("Room details");
const box = $("#content");
setState(box, "loading");
try {
  const r = await api.get<Room>(`/api/rooms/${param("id")}`);
  box.innerHTML = `
    <div class="grid">${(r.images ?? []).map((i) => `<img src="${escapeHtml(i.url)}" alt="" style="width:100%;border-radius:8px">`).join("")}</div>
    <h2>${escapeHtml(r.name)}</h2>
    <p>${escapeHtml(r.description)}</p>
    <p><strong>${money(r.hourlyPriceVnd)}/hour</strong> · up to ${r.capacity} guests</p>
    <ul>${(r.amenities ?? []).map((a) => `<li>${escapeHtml(a)}</li>`).join("")}</ul>
    <p class="muted">Policy: sessions last 2 or 3 hours; each session includes a 30-minute cleaning buffer; customers may cancel up to 2 hours before the start time; arriving late does not extend the end time; payment is made at the counter.</p>
    <a class="btn" href="./index.html">Find an available time</a>`;
} catch (e) {
  setState(box, "error", (e as Error).message);
}
