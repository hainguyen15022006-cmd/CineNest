// Chi tiết booking (nhân viên) – Hải Anh (người 3): check-in, NO_SHOW, hủy, sử dụng không check-in.
// Tiền, kết thúc sớm, điều chỉnh: sang checkout.html của Công Thành (người 6).
import { mountLayout, $, setState, escapeHtml, badge, run, toast, param } from "../shared/layout";
import { api } from "../shared/api";
import { requireRole } from "../shared/auth";
import { money, dateTimeVn, timeVn, label } from "../shared/format";
import type { Booking } from "../shared/types";

await mountLayout("Booking details");
await requireRole("STAFF");
const id = param("id");
const box = $("#content");

async function act(url: string, body: unknown, btn: HTMLButtonElement, confirmMsg?: string) {
  if (confirmMsg && !confirm(confirmMsg)) return;
  await run(async () => { await api.post(url, body); toast("Updated successfully", "success"); await load(); }, btn);
}

async function load() {
  setState(box, "loading");
  try {
    const b = await api.get<Booking>(`/api/bookings/${id}`);
    const now = Date.now();
    const start = new Date(b.startAt).getTime(), end = new Date(b.endAt).getTime();
    const late = b.status === "CONFIRMED" && now - start > 15 * 60_000;
    box.innerHTML = `
      <h2>${escapeHtml(b.code)} ${badge(b.status)} ${badge(b.paymentStatus)} ${late ? `<span class="badge badge-NO_SHOW">${Math.floor((now - start) / 60_000)} min late</span>` : ""}</h2>
      <p><strong>${escapeHtml(b.room.name)}</strong> · ${dateTimeVn(b.startAt)} – ${timeVn(b.endAt)} · ${b.guestCount} guests · ${label(b.source ?? "ONLINE")}</p>
      <p>Customer: ${escapeHtml(b.contactName)} – ${escapeHtml(b.contactPhone)}</p>
      <p>Movie: ${b.movieTitleSnapshot ? `${escapeHtml(b.movieTitleSnapshot)} (${label(b.preparationStatus)})` : "Choose at the café"} · Room charge ${money(b.roomTotal)}</p>
      ${b.note ? `<p class="muted">Notes: ${escapeHtml(b.note)}</p>` : ""}
      <p>Food: ${(b.foodOrders ?? []).flatMap((o) => o.items.map((i) => `${escapeHtml(i.itemNameSnapshot)} × ${i.quantity} (${label(o.status)})`)).join(", ") || "None"}</p>`;

    const actions = $("#actions");
    actions.innerHTML = "";
    const add = (text: string, cls: string, handler: (btn: HTMLButtonElement) => void) => {
      const btn = document.createElement("button"); btn.type = "button"; btn.className = cls; btn.textContent = text;
      btn.addEventListener("click", () => handler(btn)); actions.appendChild(btn);
    };
    if (b.status === "CONFIRMED" && now < end) add("Check-in", "", (btn) => act(`/api/staff/bookings/${b.id}/check-in`, {}, btn));
    if (b.status === "CONFIRMED" && late) add("Mark as no-show", "danger", (btn) => act(`/api/staff/bookings/${b.id}/no-show`, {}, btn, "Confirm that the customer did not arrive?"));
    if (b.status === "CONFIRMED" && now >= end) add("Record use without check-in (EX06)", "secondary", (btn) => { const note = prompt("Why was the customer not checked in?"); if (note) void act(`/api/staff/bookings/${b.id}/mark-used`, { note }, btn); });
    if (b.status === "CONFIRMED") add("Cancel (reason required)", "secondary", (btn) => { const reason = prompt("Cancellation reason?"); if (reason) void act(`/api/bookings/${b.id}/cancel`, { reason }, btn); });
    if (b.status === "IN_USE" || (b.status === "COMPLETED" && b.paymentStatus === "UNPAID")) {
      const a = document.createElement("a"); a.className = "btn"; a.href = `./checkout.html?bookingId=${b.id}`; a.textContent = "Invoice / payment / end early"; actions.appendChild(a);
    }
    if (b.status === "IN_USE") { const a = document.createElement("a"); a.className = "btn secondary"; a.href = `./orders.html?bookingId=${b.id}`; a.textContent = "Add item"; actions.appendChild(a); }

    $("#history").innerHTML = `<table><thead><tr><th>Time</th><th>Field</th><th>From → to</th><th>Reason</th></tr></thead><tbody>${(b.history ?? [])
      .map((h) => `<tr><td>${dateTimeVn(h.changedAt)}</td><td>${escapeHtml(h.field)}</td><td>${escapeHtml(h.oldValue ?? "–")} → ${escapeHtml(h.newValue)}</td><td>${escapeHtml(h.reason ?? "")}</td></tr>`).join("")}</tbody></table>`;
  } catch (e) {
    setState(box, "error", (e as Error).message);
  }
}
await load();
