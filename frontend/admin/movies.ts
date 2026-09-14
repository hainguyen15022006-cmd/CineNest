// Quản lý phim – Thành Lê (người 4). MOV07: ngừng phục vụ -> booking đang chọn phim chuyển UNAVAILABLE.
import { mountLayout, escapeHtml } from "../shared/layout";
import { requireRole } from "../shared/auth";
import { mountCrud } from "./crud";
import type { Movie } from "../shared/types";

await mountLayout("Quản lý phim");
await requireRole("MANAGER");
mountCrud<Movie>({
  listUrl: "/api/admin/movies", createUrl: "/api/admin/movies", updateUrl: (id) => `/api/admin/movies/${id}`, formSel: "#movie-form", listSel: "#list",
  searchSel: "#search", pageSize: 50, // kho phim thật vài nghìn phim (npm run db:import-movies) → tìm + phân trang
  columns: [
    { title: "Phim", render: (m) => `${escapeHtml(m.title)}${m.posterUrl ? "" : ' <span class="muted">(chưa có poster)</span>'}` }, { title: "Thể loại", render: (m) => escapeHtml(m.genre) },
    { title: "Thời lượng", render: (m) => `${m.durationMinutes}′` }, { title: "Tuổi", render: (m) => escapeHtml(m.ageLabel) }, { title: "Phục vụ", render: (m) => (m.isActive ? "Có" : "Ngừng") },
  ],
  toBody: (f) => ({ title: f.title, genre: f.genre, durationMinutes: Number(f.durationMinutes), ageLabel: f.ageLabel, description: String(f.description ?? ""), posterUrl: f.posterUrl ? String(f.posterUrl) : null, isActive: f.isActive === "true" }),
  fillForm: (form, m) => {
    for (const k of ["title", "genre", "durationMinutes", "ageLabel", "description", "posterUrl"] as const) (form.elements.namedItem(k) as HTMLInputElement).value = String(m[k] ?? "");
    (form.elements.namedItem("isActive") as HTMLSelectElement).value = String(m.isActive);
  },
});
