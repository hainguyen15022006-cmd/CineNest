// Đăng ký – Dương (người 1). Hệ thống luôn gán CUSTOMER (không gửi role).
import { mountLayout, $, formData, run, toast } from "./shared/layout";
import { api } from "./shared/api";

await mountLayout("Đăng ký");
const form = $<HTMLFormElement>("#register-form");
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  await run(async () => {
    await api.post("/api/auth/register", formData(form));
    toast("Đăng ký thành công", "success");
    location.href = "./index.html";
  }, form.querySelector("button"));
});
