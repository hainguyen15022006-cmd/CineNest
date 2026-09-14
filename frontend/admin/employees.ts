// Quản lý nhân viên – Dương (người 1). Khóa tài khoản => xóa mọi phiên, yêu cầu kế tiếp 401 (T17).
import { mountLayout, $, setState, escapeHtml, run, toast, formData } from "../shared/layout";
import { api } from "../shared/api";
import { requireRole } from "../shared/auth";
import { label } from "../shared/format";

type Staff = { id: number; name: string; email: string; phone: string; role: string; isActive: boolean };

await mountLayout("Quản lý nhân viên");
const me = await requireRole("MANAGER");
const list = $("#list");
const form = $<HTMLFormElement>("#staff-form");

async function load() {
  setState(list, "loading");
  try {
    const rows = await api.get<Staff[]>("/api/admin/staff");
    list.innerHTML = `<table><thead><tr><th>Tên</th><th>Email</th><th>Điện thoại</th><th>Vai trò</th><th>Trạng thái</th><th></th></tr></thead><tbody>${rows
      .map((s) => `<tr><td>${escapeHtml(s.name)}</td><td>${escapeHtml(s.email)}</td><td>${escapeHtml(s.phone)}</td><td>${label(s.role)}</td><td>${s.isActive ? "Hoạt động" : "Đã khóa"}</td>
        <td>${s.id === me.id ? "" : `<button type="button" class="small ${s.isActive ? "danger" : ""}" data-id="${s.id}" data-active="${!s.isActive}">${s.isActive ? "Khóa" : "Mở khóa"}</button>`}</td></tr>`).join("")}</tbody></table>`;
    list.querySelectorAll<HTMLButtonElement>("button[data-id]").forEach((b) =>
      b.addEventListener("click", () => run(async () => { await api.patch(`/api/admin/staff/${b.dataset.id}/active`, { isActive: b.dataset.active === "true" }); await load(); }, b)),
    );
  } catch (e) {
    setState(list, "error", (e as Error).message);
  }
}
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  await run(async () => { await api.post("/api/admin/staff", formData(form)); toast("Đã tạo tài khoản", "success"); form.reset(); await load(); }, form.querySelector("button"));
});
await load();
