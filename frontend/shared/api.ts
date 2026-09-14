/**
 * Gọi API dùng chung (Dương – shared/). Mọi trang dùng api.get/post/patch, KHÔNG gọi fetch trực tiếp.
 *  - credentials: "include" để gửi cookie phiên.
 *  - Bóc { ok, data, error }; lỗi ném ApiError { status, code, message, details }.
 *  - 401 -> chuyển về login.html?next=<trang hiện tại> (trừ khi opts.silent401).
 *  - Idempotency-Key: truyền qua opts.idempotencyKey cho POST tạo booking / thu tiền.
 */
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

type Opts = { idempotencyKey?: string; silent401?: boolean };

async function call<T>(method: string, url: string, body?: unknown, opts: Opts = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (opts.idempotencyKey) headers["Idempotency-Key"] = opts.idempotencyKey;

  const res = await fetch(url, { method, headers, credentials: "include", body: body === undefined ? undefined : JSON.stringify(body) });
  let json: { ok: boolean; data?: T; error?: { code: string; message: string; details?: unknown } } | null = null;
  try {
    json = await res.json();
  } catch {
    /* không phải JSON */
  }
  if (res.ok && json?.ok) return json.data as T;

  const err = new ApiError(res.status, json?.error?.code ?? "HTTP_ERROR", json?.error?.message ?? `Lỗi ${res.status}`, json?.error?.details);
  if (res.status === 401 && !opts.silent401) {
    const next = encodeURIComponent(location.pathname + location.search);
    location.href = `${basePath()}login.html?next=${next}`;
  }
  throw err;
}

/** Tiền tố để về trang gốc từ /staff/ hoặc /admin/ */
export function basePath(): string {
  return location.pathname.startsWith("/staff/") || location.pathname.startsWith("/admin/") ? "../" : "./";
}

export const api = {
  get: <T>(url: string, opts?: Opts) => call<T>("GET", url, undefined, opts),
  post: <T>(url: string, body?: unknown, opts?: Opts) => call<T>("POST", url, body ?? {}, opts),
  patch: <T>(url: string, body?: unknown, opts?: Opts) => call<T>("PATCH", url, body ?? {}, opts),
};

export function newIdempotencyKey(): string {
  return crypto.randomUUID();
}

export function qs(params: Record<string, string | number | undefined | null>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "") p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : "";
}
