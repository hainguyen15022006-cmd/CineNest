// Báo cáo – Công Thành (người 6). Bốn báo cáo bắt buộc (đặc tả trang 10).
import { mountLayout, $, setState, escapeHtml, badge } from "../shared/layout";
import { api, qs } from "../shared/api";
import { requireRole } from "../shared/auth";
import { money, todayVn, dateVn, label } from "../shared/format";

await mountLayout("Reports");
await requireRole("MANAGER");
const from = $<HTMLInputElement>("#from"), to = $<HTMLInputElement>("#to");
from.value = todayVn(-29); to.value = todayVn();

function table(target: HTMLElement, head: string[], rows: string[][]) {
  if (!rows.length) return setState(target, "empty");
  target.innerHTML = `<table><thead><tr>${head.map((h) => `<th>${h}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
}

async function load() {
  const q = qs({ from: from.value, to: to.value });
  for (const id of ["bookings", "revenue", "hours", "unpaid"]) setState($(`#${id}`), "loading");
  try {
    const [bk, rev, hrs, unpaid] = await Promise.all([
      api.get<{ day: string; status: string; count: number }[]>(`/api/admin/reports/bookings${q}`),
      api.get<{ totalVnd: number; byDay: { day: string; payments: number; amount_vnd: number }[]; details: { paid_at: string; code: string; original_total_vnd: number; adjustment_vnd: number; amount_vnd: number; method: string }[] }>(`/api/admin/reports/revenue${q}`),
      api.get<{ day: string; hours: number }[]>(`/api/admin/reports/room-hours${q}`),
      api.get<{ id: number; code: string; start_at: string; status: string; payment_status: string; room_total: number; ended_early_reason: string | null; adjustment_kind: string | null; adjustment_status: string | null; adjustment_vnd: number | null; adjustment_reason: string | null; adjustment_by: string | null }[]>(`/api/admin/reports/unpaid-waived${q}`),
    ]);
    table($("#bookings"), ["Start date", "Status", "Bookings"], bk.map((r) => [dateVn(r.day), badge(r.status), String(r.count)]));
    $("#revenue").innerHTML = `<p><strong>Total collected: ${money(rev.totalVnd)}</strong></p>`;
    const revBox = document.createElement("div"); $("#revenue").appendChild(revBox);
    table(revBox, ["Payment date", "Payments", "Collected"], rev.byDay.map((r) => [dateVn(r.day), String(r.payments), money(r.amount_vnd)]));
    const det = document.createElement("div"); det.style.marginTop = "8px"; $("#revenue").appendChild(det);
    table(det, ["Time", "Booking", "Original total", "Adjustment", "Collected", "Method"], rev.details.map((d) => [dateVn(d.paid_at), escapeHtml(d.code), money(d.original_total_vnd), money(d.adjustment_vnd), money(d.amount_vnd), label(d.method)]));
    table($("#hours"), ["Start date", "Room hours"], hrs.map((r) => [dateVn(r.day), String(r.hours)]));
    table($("#unpaid"), ["Booking", "Date", "Room/charge", "Adjustment", "Notes"], unpaid.map((r) => [
      escapeHtml(r.code), dateVn(r.start_at), `${badge(r.status)} ${badge(r.payment_status)}<br>${money(r.room_total)} room charge`,
      r.adjustment_kind ? `${label(r.adjustment_kind)} ${money(r.adjustment_vnd ?? 0)} – ${label(r.adjustment_status ?? "")}<br><span class="muted">${escapeHtml(r.adjustment_reason ?? "")} (${escapeHtml(r.adjustment_by ?? "")})</span>` : "",
      escapeHtml(r.ended_early_reason ?? ""),
    ]));
  } catch (e) {
    setState($("#bookings"), "error", (e as Error).message);
  }
}
$<HTMLFormElement>("#range-form").addEventListener("submit", (e) => { e.preventDefault(); void load(); });
await load();
