// Chi tiết booking phía khách – Hải Anh (người 3): hủy (T06). Đổi phim (MOV05) – Thành Lê.
import { mountLayout, $, setState, escapeHtml, badge, run, toast, param } from "./shared/layout";
import { api } from "./shared/api";
import { requireRole } from "./shared/auth";
import { money, dateTimeVn, timeVn, label } from "./shared/format";
import type { Booking } from "./shared/types";
import { mountMoviePicker } from "./shared/movie-picker";

await mountLayout("Chi tiết booking");
await requireRole("CUSTOMER");
const box = $("#content");

async function load() {
  setState(box, "loading");
  try {
    const b = await api.get<Booking>(`/api/bookings/${encodeURIComponent(param("code") ?? "")}`);
    const items = (b.foodOrders ?? []).flatMap((o) => o.items.map((i) => ({ ...i, orderStatus: o.status })));
    const canCancel = b.status === "CONFIRMED" && new Date(b.startAt).getTime() - Date.now() >= 2 * 3600_000;
    const canChangeMovie = b.status === "CONFIRMED" && new Date(b.startAt).getTime() > Date.now();
    box.innerHTML = `
      <h2>${escapeHtml(b.code)} ${badge(b.status)} ${badge(b.paymentStatus)}</h2>
      <p><strong>${escapeHtml(b.room.name)}</strong> · ${dateTimeVn(b.startAt)} – ${timeVn(b.endAt)} · ${b.guestCount} khách</p>
      <p>Phim: ${b.movieTitleSnapshot ? `${escapeHtml(b.movieTitleSnapshot)} (${label(b.preparationStatus)})` : "Chọn tại quán"}
        ${canChangeMovie ? `<button type="button" class="small secondary" id="btn-movie">Đổi phim</button>` : ""}</p>
      <div id="movie-picker" class="hidden"></div>
      <table><tbody><tr><td>Tiền phòng</td><td class="right">${money(b.roomTotal)}</td></tr>
        ${items.map((i) => `<tr><td>${escapeHtml(i.itemNameSnapshot)} × ${i.quantity} <span class="muted">(${label(i.orderStatus)})</span></td><td class="right">${money(i.unitPriceVnd * i.quantity)}</td></tr>`).join("")}
      </tbody></table>
      ${b.note ? `<p class="muted">Ghi chú: ${escapeHtml(b.note)}</p>` : ""}
      <p class="muted">Chính sách: tự hủy khi còn ≥ 2 giờ trước giờ bắt đầu. Đến muộn không đổi giờ kết thúc.</p>
      ${canCancel ? `<button type="button" class="danger" id="btn-cancel">Hủy booking</button>` : b.status === "CONFIRMED" ? `<p class="error-text">Đã quá thời hạn tự hủy (cần còn ≥ 2 giờ)</p>` : ""}`;

    document.getElementById("btn-cancel")?.addEventListener("click", async (e) => {
      if (!confirm("Bạn chắc chắn muốn hủy booking này?")) return; // xác nhận trước khi hủy (trang 10)
      await run(async () => { await api.post(`/api/bookings/${b.id}/cancel`, {}); toast("Đã hủy", "success"); await load(); }, e.currentTarget as HTMLButtonElement);
    });
    document.getElementById("btn-movie")?.addEventListener("click", () => {
      const picker$ = $("#movie-picker");
      picker$.classList.remove("hidden");
      const max = (new Date(b.endAt).getTime() - new Date(b.startAt).getTime()) / 60000 - 10;
      const picker = mountMoviePicker(picker$, { maxMinutes: max, selectedId: b.movieId ?? null, allowNone: true, onSelect: () => undefined });
      picker$.insertAdjacentHTML("beforeend", `<div class="row" style="margin-top:8px"><button type="button" class="small" id="btn-save-movie">Lưu phim</button></div>`);
      $("#btn-save-movie").addEventListener("click", async (e) => {
        await run(async () => { await api.patch(`/api/bookings/${b.id}/movie`, { movieId: picker.selectedId }); toast("Đã cập nhật phim", "success"); await load(); }, e.currentTarget as HTMLButtonElement);
      });
    });
  } catch (e) {
    setState(box, "error", (e as Error).message);
  }
}
await load();
