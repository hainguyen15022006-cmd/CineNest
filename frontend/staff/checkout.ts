// Hóa đơn, kết thúc sớm, đề nghị điều chỉnh, thu tiền – Công Thành (người 6). Duyệt trước, thu sau.
import { mountLayout, $, setState, escapeHtml, badge, run, toast, formData, param } from "../shared/layout";
import { api, newIdempotencyKey } from "../shared/api";
import { requireRole } from "../shared/auth";
import { money, label } from "../shared/format";
import type { Invoice } from "../shared/types";

await mountLayout("Invoice and payment");
await requireRole("STAFF");
const bookingId = param("bookingId");
const box = $("#invoice");
const BLOCKER: Record<string, string> = { BOOKING_NOT_SERVING: "Booking is not in use or completed", ALREADY_SETTLED: "Payment has already been settled or waived", ORDERS_UNRESOLVED: "Food orders are still pending or being prepared; serve or cancel them first", ADJUSTMENT_PENDING: "An adjustment is awaiting manager approval" };

async function load() {
  setState(box, "loading");
  try {
    const inv = await api.get<Invoice>(`/api/staff/bookings/${bookingId}/invoice`);
    box.innerHTML = `
      <h2>${escapeHtml(inv.code)} ${badge(inv.status)} ${badge(inv.paymentStatus)}</h2>
      ${inv.endedEarlyReason ? `<p class="muted">End session early: ${escapeHtml(inv.endedEarlyReason)}</p>` : ""}
      <table><tbody>
        <tr><td>Room charge</td><td class="right">${money(inv.roomTotalVnd)}</td></tr>
        <tr><td>Food and drinks (excluding cancelled orders)</td><td class="right">${money(inv.itemsTotalVnd)}</td></tr>
        <tr><th>Original total</th><th class="right">${money(inv.originalTotalVnd)}</th></tr>
        <tr><td>Adjustment ${inv.adjustment ? `(${label(inv.adjustment.kind)} – ${label(inv.adjustment.status)}: ${escapeHtml(inv.adjustment.reason)})` : "(none)"}</td><td class="right">−${money(inv.approvedAdjustmentVnd)}</td></tr>
        <tr><th>Amount due</th><th class="right">${money(inv.amountDueVnd)}</th></tr>
      </tbody></table>
      ${inv.blockers.length ? `<ul class="error-text">${inv.blockers.map((b) => `<li>${escapeHtml(BLOCKER[b] ?? b)}</li>`).join("")}</ul>` : `<p class="status-ok">Payment can be collected.</p>`}
      <p><a href="./booking-detail.html?id=${inv.bookingId}">← Booking details</a> · <a href="./orders.html?bookingId=${inv.bookingId}">Food orders</a></p>`;
    const payButton = $<HTMLButtonElement>("#btn-pay");
    const collectFull = $<HTMLInputElement>("#collect-full");
    const collectFullOption = $("#collect-full-option");
    collectFull.checked = false;
    collectFullOption.classList.toggle("hidden", !inv.canCollectOriginalTotal);
    payButton.disabled = !inv.canCollect;
    collectFull.onchange = () => {
      payButton.disabled = !inv.canCollect && !(inv.canCollectOriginalTotal && collectFull.checked);
    };
    $<HTMLFormElement>("#end-form").classList.toggle("hidden", inv.status !== "IN_USE");
    $<HTMLFormElement>("#adj-form").classList.toggle("hidden", inv.paymentStatus !== "UNPAID" || !["IN_USE", "COMPLETED"].includes(inv.status));
  } catch (e) {
    setState(box, "error", (e as Error).message);
  }
}

$<HTMLFormElement>("#end-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!confirm("End session early: pending items will be cancelled, items being prepared or already served will still be charged. Continue?")) return;
  await run(async () => { await api.post(`/api/staff/bookings/${bookingId}/end-early`, formData($("#end-form") as HTMLFormElement)); toast("Session ended early", "success"); await load(); }, $("#end-form button") as HTMLButtonElement);
});
$<HTMLFormElement>("#adj-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = formData($("#adj-form") as HTMLFormElement);
  await run(async () => {
    await api.post(`/api/staff/bookings/${bookingId}/adjustments`, { kind: f.kind, amountVnd: f.kind === "REDUCE" ? Number(f.amountVnd) : undefined, reason: f.reason });
    toast("Request submitted for manager approval", "success"); await load();
  }, $("#adj-form button") as HTMLButtonElement);
});
let payKey = newIdempotencyKey(); // giữ nguyên khi thử lại (T10)
$<HTMLFormElement>("#pay-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const button = $<HTMLButtonElement>("#btn-pay");
  if (button.disabled) return;
  const collectFullAmount = $<HTMLInputElement>("#collect-full").checked;
  const confirmation = collectFullAmount
    ? "Collect the full original total and withdraw the pending adjustment request?"
    : "Confirm that the full amount due has been collected?";
  if (!confirm(confirmation)) return;
  button.disabled = true;
  // Refresh AFTER run finishes: its generic button reset must not override invoice eligibility.
  await run(async () => {
    const body = { ...formData($("#pay-form") as HTMLFormElement), collectFullAmount };
    const r = await api.post<{ payment: { amountVnd: number } }>(`/api/staff/bookings/${bookingId}/checkout`, body, { idempotencyKey: payKey });
    toast(`Payment recorded: ${money(r.payment.amountVnd)}`, "success");
    payKey = newIdempotencyKey();
  });
  await load();
});
await load();
