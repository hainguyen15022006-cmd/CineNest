// Hóa đơn, kết thúc sớm, đề nghị điều chỉnh, thu tiền – Công Thành (người 6). Duyệt trước, thu sau.
import { mountLayout, $, setState, escapeHtml, badge, run, toast, formData, param } from "../shared/layout";
import { api, newIdempotencyKey } from "../shared/api";
import { requireRole } from "../shared/auth";
import { money, label } from "../shared/format";
import type { Invoice } from "../shared/types";

await mountLayout("Hóa đơn và thu tiền");
await requireRole("STAFF");
const bookingId = param("bookingId");
const box = $("#invoice");
const BLOCKER: Record<string, string> = { BOOKING_NOT_SERVING: "Booking chưa ở trạng thái đang dùng/hoàn thành", ALREADY_SETTLED: "Đã thanh toán hoặc đã miễn", ORDERS_UNRESOLVED: "Còn món đang chờ/đang làm – phục vụ hoặc hủy trước", ADJUSTMENT_PENDING: "Điều chỉnh đang chờ quản lý duyệt – chưa thu theo mức giảm" };

async function load() {
  setState(box, "loading");
  try {
    const inv = await api.get<Invoice>(`/api/staff/bookings/${bookingId}/invoice`);
    box.innerHTML = `
      <h2>${escapeHtml(inv.code)} ${badge(inv.status)} ${badge(inv.paymentStatus)}</h2>
      ${inv.endedEarlyReason ? `<p class="muted">Kết thúc sớm: ${escapeHtml(inv.endedEarlyReason)}</p>` : ""}
      <table><tbody>
        <tr><td>Tiền phòng</td><td class="right">${money(inv.roomTotalVnd)}</td></tr>
        <tr><td>Tiền món (không tính đơn đã hủy)</td><td class="right">${money(inv.itemsTotalVnd)}</td></tr>
        <tr><th>Tổng gốc</th><th class="right">${money(inv.originalTotalVnd)}</th></tr>
        <tr><td>Điều chỉnh ${inv.adjustment ? `(${label(inv.adjustment.kind)} – ${label(inv.adjustment.status)}: ${escapeHtml(inv.adjustment.reason)})` : "(không có)"}</td><td class="right">−${money(inv.approvedAdjustmentVnd)}</td></tr>
        <tr><th>Số phải trả</th><th class="right">${money(inv.amountDueVnd)}</th></tr>
      </tbody></table>
      ${inv.blockers.length ? `<ul class="error-text">${inv.blockers.map((b) => `<li>${escapeHtml(BLOCKER[b] ?? b)}</li>`).join("")}</ul>` : `<p style="color:var(--ok)">Có thể thu tiền.</p>`}
      <p><a href="./booking-detail.html?id=${inv.bookingId}">← Chi tiết booking</a> · <a href="./orders.html?bookingId=${inv.bookingId}">Đơn món</a></p>`;
    $<HTMLButtonElement>("#btn-pay").disabled = !inv.canCollect;
    $<HTMLFormElement>("#end-form").classList.toggle("hidden", inv.status !== "IN_USE");
    $<HTMLFormElement>("#adj-form").classList.toggle("hidden", inv.paymentStatus !== "UNPAID");
  } catch (e) {
    setState(box, "error", (e as Error).message);
  }
}

$<HTMLFormElement>("#end-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!confirm("Kết thúc sớm: món chờ làm sẽ bị hủy, món đang làm/đã phục vụ vẫn tính tiền. Tiếp tục?")) return;
  await run(async () => { await api.post(`/api/staff/bookings/${bookingId}/end-early`, formData($("#end-form") as HTMLFormElement)); toast("Đã kết thúc sớm", "success"); await load(); }, $("#end-form button") as HTMLButtonElement);
});
$<HTMLFormElement>("#adj-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = formData($("#adj-form") as HTMLFormElement);
  await run(async () => {
    await api.post(`/api/staff/bookings/${bookingId}/adjustments`, { kind: f.kind, amountVnd: f.kind === "REDUCE" ? Number(f.amountVnd) : undefined, reason: f.reason });
    toast("Đã gửi đề nghị, chờ quản lý duyệt", "success"); await load();
  }, $("#adj-form button") as HTMLButtonElement);
});
let payKey = newIdempotencyKey(); // giữ nguyên khi thử lại (T10)
$<HTMLFormElement>("#pay-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!confirm("Xác nhận đã thu đủ Số phải trả?")) return;
  await run(async () => {
    const r = await api.post<{ payment: { amountVnd: number } }>(`/api/staff/bookings/${bookingId}/checkout`, formData($("#pay-form") as HTMLFormElement), { idempotencyKey: payKey });
    toast(`Đã ghi nhận ${money(r.payment.amountVnd)}`, "success"); payKey = newIdempotencyKey(); await load();
  }, $("#btn-pay") as HTMLButtonElement);
});
await load();
