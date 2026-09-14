// Đơn món – Sơn (người 5). PENDING → PREPARING → SERVED; thêm món cho booking IN_USE.
import { mountLayout, $, setState, escapeHtml, badge, run, toast, formData, param } from "../shared/layout";
import { api } from "../shared/api";
import { requireRole } from "../shared/auth";
import { money, label } from "../shared/format";
import type { FoodOrder, MenuItem } from "../shared/types";

await mountLayout("Đơn món");
await requireRole("STAFF");
const list = $("#list");
const form = $<HTMLFormElement>("#add-form");
const menu = await api.get<MenuItem[]>("/api/menu-items");
$("#menuItemId").innerHTML = menu.map((m) => `<option value="${m.id}">${m.name} – ${money(m.priceVnd)}</option>`).join("");
if (param("bookingId")) $<HTMLInputElement>("#bookingId").value = param("bookingId")!;

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = formData(form);
  await run(async () => {
    await api.post(`/api/staff/bookings/${f.bookingId}/orders`, { items: [{ menuItemId: Number(f.menuItemId), quantity: Number(f.quantity) }] });
    toast("Đã thêm món", "success"); await load("");
  }, form.querySelector("button"));
});

async function load(status: string) {
  document.querySelectorAll<HTMLButtonElement>("button[data-status]").forEach((b) => b.classList.toggle("secondary", b.dataset.status !== status));
  setState(list, "loading");
  try {
    const rows = await api.get<FoodOrder[]>(`/api/staff/orders${status ? `?status=${status}` : ""}`);
    if (!rows.length) return setState(list, "empty", "Không có đơn");
    list.innerHTML = `<table><thead><tr><th>Đơn</th><th>Booking</th><th>Món</th><th>Trạng thái</th><th></th></tr></thead><tbody>${rows.map((o) => `
      <tr><td>#${o.id}</td><td>${escapeHtml(o.booking?.code ?? "")}<br><span class="muted">${escapeHtml(o.booking?.room.name ?? "")} · ${label(o.booking?.status ?? "")}</span></td>
      <td>${o.items.map((i) => `${escapeHtml(i.itemNameSnapshot)} × ${i.quantity}`).join("<br>")}</td><td>${badge(o.status)}</td>
      <td>${o.status === "PENDING" ? `<button type="button" class="small" data-id="${o.id}" data-s="PREPARING">Bắt đầu làm</button> <button type="button" class="small secondary" data-id="${o.id}" data-s="CANCELLED">Hủy</button>` : ""}
          ${o.status === "PREPARING" ? `<button type="button" class="small" data-id="${o.id}" data-s="SERVED">Đã phục vụ</button>` : ""}</td></tr>`).join("")}</tbody></table>`;
    list.querySelectorAll<HTMLButtonElement>("button[data-id]").forEach((btn) =>
      btn.addEventListener("click", () => run(async () => { await api.patch(`/api/staff/orders/${btn.dataset.id}/status`, { status: btn.dataset.s }); await load(status); }, btn)),
    );
  } catch (e) {
    setState(list, "error", (e as Error).message);
  }
}
document.querySelectorAll<HTMLButtonElement>("button[data-status]").forEach((b) => b.addEventListener("click", () => void load(b.dataset.status ?? "")));
await load("");
