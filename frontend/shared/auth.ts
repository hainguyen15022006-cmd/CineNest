/**
 * Kiểm tra phiên và vai trò ở dòng đầu mỗi trang (Dương – shared/).
 *   const me = await requireRole("STAFF");   // MANAGER cũng qua được (quản lý dùng lại trang nhân viên)
 *   const me = await currentUser();          // null nếu chưa đăng nhập (trang công khai)
 */
import { api, basePath } from "./api";

export type Role = "CUSTOMER" | "STAFF" | "MANAGER";
export type Me = { id: number; name: string; email: string; phone: string; role: Role };

let cached: Me | null | undefined;

export async function currentUser(): Promise<Me | null> {
  if (cached !== undefined) return cached;
  try {
    cached = await api.get<Me>("/api/me", { silent401: true });
  } catch {
    cached = null;
  }
  return cached;
}

export function hasRole(me: Me | null, role: Role): boolean {
  if (!me) return false;
  if (role === "STAFF") return me.role === "STAFF" || me.role === "MANAGER";
  return me.role === role;
}

/**
 * Chỉ cho phép quay lại một đường dẫn cùng origin sau đăng nhập.
 * Tránh `?next=https://...` biến trang đăng nhập thành open redirect.
 */
export function safeNextPath(raw: string | null): string | null {
  if (!raw) return null;
  try {
    const target = new URL(raw, location.origin);
    if (target.origin !== location.origin) return null;
    return `${target.pathname}${target.search}${target.hash}`;
  } catch {
    return null;
  }
}

/** Chuyển về login nếu chưa đăng nhập; về trang chủ kèm thông báo nếu sai vai trò. */
export async function requireRole(role: Role): Promise<Me> {
  const me = await currentUser();
  if (!me) {
    location.replace(`${basePath()}login.html?next=${encodeURIComponent(location.pathname + location.search)}`);
    return new Promise<never>(() => {}); // trang sẽ chuyển hướng; không chạy tiếp mã của trang
  }
  if (!hasRole(me, role)) {
    location.replace(`${basePath()}index.html?denied=1`);
    return new Promise<never>(() => {});
  }
  return me;
}

export async function logout(): Promise<void> {
  await api.post("/api/auth/logout");
  cached = null;
  location.href = `${basePath()}index.html`;
}
