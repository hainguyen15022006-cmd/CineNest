// Đơn món – Sơn (người 5). PENDING → PREPARING → SERVED; thêm món cho booking IN_USE.
import { mountLayout, $, setState, escapeHtml, badge, run, toast, formData, param } from "../shared/layout";
import { api } from "../shared/api";
import { requireRole } from "../shared/auth";
import { money, label } from "../shared/format";
import type { Booking, FoodOrder, MenuItem } from "../shared/types";

await mountLayout("Food orders");
await requireRole("STAFF");
const list = $("#list");
const form = $<HTMLFormElement>("#add-form");
const menuSelect = $<HTMLSelectElement>("#menuItemId");
const addButton = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
const menuState = $("#menu-state");

try {
  const menu = await api.get<MenuItem[]>("/api/menu-items");
  if (menu.length === 0) {
    menuSelect.innerHTML = '<option value="">No active menu items</option>';
    menuSelect.disabled = true;
    addButton.disabled = true;
    menuState.textContent = "No menu items are currently available for sale.";
  } else {
    menuSelect.innerHTML = menu.map((m) => `<option value="${m.id}">${escapeHtml(m.name)} – ${money(m.priceVnd)}</option>`).join("");
  }
} catch (error) {
  menuSelect.innerHTML = '<option value="">Menu unavailable</option>';
  menuSelect.disabled = true;
  addButton.disabled = true;
  menuState.className = "error-text";
  menuState.textContent = error instanceof Error ? error.message : "Could not load menu items.";
}
const initialBookingRef = param("bookingCode") ?? param("bookingId");
if (initialBookingRef) {
  $<HTMLInputElement>("#bookingRef").value = initialBookingRef;
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = formData(form);
  await run(async () => {
    const bookingRef = String(f.bookingRef ?? "").trim();
    const booking = await api.get<Booking>(`/api/bookings/${encodeURIComponent(bookingRef)}`);

    await api.post(`/api/staff/bookings/${booking.id}/orders`, {
      items: [
        {
          menuItemId: Number(f.menuItemId),
          quantity: Number(f.quantity),
        },
      ],
    });
    toast("Item added", "success");
    await load("");
  }, form.querySelector("button"));
});

async function load(status: string) {
  document
    .querySelectorAll<HTMLButtonElement>("button[data-status]")
    .forEach((b) => b.classList.toggle("secondary", b.dataset.status !== status));
  setState(list, "loading");
  try {
    const rows = await api.get<FoodOrder[]>(`/api/staff/orders${status ? `?status=${status}` : ""}`);
    if (!rows.length) return setState(list, "empty", "No orders");
    list.innerHTML = `<table><thead><tr><th>Booking</th><th>Items</th><th>Status</th><th>Actions</th></tr></thead><tbody>${rows
      .map(
        (o) => `
      <tr><td><a href="./booking-detail.html?id=${o.booking?.id ?? ""}">${escapeHtml(o.booking?.code ?? "")}</a><br><span class="muted">${escapeHtml(o.booking?.room.name ?? "")} · ${label(o.booking?.status ?? "")}</span></td>
      <td>${o.items.map((i) => `${escapeHtml(i.itemNameSnapshot)} × ${i.quantity}`).join("<br>")}</td><td>${badge(o.status)}</td>
      <td>${o.status === "PENDING" ? `<button type="button" class="small" data-id="${o.id}" data-s="PREPARING">Start preparing</button> <button type="button" class="small secondary" data-id="${o.id}" data-s="CANCELLED">Cancel</button>` : ""}
          ${o.status === "PREPARING" ? `<button type="button" class="small" data-id="${o.id}" data-s="SERVED">Served</button>` : ""}</td></tr>`,
      )
      .join("")}</tbody></table>`;
    list.querySelectorAll<HTMLButtonElement>("button[data-id]").forEach((btn) =>
      btn.addEventListener("click", () =>
        run(async () => {
          await api.patch(`/api/staff/orders/${btn.dataset.id}/status`, { status: btn.dataset.s });
          await load(status);
        }, btn),
      ),
    );
  } catch (e) {
    setState(list, "error", (e as Error).message);
  }
}
document
  .querySelectorAll<HTMLButtonElement>("button[data-status]")
  .forEach((b) => b.addEventListener("click", () => void load(b.dataset.status ?? "")));
await load("");
