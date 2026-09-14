// Đăng nhập – Dương (người 1). Sau khi đăng nhập chuyển về ?next= hoặc trang theo vai trò.
import { mountLayout, $, formData, run } from "./shared/layout";
import { api } from "./shared/api";

await mountLayout("Đăng nhập");
const form = $<HTMLFormElement>("#login-form");
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  await run(async () => {
    const me = await api.post<{ role: string }>("/api/auth/login", formData(form));
    const next = new URLSearchParams(location.search).get("next");
    location.href = next ?? (me.role === "MANAGER" ? "./admin/index.html" : me.role === "STAFF" ? "./staff/schedule.html" : "./index.html");
  }, form.querySelector("button"));
});
