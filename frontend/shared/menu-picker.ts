/**
 * Shared menu picker – Sơn (member 5).
 * Loads active menu items, validates quantities and calculates the subtotal.
 */
import { api } from "./api";
import { escapeHtml, setState } from "./layout";
import { money, label } from "./format";
import type { MenuItem } from "./types";

export type MenuSelection = {
  menuItemId: number;
  quantity: number;
};

export async function mountMenuPicker(host: HTMLElement, initial: MenuSelection[] = []) {
  setState(host, "loading");

  let menu: MenuItem[];

  try {
    menu = await api.get<MenuItem[]>("/api/menu-items");
  } catch (error) {
    setState(host, "error", error instanceof Error ? error.message : "Could not load menu.");
    throw error;
  }

  const availableIds = new Set(menu.map((item) => item.id));
  const selected = new Map(
    initial
      .filter((item) => availableIds.has(item.menuItemId) && Number.isInteger(item.quantity) && item.quantity >= 1 && item.quantity <= 20)
      .map((item) => [item.menuItemId, item.quantity]),
  );

  const result = {
    get items(): MenuSelection[] {
      return [...selected].map(([menuItemId, quantity]) => ({
        menuItemId,
        quantity,
      }));
    },

    get totalVnd(): number {
      return [...selected].reduce((sum, [id, quantity]) => {
        const item = menu.find((menuItem) => menuItem.id === id);
        return sum + (item?.priceVnd ?? 0) * quantity;
      }, 0);
    },

    get lines(): { item: MenuItem; quantity: number }[] {
      return [...selected].flatMap(([id, quantity]) => {
        const item = menu.find((menuItem) => menuItem.id === id);
        return item ? [{ item, quantity }] : [];
      });
    },
  };

  if (menu.length === 0) {
    setState(host, "empty", "No menu items are currently available.");
    return result;
  }

  host.innerHTML = `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Item</th>
            <th>Price</th>
            <th>Quantity</th>
          </tr>
        </thead>
        <tbody>
          ${menu
            .map(
              (item) => `
                <tr>
                  <td>
                    <div style="display:flex;align-items:center;gap:12px">
                      ${
                        item.imageUrl
                          ? `<img
                              src="${escapeHtml(item.imageUrl)}"
                              alt="${escapeHtml(item.name)}"
                              loading="lazy"
                              width="64"
                              height="64"
                              data-menu-image
                              style="border-radius:8px;object-fit:cover"
                            >`
                          : ""
                      }
                      <div>
                        <strong>${escapeHtml(item.name)}</strong><br>
                        <span class="muted">${escapeHtml(label(item.category))}</span>
                      </div>
                    </div>
                  </td>
                  <td>${money(item.priceVnd)}</td>
                  <td>
                    <input
                      type="number"
                      min="0"
                      max="20"
                      step="1"
                      inputmode="numeric"
                      value="${selected.get(item.id) ?? 0}"
                      data-id="${item.id}"
                      aria-label="Quantity for ${escapeHtml(item.name)}"
                      style="width:80px"
                    >
                    <div
                      class="error-text"
                      data-error-for="${item.id}"
                      aria-live="polite"
                    ></div>
                  </td>
                </tr>
              `,
            )
            .join("")}
        </tbody>
      </table>
    </div>

    <p class="right" aria-live="polite">
      Food subtotal:
      <strong data-menu-total>${money(result.totalVnd)}</strong>
    </p>
  `;

  const updateTotal = () => {
    const total = host.querySelector<HTMLElement>("[data-menu-total]");
    if (total) total.textContent = money(result.totalVnd);
  };

  host.querySelectorAll<HTMLImageElement>("img[data-menu-image]").forEach((image) => {
    image.addEventListener("error", () => image.remove(), { once: true });
  });

  host.querySelectorAll<HTMLInputElement>("input[data-id]").forEach((input) => {
    input.addEventListener("input", () => {
      const id = Number(input.dataset.id);
      const rawValue = input.value.trim();
      const quantity = Number(rawValue);
      const error = host.querySelector<HTMLElement>(`[data-error-for="${id}"]`);

      let message = "";

      if (rawValue === "" || quantity === 0) {
        selected.delete(id);
      } else if (!Number.isInteger(quantity) || quantity < 1 || quantity > 20) {
        selected.delete(id);
        message = "Enter a whole number from 1 to 20.";
      } else {
        selected.set(id, quantity);
      }

      input.setAttribute("aria-invalid", String(Boolean(message)));
      input.setCustomValidity(message);

      if (error) error.textContent = message;

      updateTotal();
    });

    input.addEventListener("change", () => {
      if (input.getAttribute("aria-invalid") !== "true") return;

      const id = Number(input.dataset.id);
      const error = host.querySelector<HTMLElement>(`[data-error-for="${id}"]`);

      input.value = "0";
      input.setCustomValidity("");
      input.setAttribute("aria-invalid", "false");
      selected.delete(id);

      if (error) {
        error.textContent = "Invalid quantity was reset to 0.";
      }

      updateTotal();
    });
  });

  return result;
}
