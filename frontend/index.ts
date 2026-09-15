// Trang chủ – Chúc (người 2). Form tìm phòng -> rooms.html; danh sách phòng để xem chi tiết.
import { mountLayout, $, setState, escapeHtml } from "./shared/layout";
import { api, qs } from "./shared/api";
import { money, todayVn, startTimeOptions } from "./shared/format";
import type { Room } from "./shared/types";

await mountLayout("Find a room");

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
  const rooms = await api.get<Room[]>("/api/rooms");
  roomsBox.innerHTML = rooms.length
    ? rooms.map((r) => `
      <article class="card">
        ${r.images?.[0] ? `<img src="${escapeHtml(r.images[0].url)}" alt="" style="width:100%;border-radius:8px;aspect-ratio:16/10;object-fit:cover">` : ""}
        <h3 style="margin:8px 0 4px">${escapeHtml(r.name)}</h3>
        <p class="muted">Up to ${r.capacity} guests · ${money(r.hourlyPriceVnd)}/hour</p>
        <a class="btn small secondary" href="./room.html?id=${r.id}">View details</a>
      </article>`).join("")
    : "";
  if (!rooms.length) setState(roomsBox, "empty", "No rooms are available");
} catch (e) {
  setState(roomsBox, "error", (e as Error).message);
}
