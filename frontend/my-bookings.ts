// Booking của tôi – Hải Anh (người 3).
import { mountLayout, $, setState, escapeHtml, badge } from "./shared/layout";
import { api } from "./shared/api";
import { requireRole } from "./shared/auth";
import { money, dateTimeVn, timeVn } from "./shared/format";
import type { Booking } from "./shared/types";

await mountLayout("My bookings");
await requireRole("CUSTOMER");
const list = $("#list");

async function load(scope: "upcoming" | "past") {
  document.querySelectorAll<HTMLButtonElement>("button[data-scope]").forEach((b) => b.classList.toggle("secondary", b.dataset.scope !== scope));
  setState(list, "loading");
  try {
    const rows = await api.get<Booking[]>(`/api/me/bookings?scope=${scope}`);
    if (!rows.length) return setState(list, "empty", scope === "upcoming" ? "You have no upcoming bookings. Find a room to get started." : "You have no past bookings");
    list.innerHTML = `<table><thead><tr><th>Code</th><th>Room</th><th>Time</th><th>Status</th><th>Amount</th><th></th></tr></thead><tbody>${rows
      .map((b) => `<tr><td>${escapeHtml(b.code)}</td><td>${escapeHtml(b.room.name)}</td><td>${dateTimeVn(b.startAt)} – ${timeVn(b.endAt)}</td>
        <td>${badge(b.status)} ${badge(b.paymentStatus)}</td><td>${money(b.roomTotal)}</td><td><a href="./booking-view.html?code=${encodeURIComponent(b.code)}">Details</a></td></tr>`).join("")}</tbody></table>`;
  } catch (e) {
    setState(list, "error", (e as Error).message);
  }
}
document.querySelectorAll<HTMLButtonElement>("button[data-scope]").forEach((b) => b.addEventListener("click", () => void load(b.dataset.scope as "upcoming" | "past")));
await load("upcoming");
