/** Định dạng hiển thị (đặc tả trang 10): tiền 100.000đ, ngày dd/mm/yyyy, giờ 24h theo giờ Việt Nam. */
const VN_TZ = "Asia/Ho_Chi_Minh";

export function money(vnd: number): string {
  return `${Math.round(vnd).toLocaleString("vi-VN")}đ`;
}

export function dateVn(iso: string | Date): string {
  return new Intl.DateTimeFormat("vi-VN", { timeZone: VN_TZ, day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(iso));
}

export function timeVn(iso: string | Date): string {
  return new Intl.DateTimeFormat("vi-VN", { timeZone: VN_TZ, hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));
}

export function dateTimeVn(iso: string | Date): string {
  return `${dateVn(iso)} ${timeVn(iso)}`;
}

/** 'YYYY-MM-DD' của hôm nay theo giờ VN (dùng cho <input type="date">) */
export function todayVn(offsetDays = 0): string {
  const d = new Date(Date.now() + offsetDays * 86_400_000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: VN_TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

export const STATUS_LABEL: Record<string, string> = {
  CONFIRMED: "Đã xác nhận", IN_USE: "Đang sử dụng", COMPLETED: "Hoàn thành", CANCELLED: "Đã hủy", NO_SHOW: "Không đến",
  UNPAID: "Chưa thu", PAID: "Đã thu", WAIVED: "Miễn",
  NOT_SELECTED: "Chưa chọn phim", PENDING: "Chờ chuẩn bị", READY: "Đã chuẩn bị", UNAVAILABLE: "Phim không khả dụng",
  PREPARING: "Đang làm", SERVED: "Đã phục vụ",
  PENDING_APPROVAL: "Chờ duyệt", APPROVED: "Đã duyệt", REJECTED: "Từ chối", REDUCE: "Giảm", WAIVE: "Miễn",
};

export function label(status: string): string {
  return STATUS_LABEL[status] ?? status;
}

/** Các mốc giờ bắt đầu hợp lệ (:00/:30) trong giờ mở cửa cho một gói – BR03/BR04 */
export function startTimeOptions(durationMinutes: number): string[] {
  const out: string[] = [];
  for (let m = 9 * 60; m + durationMinutes + 30 <= 23 * 60; m += 30) {
    out.push(`${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`);
  }
  return out;
}
