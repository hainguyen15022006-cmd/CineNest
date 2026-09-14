/**
 * Quy tắc thời gian dùng chung (đặc tả trang 4, BR02–BR04) và HÀM KIỂM TRA GIAO NHAU
 * dùng chung giữa tìm phòng trống (Chúc) và tạo booking (Hải Anh) – hợp đồng ranh giới trang 16.
 *
 * Mọi thời điểm lưu UTC (timestamptz); giờ Việt Nam cố định UTC+7 (không có DST).
 */
import { ApiError } from "./http.js";

export const VN_TZ = "Asia/Ho_Chi_Minh";
export const VN_OFFSET = "+07:00";
export const OPEN_TIME = "09:00";
export const CLOSE_TIME = "23:00";
export const CLEANUP_MINUTES = 30;
export const PACKAGE_MINUTES = [120, 180] as const;
export const MIN_LEAD_MINUTES = 30; // BR03: đặt online cách hiện tại >= 30 phút
export const MAX_DAYS_AHEAD = 14; // BR03: đến hết ngày thứ 14 tính cả hôm nay
export const STABILIZE_MINUTES = 10; // MOV03: phim <= thời lượng - 10 phút

/** Trạng thái đang giữ khoảng chiếm dụng (khớp mệnh đề WHERE của EXCLUDE) */
export const HOLDING_STATUSES = ["CONFIRMED", "IN_USE", "COMPLETED"] as const;

export type Window = { startAt: Date; endAt: Date; occupiedUntil: Date };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** 'YYYY-MM-DD' + 'HH:mm' theo giờ Việt Nam -> Date (UTC) */
export function vnToDate(date: string, time: string): Date {
  if (!DATE_RE.test(date) || !TIME_RE.test(time)) {
    throw ApiError.unprocessable("INVALID_DATETIME", "Ngày/giờ không hợp lệ");
  }
  const d = new Date(`${date}T${time}:00${VN_OFFSET}`);
  if (Number.isNaN(d.getTime())) throw ApiError.unprocessable("INVALID_DATETIME", "Ngày/giờ không hợp lệ");
  return d;
}

/** Date -> { date: 'YYYY-MM-DD', time: 'HH:mm' } theo giờ Việt Nam */
export function dateToVn(d: Date): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: VN_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const hour = get("hour") === "24" ? "00" : get("hour");
  return { date: `${get("year")}-${get("month")}-${get("day")}`, time: `${hour}:${get("minute")}` };
}

export function todayVn(now = new Date()): string {
  return dateToVn(now).date;
}

export function addMinutes(d: Date, minutes: number): Date {
  return new Date(d.getTime() + minutes * 60_000);
}

/** Tính cửa sổ chiếm dụng: [startAt, endAt] sử dụng, occupiedUntil = endAt + 30 phút dọn (BR04) */
export function computeWindow(startAt: Date, durationMinutes: number): Window {
  const endAt = addMinutes(startAt, durationMinutes);
  return { startAt, endAt, occupiedUntil: addMinutes(endAt, CLEANUP_MINUTES) };
}

/**
 * HÀM KIỂM TRA GIAO NHAU – khoảng nửa mở [start, end).
 * Hai khoảng giao nhau khi aStart < bEnd && bStart < aEnd. Chạm biên (aEnd == bStart) KHÔNG giao.
 * Ví dụ trang 4: 14:00–16:00 (chiếm dụng đến 16:30): 16:00 bị chặn, 16:30 được phép.
 */
export function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart < bEnd && bStart < aEnd;
}

export type SlotRuleOptions = {
  /** ONLINE: áp dụng báo trước 30 phút và giới hạn 14 ngày; COUNTER: chỉ cần mốc 30 phút kế tiếp (trang 4) */
  source: "ONLINE" | "COUNTER";
  now?: Date;
};

/**
 * Kiểm tra BR02–BR04 cho một khung giờ. Ném ApiError 422 với mã lỗi rõ ràng (T04).
 * Trả về cửa sổ chiếm dụng nếu hợp lệ.
 */
export function validateSlot(date: string, startTime: string, durationMinutes: number, opts: SlotRuleOptions): Window {
  const now = opts.now ?? new Date();
  if (!PACKAGE_MINUTES.includes(durationMinutes as (typeof PACKAGE_MINUTES)[number])) {
    throw ApiError.unprocessable("INVALID_PACKAGE", "Chỉ có gói 120 hoặc 180 phút");
  }
  const startAt = vnToDate(date, startTime);
  const minute = Number(startTime.slice(3, 5));
  if (minute !== 0 && minute !== 30) {
    throw ApiError.unprocessable("INVALID_START_MINUTE", "Giờ bắt đầu phải là mốc :00 hoặc :30");
  }
  const win = computeWindow(startAt, durationMinutes);

  const open = vnToDate(date, OPEN_TIME);
  const close = vnToDate(date, CLOSE_TIME);
  if (startAt < open || win.occupiedUntil > close) {
    throw ApiError.unprocessable(
      "OUTSIDE_HOURS",
      `Cả sử dụng và dọn phòng phải nằm trong ${OPEN_TIME}–${CLOSE_TIME}`,
    );
  }

  if (opts.source === "ONLINE") {
    if (startAt.getTime() - now.getTime() < MIN_LEAD_MINUTES * 60_000) {
      throw ApiError.unprocessable("TOO_SOON", `Phải đặt trước ít nhất ${MIN_LEAD_MINUTES} phút`);
    }
    const lastDate = dateToVn(addMinutes(now, (MAX_DAYS_AHEAD - 1) * 24 * 60)).date;
    if (date > lastDate) {
      throw ApiError.unprocessable("TOO_FAR", `Chỉ đặt trước tối đa ${MAX_DAYS_AHEAD} ngày`);
    }
  } else if (startAt < now) {
    // Tại quầy: bắt đầu ở mốc 30 phút kế tiếp, không nhận giờ đã qua
    throw ApiError.unprocessable("IN_PAST", "Giờ bắt đầu đã qua");
  }
  return win;
}

/** Tiền phòng (trang 7): giá giờ đã chốt × số giờ; dùng số nguyên VND */
export function roomTotal(hourlyPriceVnd: number, durationMinutes: number): number {
  return Math.round((hourlyPriceVnd * durationMinutes) / 60);
}

/** Mã booking dạng CN-YYMMDD-XXXX (đọc được, không đoán được) */
export function generateBookingCode(prefix = "CN", now = new Date()): string {
  const { date } = dateToVn(now);
  const yymmdd = date.slice(2).replace(/-/g, "");
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let suffix = "";
  for (let i = 0; i < 4; i++) suffix += alphabet[Math.floor(Math.random() * alphabet.length)];
  return `${prefix}-${yymmdd}-${suffix}`;
}
