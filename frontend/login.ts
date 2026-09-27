// Đăng nhập – Dương (người 1). Sau khi đăng nhập chuyển về ?next= hoặc trang theo vai trò.
import { mountLayout, $, formData, run } from "./shared/layout";
import { api } from "./shared/api";
import { safeNextPath } from "./shared/auth";

const existingUser = await mountLayout("Sign in");
const roleHome = (role: string) =>
  role === "MANAGER" ? "./admin/index.html" : role === "STAFF" ? "./staff/schedule.html" : "./index.html";
const next = safeNextPath(new URLSearchParams(location.search).get("next"));

// Visiting /login while already authenticated should go to the requested page
// (or the role home) instead of showing a stale sign-in form.
if (existingUser) location.replace(next ?? roleHome(existingUser.role));

const form = $<HTMLFormElement>("#login-form");
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  await run(async () => {
    // A wrong password is handled on this page. It must not redirect back to
    // /login with `next=/login.html`, which caused the apparent refresh loop.
    const me = await api.post<{ role: string }>("/api/auth/login", formData(form), { silent401: true });
    location.replace(next ?? roleHome(me.role));
  }, form.querySelector("button"));
});
