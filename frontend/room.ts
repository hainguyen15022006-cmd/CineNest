// Chi tiết phòng – Chúc (người 2).
import { mountLayout, $, setState, escapeHtml, param } from "./shared/layout";
import { api } from "./shared/api";
import { money } from "./shared/format";
import type { Room } from "./shared/types";

await mountLayout("Chi tiết phòng");
const box = $("#content");
setState(box, "loading");
try {
  const r = await api.get<Room>(`/api/rooms/${param("id")}`);
  box.innerHTML = `
    <div class="grid">${(r.images ?? []).map((i) => `<img src="${escapeHtml(i.url)}" alt="" style="width:100%;border-radius:8px">`).join("")}</div>
    <h2>${escapeHtml(r.name)}</h2>
    <p>${escapeHtml(r.description)}</p>
    <p><strong>${money(r.hourlyPriceVnd)}/giờ</strong> · tối đa ${r.capacity} khách</p>
    <ul>${(r.amenities ?? []).map((a) => `<li>${escapeHtml(a)}</li>`).join("")}</ul>
    <p class="muted">Chính sách: gói 2 hoặc 3 giờ; dọn phòng 30 phút sau mỗi lượt; tự hủy khi còn ≥ 2 giờ; đến muộn không đổi giờ kết thúc; thanh toán tại quầy.</p>
    <a class="btn" href="./index.html">Tìm giờ trống</a>`;
} catch (e) {
  setState(box, "error", (e as Error).message);
}
