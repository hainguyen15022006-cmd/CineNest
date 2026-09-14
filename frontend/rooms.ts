// Kết quả tìm phòng – Chúc (người 2). GET /api/rooms/availability (API được đo ở PF01).
import { mountLayout, $, setState, escapeHtml } from "./shared/layout";
import { api, qs } from "./shared/api";
import { money } from "./shared/format";
import type { Availability } from "./shared/types";

await mountLayout("Phòng trống");
const p = new URLSearchParams(location.search);
const q = { date: p.get("date") ?? "", startTime: p.get("startTime") ?? "", duration: p.get("duration") ?? "120", guests: p.get("guests") ?? "2" };
$("#summary").textContent = `Ngày ${q.date} · ${q.startTime} · gói ${Number(q.duration) / 60} giờ · ${q.guests} khách`;

const box = $("#results");
setState(box, "loading");
try {
  const data = await api.get<Availability>(`/api/rooms/availability${qs(q)}`);
  if (!data.rooms.length) {
    setState(box, "empty", "Không còn phòng trống cho khung giờ này. Hãy đổi giờ hoặc ngày khác.");
  } else {
    box.innerHTML = data.rooms.map((r) => `
      <article class="card">
        ${r.cover ? `<img src="${escapeHtml(r.cover)}" alt="" style="width:100%;border-radius:8px;aspect-ratio:16/10;object-fit:cover">` : ""}
        <h3 style="margin:8px 0 4px">${escapeHtml(r.name)}</h3>
        <p class="muted">Tối đa ${r.capacity} khách · ${money(r.hourlyPriceVnd)}/giờ</p>
        <p><strong>Tiền phòng: ${money(r.roomTotalVnd ?? 0)}</strong></p>
        <div class="row">
          <a class="btn" href="./booking.html${qs({ roomId: r.id, ...q })}">Đặt phòng này</a>
          <a class="btn secondary" href="./room.html?id=${r.id}">Chi tiết</a>
        </div>
      </article>`).join("");
  }
} catch (e) {
  setState(box, "error", (e as Error).message);
}
