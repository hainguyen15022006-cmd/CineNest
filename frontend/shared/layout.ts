/**
 * Bố cục dùng chung (Dương – shared/): header + menu theo vai trò, thông báo, trạng thái tải/rỗng/lỗi,
 * vài tiện ích DOM nhỏ để các trang không phải lặp lại. Gọi `mountLayout()` đầu mỗi trang.
 *
 * Quy ước (đặc tả trang 10): mỗi trang có trạng thái tải, rỗng, lỗi, thành công; trạng thái không chỉ
 * phân biệt bằng màu (luôn kèm chữ); thao tác chính dùng được bằng bàn phím (dùng <button>/<a> thật).
 */
import { currentUser, logout, type Me } from "./auth";
import { basePath } from "./api";
import { label } from "./format";
import "./styles.css";

const NAV: { role: "GUEST" | "CUSTOMER" | "STAFF" | "MANAGER"; items: [string, string][] }[] = [
  { role: "GUEST", items: [["Tìm phòng", "index.html"], ["Đăng nhập", "login.html"], ["Đăng ký", "register.html"]] },
  { role: "CUSTOMER", items: [["Tìm phòng", "index.html"], ["Booking của tôi", "my-bookings.html"]] },
  { role: "STAFF", items: [["Lịch hôm nay", "staff/schedule.html"], ["Khách tại quầy", "staff/walk-in.html"], ["Chuẩn bị phim", "staff/movie-preparation.html"], ["Đơn món", "staff/orders.html"]] },
  { role: "MANAGER", items: [["Quản trị", "admin/index.html"], ["Duyệt điều chỉnh", "admin/adjustments.html"], ["Báo cáo", "admin/reports.html"]] },
];

export async function mountLayout(title?: string): Promise<Me | null> {
  const me = await currentUser();
  const base = basePath();
  const header = document.getElementById("app-header") ?? document.body.insertBefore(document.createElement("header"), document.body.firstChild);
  header.id = "app-header";

  const groups = NAV.filter((g) => (me ? g.role === me.role || (g.role === "STAFF" && me.role === "MANAGER") : g.role === "GUEST"));
  header.innerHTML = `
    <div class="wrap">
      <a class="brand" href="${base}index.html">🎬 CineNest</a>
      <nav aria-label="Điều hướng chính">
        ${groups.flatMap((g) => g.items).map(([text, href]) => `<a href="${base}${href}">${text}</a>`).join("")}
      </nav>
      <div class="me">${me ? `<span>${escapeHtml(me.name)} · ${label(me.role)}</span> <button type="button" id="btn-logout">Đăng xuất</button>` : ""}</div>
    </div>`;
  document.getElementById("btn-logout")?.addEventListener("click", () => void logout());
  if (title) document.title = `${title} – CineNest`;

  if (new URLSearchParams(location.search).get("denied")) toast("Bạn không có quyền vào trang vừa yêu cầu", "error");
  return me;
}

// ---------- tiện ích DOM ----------
export function $<T extends HTMLElement = HTMLElement>(sel: string): T {
  const el = document.querySelector<T>(sel);
  if (!el) throw new Error(`Không tìm thấy phần tử ${sel}`);
  return el;
}

export function escapeHtml(s: unknown): string {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export function toast(message: string, kind: "info" | "success" | "error" = "info"): void {
  let box = document.getElementById("toast-box");
  if (!box) {
    box = document.createElement("div");
    box.id = "toast-box";
    box.setAttribute("role", "status");
    box.setAttribute("aria-live", "polite");
    document.body.appendChild(box);
  }
  const item = document.createElement("div");
  item.className = `toast toast-${kind}`;
  item.textContent = message;
  box.appendChild(item);
  setTimeout(() => item.remove(), 5000);
}

/** Hiển thị trạng thái tải/rỗng/lỗi trong một vùng */
export function setState(target: HTMLElement, state: "loading" | "empty" | "error", message?: string): void {
  const text = state === "loading" ? "Đang tải…" : state === "empty" ? (message ?? "Không có dữ liệu") : (message ?? "Có lỗi xảy ra");
  target.innerHTML = `<p class="state state-${state}">${escapeHtml(text)}</p>`;
}

/** Bọc thao tác async: khóa nút, hiển thị lỗi API bằng toast */
export async function run<T>(fn: () => Promise<T>, button?: HTMLButtonElement | null): Promise<T | undefined> {
  if (button) button.disabled = true;
  try {
    return await fn();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg !== "redirecting") toast(msg, "error");
    return undefined;
  } finally {
    if (button) button.disabled = false;
  }
}

export function badge(status: string): string {
  return `<span class="badge badge-${escapeHtml(status)}">${escapeHtml(label(status))}</span>`;
}

/** Đọc form thành object (input number -> số) */
export function formData(form: HTMLFormElement): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const [k, v] of new FormData(form).entries()) {
    const input = form.elements.namedItem(k) as HTMLInputElement | null;
    out[k] = input?.type === "number" ? Number(v) : String(v);
  }
  return out;
}

export function param(name: string): string | null {
  return new URLSearchParams(location.search).get(name);
}
