/**
 * Bộ chọn món dùng chung – Sơn (người 5). Widget sở hữu việc tải menu,
 * chọn số lượng và tính tổng để file booking.ts chỉ điều phối luồng.
 */
import { api } from "./api";
import { escapeHtml } from "./layout";
import { money, label } from "./format";
import type { MenuItem } from "./types";

export type MenuSelection = { menuItemId: number; quantity: number };

export async function mountMenuPicker(host: HTMLElement, initial: MenuSelection[] = []) {
  const menu = await api.get<MenuItem[]>("/api/menu-items");
  const selected = new Map(initial.map((x) => [x.menuItemId, x.quantity]));

  host.innerHTML = `<div class="table-wrap"><table><thead><tr><th>Item</th><th>Price</th><th>Quantity</th></tr></thead><tbody>${menu
    .map((m) => `<tr><td>${escapeHtml(m.name)}<br><span class="muted">${label(m.category)}</span></td><td>${money(m.priceVnd)}</td>
      <td><input type="number" min="0" max="20" value="${selected.get(m.id) ?? 0}" data-id="${m.id}" style="width:80px"></td></tr>`)
    .join("")}</tbody></table></div>`;

  host.querySelectorAll<HTMLInputElement>("input[data-id]").forEach((input) => {
    input.addEventListener("input", () => {
      const quantity = Number(input.value);
      quantity > 0 ? selected.set(Number(input.dataset.id), quantity) : selected.delete(Number(input.dataset.id));
    });
  });

  return {
    get items(): MenuSelection[] {
      return [...selected].map(([menuItemId, quantity]) => ({ menuItemId, quantity }));
    },
    get totalVnd(): number {
      return [...selected].reduce((sum, [id, quantity]) => sum + (menu.find((m) => m.id === id)?.priceVnd ?? 0) * quantity, 0);
    },
    get lines() {
      return [...selected].map(([id, quantity]) => ({ item: menu.find((m) => m.id === id)!, quantity }));
    },
  };
}
