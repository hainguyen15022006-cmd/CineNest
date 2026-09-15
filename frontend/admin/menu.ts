// Quản lý menu – Sơn (người 5).
import { mountLayout, escapeHtml } from "../shared/layout";
import { requireRole } from "../shared/auth";
import { money, label } from "../shared/format";
import { mountCrud } from "./crud";
import type { MenuItem } from "../shared/types";

await mountLayout("Menu management");
await requireRole("MANAGER");
mountCrud<MenuItem>({
  listUrl: "/api/admin/menu-items", createUrl: "/api/admin/menu-items", updateUrl: (id) => `/api/admin/menu-items/${id}`, formSel: "#menu-form", listSel: "#list",
  columns: [{ title: "Item", render: (m) => escapeHtml(m.name) }, { title: "Category", render: (m) => label(m.category) }, { title: "Price", render: (m) => money(m.priceVnd) }, { title: "Available for sale", render: (m) => (m.isActive ? "Yes" : "Inactive") }],
  toBody: (f) => ({ name: f.name, category: f.category, priceVnd: Number(f.priceVnd), imageUrl: f.imageUrl ? String(f.imageUrl) : null, isActive: f.isActive === "true" }),
  fillForm: (form, m) => {
    (form.elements.namedItem("name") as HTMLInputElement).value = m.name; (form.elements.namedItem("category") as HTMLSelectElement).value = m.category;
    (form.elements.namedItem("priceVnd") as HTMLInputElement).value = String(m.priceVnd); (form.elements.namedItem("imageUrl") as HTMLInputElement).value = m.imageUrl ?? "";
    (form.elements.namedItem("isActive") as HTMLSelectElement).value = String(m.isActive);
  },
});
