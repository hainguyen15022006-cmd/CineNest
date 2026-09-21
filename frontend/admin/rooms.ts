// Quản lý phòng và giá – Chúc (người 2). BR06: không đóng phòng còn booking; BR08: giá mới chỉ cho booking sau.
import { mountLayout, escapeHtml, badge } from "../shared/layout";
import { requireRole } from "../shared/auth";
import { money } from "../shared/format";
import { mountCrud } from "./crud";
import type { Room } from "../shared/types";

await mountLayout("Room and pricing management");
await requireRole("MANAGER");
const split = (s: unknown) => String(s ?? "").split(",").map((x) => x.trim()).filter(Boolean);
mountCrud<Room>({
  listUrl: "/api/admin/rooms", createUrl: "/api/admin/rooms", updateUrl: (id) => `/api/admin/rooms/${id}`, formSel: "#room-form", listSel: "#list",
  columns: [
    { title: "Room", render: (r) => escapeHtml(r.name) },
    { title: "Capacity", render: (r) => `${r.capacity} guests` },
    { title: "Hourly rate", render: (r) => money(r.hourlyPriceVnd) },
    { title: "Amenities", render: (r) => (Array.isArray(r.amenities) && r.amenities.length ? r.amenities.map(escapeHtml).slice(0, 2).join(", ") + (r.amenities.length > 2 ? "…" : "") : "—") },
    { title: "Status", render: (r) => badge(r.isActive ? "READY" : "CANCELLED").replace("Ready", "Active").replace("Cancelled", "Closed") },
  ],
  toBody: (f) => ({ name: f.name, capacity: Number(f.capacity), hourlyPriceVnd: Number(f.hourlyPriceVnd), isActive: f.isActive === "true", description: String(f.description ?? ""), amenities: split(f.amenities), images: split(f.images) }),
  fillForm: (form, r) => {
    (form.elements.namedItem("name") as HTMLInputElement).value = r.name; (form.elements.namedItem("capacity") as HTMLInputElement).value = String(r.capacity);
    (form.elements.namedItem("hourlyPriceVnd") as HTMLInputElement).value = String(r.hourlyPriceVnd); (form.elements.namedItem("isActive") as HTMLSelectElement).value = String(r.isActive ?? true);
    (form.elements.namedItem("description") as HTMLInputElement).value = r.description ?? ""; (form.elements.namedItem("amenities") as HTMLInputElement).value = (r.amenities ?? []).join(", ");
    (form.elements.namedItem("images") as HTMLInputElement).value = (r.images ?? []).map((i) => i.url).join(", ");
  },
});
