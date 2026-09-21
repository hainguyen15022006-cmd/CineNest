// Trang chủ – Chúc (người 2). Form tìm phòng -> rooms.html; danh sách phòng để xem chi tiết.
import { mountLayout, $, setState, escapeHtml } from "./shared/layout";
import { api, qs } from "./shared/api";
import { money, todayVn, startTimeOptions } from "./shared/format";
import type { Room } from "./shared/types";

// Khởi động tải layout và phòng song song để ảnh phòng đầu tiên không phải chờ
// xong request /me rồi mới bắt đầu (Lighthouse LCP trên trang công khai).
const layoutReady = mountLayout("Find a room");
const roomsRequest = api.get<Room[]>("/api/rooms");
await layoutReady;

const form = $<HTMLFormElement>("#search-form");
const date = $<HTMLInputElement>("#date");
const duration = $<HTMLSelectElement>("#duration");
const startTime = $<HTMLSelectElement>("#startTime");
date.min = todayVn();
date.max = todayVn(13);
date.value = todayVn(1);

function fillTimes() {
  const current = startTime.value;
  startTime.innerHTML = startTimeOptions(Number(duration.value)).map((t) => `<option value="${t}">${t}</option>`).join("");
  startTime.value = current && [...startTime.options].some((o) => o.value === current) ? current : "19:00";
}
duration.addEventListener("change", fillTimes);
fillTimes();

form.addEventListener("submit", (e) => {
  e.preventDefault();
  location.href = `./rooms.html${qs({ date: date.value, startTime: startTime.value, duration: duration.value, guests: $<HTMLInputElement>("#guests").value })}`;
});

const roomsBox = $("#rooms");
setState(roomsBox, "loading");
try {
  const rooms = await roomsRequest;
  roomsBox.innerHTML = rooms.length
    ? rooms.map((r, index) => `
      <article class="card room-card">
        ${r.images?.[0] ? `<img class="room-card-media" src="${escapeHtml(r.images[0].url)}" alt="${escapeHtml(r.name)}" width="800" height="500" decoding="async" ${index === 0 ? 'fetchpriority="high"' : 'loading="lazy"'}>` : ""}
        <div class="room-card-body"><h3>${escapeHtml(r.name)}</h3>
        <p class="room-meta">Up to ${r.capacity} guests</p>
        <p class="room-price"><strong>${money(r.hourlyPriceVnd)}</strong><span class="muted"> / hour</span></p>
        ${Array.isArray(r.amenities) && r.amenities.length ? `<div class="amenity-list">${r.amenities.slice(0, 4).map((a) => `<span class="badge">${escapeHtml(a)}</span>`).join("")}</div>` : ""}
        <div class="room-actions">
          <a class="btn small secondary" href="./room.html?id=${r.id}">View details</a>
        </div></div>
      </article>`).join("")
    : "";
  if (!rooms.length) setState(roomsBox, "empty", "No rooms are available");
} catch (e) {
  setState(roomsBox, "error", (e as Error).message);
}
