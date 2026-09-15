/**
 * Shared API client (Dương – shared/). Every page uses api.get/post/patch instead of calling fetch directly.
 *  - credentials: "include" sends the session cookie.
 *  - Unwraps { ok, data, error } and throws ApiError { status, code, message, details } on failure.
 *  - A 401 response redirects to login.html?next=<current page>, unless opts.silent401 is set.
 *  - Pass Idempotency-Key through opts.idempotencyKey when creating a booking or collecting payment.
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

const ERROR_MESSAGE: Record<string, string> = {
  UNAUTHORIZED: "Your session or credentials are invalid. Please sign in again.",
  FORBIDDEN: "You do not have permission to perform this action.",
  NOT_FOUND: "The requested resource was not found.",
  VALIDATION_ERROR: "Please check the information you entered.",
  INTERNAL_ERROR: "A system error occurred. Please try again.",
  TOO_MANY_ATTEMPTS: "Too many failed attempts. Please wait and try again.",
  EMAIL_TAKEN: "This email address is already registered.",
  CANNOT_LOCK_SELF: "You cannot lock your own account.",
  ROOM_NOT_FOUND: "The room was not found.",
  ROOM_INACTIVE: "This room is unavailable.",
  ROOM_HAS_BOOKINGS: "This room still has active bookings and cannot be closed.",
  ROOM_TAKEN: "This time slot was just booked. Please choose another room or time.",
  OVER_CAPACITY: "The number of guests exceeds this room's capacity.",
  INVALID_DATETIME: "The selected date or time is invalid.",
  INVALID_PACKAGE: "Please select a 2- or 3-hour session.",
  INVALID_START_MINUTE: "The start time must be on the hour or half hour.",
  TOO_SOON: "Online bookings must be made at least 30 minutes in advance.",
  TOO_FAR: "Bookings can be made up to 14 days in advance.",
  IN_PAST: "The selected start time has already passed.",
  BOOKING_NOT_FOUND: "The booking was not found.",
  BOOKING_LIMIT: "Each account can have up to three upcoming bookings.",
  INVALID_TRANSITION: "This booking status cannot be changed in that way.",
  CANCEL_TOO_LATE: "Self-cancellation is available until 2 hours before the start time.",
  REASON_REQUIRED: "A reason is required.",
  TOO_EARLY_FOR_CHECK_IN: "Check-in is available from the booking start time.",
  PAST_END: "This session has ended. Record use without check-in or mark it as a no-show.",
  TOO_EARLY_FOR_NO_SHOW: "A booking can be marked as a no-show 15 minutes after its start time.",
  NOT_ENDED: "This session has not ended yet. Check the customer in normally.",
  PRICE_CHANGED: "The price has changed. Please review the total and confirm again.",
  MOVIE_NOT_FOUND: "The movie was not found.",
  MOVIE_UNAVAILABLE: "This movie is no longer available.",
  MOVIE_TOO_LONG: "This movie is too long for the selected session.",
  MOVIE_LOCKED: "The movie can only be changed before the session starts.",
  MOVIE_CHANGED: "The movie selection changed. Please reload and try again.",
  MENU_ITEM_UNAVAILABLE: "A selected menu item is no longer available.",
  INVALID_QUANTITY: "Each item quantity must be between 1 and 20.",
  EMPTY_ORDER: "Add at least one item to the order.",
  ORDER_NOT_FOUND: "The food order was not found.",
  NOT_IN_USE: "Items can only be added while the room is in use.",
  ALREADY_PAID: "This booking has already been paid.",
  INVALID_ORDER_TRANSITION: "This food order status cannot be changed in that way.",
  NOT_CHECKED_IN: "Food preparation can only start after check-in.",
  CANNOT_COLLECT: "Payment cannot be collected yet. Resolve the listed items first.",
  ALREADY_SETTLED: "This booking has already been paid or waived.",
  INVALID_ADJUSTMENT: "The adjustment must be greater than zero and cannot exceed the original total.",
  ADJUSTMENT_NOT_FOUND: "The adjustment request was not found.",
  ALREADY_DECIDED: "This adjustment request has already been processed.",
  IDEMPOTENCY_KEY_REQUIRED: "A request key is required. Please refresh and try again.",
  IDEMPOTENCY_KEY_REUSED: "This request key was already used for another action. Please refresh and try again.",
  REQUEST_IN_PROGRESS: "This request is already being processed. Please wait.",
  DUPLICATE: "This record already exists or the action has already been completed.",
  RULE_VIOLATION: "This action violates a business rule.",
  INVALID_REFERENCE: "A referenced record is invalid.",
  BUSY: "The system is busy. Please try again.",
};

function errorMessage(code: string, status: number): string {
  return ERROR_MESSAGE[code] ?? `Request failed (${status}). Please try again.`;
}

async function call<T>(method: string, url: string, body?: unknown, opts: Opts = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (opts.idempotencyKey) headers["Idempotency-Key"] = opts.idempotencyKey;

  const res = await fetch(url, { method, headers, credentials: "include", body: body === undefined ? undefined : JSON.stringify(body) });
  let json: { ok: boolean; data?: T; error?: { code: string; message: string; details?: unknown } } | null = null;
  try {
    json = await res.json();
  } catch {
    /* The response is not JSON. */
  }
  if (res.ok && json?.ok) return json.data as T;

  const code = json?.error?.code ?? "HTTP_ERROR";
  const err = new ApiError(res.status, code, errorMessage(code, res.status), json?.error?.details);
  if (res.status === 401 && !opts.silent401) {
    const next = encodeURIComponent(location.pathname + location.search);
    location.href = `${basePath()}login.html?next=${next}`;
  }
  throw err;
}

/** Prefix for returning to a root page from /staff/ or /admin/. */
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
