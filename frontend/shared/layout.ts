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
  { role: "GUEST", items: [["Find a room", "index.html"], ["Sign in", "login.html"], ["Create account", "register.html"]] },
  { role: "CUSTOMER", items: [["Find a room", "index.html"], ["My bookings", "my-bookings.html"]] },
  { role: "STAFF", items: [["Today's schedule", "staff/schedule.html"], ["Walk-in", "staff/walk-in.html"], ["Movies", "staff/movie-preparation.html"], ["Food orders", "staff/orders.html"]] },
  { role: "MANAGER", items: [["Management", "admin/index.html"], ["Approvals", "admin/adjustments.html"], ["Reports", "admin/reports.html"]] },
];

export async function mountLayout(title?: string): Promise<Me | null> {
  const me = await currentUser();
  const base = basePath();
  const header = document.getElementById("app-header") ?? document.body.insertBefore(document.createElement("header"), document.body.firstChild);
  header.id = "app-header";

  const groups = NAV.filter((g) => (me ? g.role === me.role || (g.role === "STAFF" && me.role === "MANAGER") : g.role === "GUEST"));
  if (!document.querySelector(".skip-link")) {
    document.body.insertAdjacentHTML("afterbegin", `<a class="skip-link" href="#main-content">Skip to main content</a>`);
  }
  const main = document.querySelector("main");
  if (main && !main.id) main.id = "main-content";
  const currentPath = location.pathname.replace(/\/$/, "/index.html");
  const isCurrent = (href: string) => currentPath.endsWith(`/${href}`) || (href === "index.html" && /\/(?:index\.html)?$/.test(currentPath));

  header.innerHTML = `
    <div class="wrap">
      <a class="brand" href="${base}index.html" aria-label="CineNest home">
        <span class="brand-mark" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><path d="M4 8.5h16v10.25A1.25 1.25 0 0 1 18.75 20H5.25A1.25 1.25 0 0 1 4 18.75V8.5Z" fill="currentColor"/><path d="m4.5 4 14.8-1.7.7 4.2L5.2 8.2 4.5 4Zm3.1-.35L10 7.55m3-4.55 2.4 3.9" stroke="#10172b" stroke-width="1.7"/></svg></span>
        <span>CineNest</span>
      </a>
      <nav aria-label="Main navigation">
        ${groups.flatMap((g) => g.items).map(([text, href]) => `<a href="${base}${href}"${isCurrent(href) ? ' aria-current="page"' : ""}>${text}</a>`).join("")}
      </nav>
      <div class="me">${me ? `<span class="user-chip">${escapeHtml(me.name)} · ${label(me.role)}</span> <button type="button" class="secondary small" id="btn-logout">Sign out</button>` : ""}</div>
    </div>`;
  document.getElementById("btn-logout")?.addEventListener("click", () => void logout());
  if (title) document.title = `${title} – CineNest`;

  if (new URLSearchParams(location.search).get("denied")) toast("You do not have permission to access that page", "error");
  return me;
}

// ---------- tiện ích DOM ----------
export function $<T extends HTMLElement = HTMLElement>(sel: string): T {
  const el = document.querySelector<T>(sel);
  if (!el) throw new Error(`Element not found: ${sel}`);
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
  const text = state === "loading" ? "Loading…" : state === "empty" ? (message ?? "No data available") : (message ?? "Something went wrong");
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
