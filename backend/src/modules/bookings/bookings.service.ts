/**
 * Module 3 – Booking (Hải Anh). Đặc tả trang 4, 5, 12 và Phụ lục A.
 * Kiểm thử: T01, T02, T03, T04, T06, T09, T10, T14.
 *
 * Hai hàm ranh giới (trang 16) được xuất từ file này:
 *   - transitionBooking(tx, id, to, actor, reason): chuyển trạng thái sử dụng phòng, có khóa dòng + lịch sử.
 *     Người 6 (Công Thành) CHỈ gọi hàm này, không tự sửa cột status.
 *   - overlaps() / validateSlot() nằm ở core/time.ts, dùng chung với người 2 (Chúc).
 */
import { prisma, type Tx } from "../../core/prisma.js";
import { ApiError } from "../../core/http.js";
import {
  CLOSE_TIME,
  dateToVn,
  generateBookingCode,
  roomTotal,
  validateSlot,
  vnToDate,
  HOLDING_STATUSES,
  type Window,
} from "../../core/time.js";
import type { BookingStatus, BookingSource } from "../../generated/prisma/enums.js";
import { validateMovieForBooking } from "../movies/movies.service.js";
import { buildPreorder, type PreorderLine } from "../menu/menu.service.js";

export const MAX_FUTURE_CONFIRMED = 3; // trang 5
export const CANCEL_BEFORE_MINUTES = 120; // chính sách hủy: >= 2 giờ trước giờ bắt đầu
export const LATE_WARNING_MINUTES = 15; // nhãn cảnh báo/NO_SHOW sau 15 phút
const BOOKING_CODE_RETRIES = 5;

function isUniqueConstraintError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
}

export type Actor = { id: number; role: "CUSTOMER" | "STAFF" | "MANAGER" };

// ------------------------------------------------------------------
// Vòng đời trạng thái sử dụng phòng (trang 5, EX01, EX06)
// ------------------------------------------------------------------
const ALLOWED: Record<BookingStatus, BookingStatus[]> = {
  CONFIRMED: ["IN_USE", "CANCELLED", "NO_SHOW", "COMPLETED"], // COMPLETED = "sử dụng không check-in" (EX06)
  IN_USE: ["COMPLETED"], // check-out hoặc kết thúc sớm (EX01)
  COMPLETED: [],
  CANCELLED: [],
  NO_SHOW: [],
};

export type TransitionOptions = {
  /** EX01: lý do kết thúc sớm được lưu vào ended_early_reason */
  endedEarly?: boolean;
};

/**
 * HÀM RANH GIỚI: chuyển trạng thái sử dụng phòng trong một giao dịch.
 * - Khóa dòng booking (FOR UPDATE) để hai nhân viên không thao tác chéo.
 * - Kiểm tra chuyển tiếp hợp lệ; ghi booking_status_history (field = 'status').
 * - KHÔNG đụng tới payment_status (thuộc module 6).
 */
export async function transitionBooking(
  tx: Tx,
  bookingId: number,
  to: BookingStatus,
  actor: Actor | null,
  reason: string | null,
  opts: TransitionOptions = {},
) {
  const [locked] = await tx.$queryRaw<{ id: number; status: BookingStatus; end_at: Date }[]>`
    SELECT "id", "status", "end_at" FROM "booking" WHERE "id" = ${bookingId} FOR UPDATE`;
  if (!locked) throw ApiError.notFound("BOOKING_NOT_FOUND", "Không tìm thấy booking");

  const from = locked.status;
  if (!ALLOWED[from].includes(to)) {
    throw ApiError.conflict("INVALID_TRANSITION", `Không thể chuyển từ ${from} sang ${to}`);
  }
  const now = new Date();
  const data: Record<string, unknown> = { status: to };
  if (to === "IN_USE") data.checkedInAt = now;
  if (to === "COMPLETED") {
    data.endedAt = now;
    if (opts.endedEarly) data.endedEarlyReason = reason ?? "Kết thúc sớm";
  }
  const booking = await tx.booking.update({ where: { id: bookingId }, data });
  await tx.bookingStatusHistory.create({
    data: { bookingId, field: "status", oldValue: from, newValue: to, actorId: actor?.id ?? null, reason },
  });
  return booking;
}

// ------------------------------------------------------------------
// Tạo booking – hai lớp chống trùng (trang 12, Phụ lục A)
// ------------------------------------------------------------------
export type CreateBookingInput = {
  roomId: number;
  date: string; // YYYY-MM-DD giờ VN
  startTime: string; // HH:mm
  duration: number; // 120 | 180
  guests: number;
  contactName: string;
  contactPhone: string;
  movieId?: number | null;
  items?: { menuItemId: number; quantity: number }[];
  note?: string;
  /** Tổng dự kiến phía khách; chỉ dùng để phát hiện "giá thay đổi" (T09), máy chủ luôn tự tính */
  expectedTotalVnd?: number;
};

export type CreateBookingContext = {
  source: BookingSource;
  /** Khách đăng nhập (ONLINE) – null với khách quầy không có tài khoản */
  customerId: number | null;
  /** Nhân viên tạo hộ (COUNTER) */
  createdById: number | null;
};

/**
 * Bước 1 (idempotency) nằm NGOÀI hàm này – xem core/idempotency.ts và bookings.routes.ts.
 * Các bước 2–6 chạy trong một giao dịch; lỗi 23P01 từ EXCLUDE được ánh xạ thành 409 ở errorHandler.
 */
export async function createBooking(input: CreateBookingInput, ctx: CreateBookingContext) {
  const win: Window = validateSlot(input.date, input.startTime, input.duration, { source: ctx.source });

  let lastCodeCollision: unknown;
  for (let attempt = 1; attempt <= BOOKING_CODE_RETRIES; attempt++) {
    try {
      return await createBookingOnce(input, ctx, win);
    } catch (error) {
      if (!isUniqueConstraintError(error)) throw error;
      lastCodeCollision = error;
    }
  }
  throw lastCodeCollision;
}

function createBookingOnce(input: CreateBookingInput, ctx: CreateBookingContext, win: Window) {
  return prisma.$transaction(
    async (tx) => {
      // 2. Khóa dòng phòng: các yêu cầu cùng phòng xếp hàng tại đây; khác phòng không bị chặn
      const [room] = await tx.$queryRaw<{ id: number; capacity: number; hourly_price_vnd: number; is_active: boolean }[]>`
        SELECT "id", "capacity", "hourly_price_vnd", "is_active" FROM "room" WHERE "id" = ${input.roomId} FOR UPDATE`;
      if (!room || !room.is_active) throw ApiError.unprocessable("ROOM_INACTIVE", "Phòng không tồn tại hoặc ngừng phục vụ");
      if (input.guests < 1 || input.guests > room.capacity) {
        throw ApiError.unprocessable("OVER_CAPACITY", `Phòng này tối đa ${room.capacity} khách`);
      }

      // 3. Phim (MOV02–MOV03) và món (giá chốt từ DB) – hàm của module 4 và 5
      const movie = input.movieId ? await validateMovieForBooking(tx, input.movieId, input.duration) : null;
      const preorder: { lines: PreorderLine[]; totalVnd: number } = await buildPreorder(tx, input.items ?? []);

      const rate = room.hourly_price_vnd;
      const total = roomTotal(rate, input.duration);
      if (input.expectedTotalVnd !== undefined && input.expectedTotalVnd !== total + preorder.totalVnd) {
        throw ApiError.conflict("PRICE_CHANGED", "Giá đã thay đổi, vui lòng xem lại và xác nhận lại", {
          roomTotalVnd: total,
          itemsTotalVnd: preorder.totalVnd,
          totalVnd: total + preorder.totalVnd,
        });
      }

      // 4. Kiểm tra giao nhau để trả 409 kèm gợi ý (lớp 2 EXCLUDE vẫn chặn nếu bước này sót)
      const clash = await tx.booking.findFirst({
        where: {
          roomId: room.id,
          status: { in: [...HOLDING_STATUSES] },
          startAt: { lt: win.occupiedUntil },
          occupiedUntil: { gt: win.startAt },
        },
        select: { id: true },
      });
      if (clash) {
        throw ApiError.conflict("ROOM_TAKEN", "Khung giờ vừa được đặt, vui lòng chọn phòng hoặc giờ khác", {
          suggest: await nextFreeStart(tx, room.id, win),
        });
      }

      // 5. Giới hạn 3 booking tương lai: khóa dòng user để đếm chính xác (T02 dùng 200 khách khác nhau)
      if (ctx.customerId) {
        await tx.$queryRaw`SELECT "id" FROM "user" WHERE "id" = ${ctx.customerId} FOR UPDATE`;
        const n = await tx.booking.count({
          where: { customerId: ctx.customerId, status: "CONFIRMED", startAt: { gt: new Date() } },
        });
        if (n >= MAX_FUTURE_CONFIRMED) {
          throw ApiError.unprocessable("BOOKING_LIMIT", `Mỗi tài khoản tối đa ${MAX_FUTURE_CONFIRMED} booking sắp tới`);
        }
      }

      // 6. Ghi booking, đơn món đặt trước, lịch sử
      const booking = await tx.booking.create({
        data: {
          code: generateBookingCode(),
          customerId: ctx.customerId,
          createdById: ctx.createdById,
          source: ctx.source,
          roomId: room.id,
          contactName: input.contactName,
          contactPhone: input.contactPhone,
          guestCount: input.guests,
          startAt: win.startAt,
          endAt: win.endAt,
          occupiedUntil: win.occupiedUntil,
          status: "CONFIRMED",
          paymentStatus: "UNPAID",
          roomRateSnapshot: rate,
          roomTotal: total,
          movieId: movie?.id ?? null,
          movieTitleSnapshot: movie?.title ?? null,
          movieDurationSnapshot: movie?.durationMinutes ?? null,
          preparationStatus: movie ? "PENDING" : "NOT_SELECTED",
          note: input.note ?? null,
          foodOrders: preorder.lines.length
            ? { create: { createdById: ctx.createdById, items: { create: preorder.lines } } }
            : undefined,
          history: { create: { field: "status", oldValue: null, newValue: "CONFIRMED", actorId: ctx.createdById ?? ctx.customerId, reason: ctx.source } },
        },
        include: { room: { select: { id: true, name: true } }, foodOrders: { include: { items: true } } },
      });
      return { ...booking, itemsTotalVnd: preorder.totalVnd, totalVnd: total + preorder.totalVnd };
    },
    { timeout: 5_000 },
  );
}

/** Gợi ý mốc bắt đầu trống gần nhất cùng phòng, cùng ngày (bước 30 phút) – dùng cho thông báo 409 */
async function nextFreeStart(tx: Tx, roomId: number, win: Window): Promise<string | null> {
  const durationMs = win.endAt.getTime() - win.startAt.getTime();
  const cleanupMs = win.occupiedUntil.getTime() - win.endAt.getTime();
  const date = dateToVn(win.startAt).date;
  const closeAt = vnToDate(date, CLOSE_TIME);
  const holds = await tx.booking.findMany({
    where: { roomId, status: { in: [...HOLDING_STATUSES] }, occupiedUntil: { gt: win.startAt } },
    select: { startAt: true, occupiedUntil: true },
    orderBy: { startAt: "asc" },
  });
  for (let i = 1; i <= 24; i++) {
    const startAt = new Date(win.startAt.getTime() + i * 30 * 60_000);
    const occupiedUntil = new Date(startAt.getTime() + durationMs + cleanupMs);
    if (occupiedUntil > closeAt) break;
    const free = holds.every((booking) => !(startAt < booking.occupiedUntil && booking.startAt < occupiedUntil));
    if (free) return startAt.toISOString();
  }
  return null;
}

// ------------------------------------------------------------------
// Truy vấn và thao tác của khách
// ------------------------------------------------------------------
const listSelect = {
  id: true, code: true, roomId: true, room: { select: { id: true, name: true } },
  startAt: true, endAt: true, guestCount: true, status: true, paymentStatus: true,
  roomTotal: true, movieTitleSnapshot: true, preparationStatus: true, createdAt: true,
} as const;

export function listMyBookings(customerId: number, scope: "upcoming" | "past") {
  const now = new Date();
  return prisma.booking.findMany({
    where: { customerId, ...(scope === "upcoming" ? { status: { in: ["CONFIRMED", "IN_USE"] }, endAt: { gte: now } } : { OR: [{ status: { in: ["COMPLETED", "CANCELLED", "NO_SHOW"] } }, { endAt: { lt: now } }] }) },
    select: listSelect,
    orderBy: { startAt: scope === "upcoming" ? "asc" : "desc" },
    take: 100,
  });
}

/** Chi tiết: chủ sở hữu hoặc nhân viên/quản lý (T05) */
export async function getBookingFor(actor: Actor, idOrCode: string) {
  const where = /^\d+$/.test(idOrCode) ? { id: Number(idOrCode) } : { code: idOrCode };
  const booking = await prisma.booking.findUnique({
    where,
    include: {
      room: { select: { id: true, name: true } },
      movie: { select: { id: true, title: true, durationMinutes: true } },
      foodOrders: { include: { items: true }, orderBy: { id: "asc" } },
      adjustments: { where: { isCurrent: true } },
      payment: true,
      history: { orderBy: { changedAt: "asc" } },
    },
  });
  if (!booking) throw ApiError.notFound("BOOKING_NOT_FOUND", "Không tìm thấy booking");
  if (actor.role === "CUSTOMER" && booking.customerId !== actor.id) {
    throw ApiError.notFound("BOOKING_NOT_FOUND", "Không tìm thấy booking"); // không lộ dữ liệu người khác
  }
  return booking;
}

/** Hủy: khách chỉ khi CONFIRMED và còn >= 2 giờ (T06); nhân viên hủy CONFIRMED bất kỳ lúc nào, bắt buộc lý do */
export async function cancelBooking(actor: Actor, bookingId: number, reason: string | null) {
  return prisma.$transaction(async (tx) => {
    const b = await tx.booking.findUnique({ where: { id: bookingId }, select: { customerId: true, startAt: true, status: true } });
    if (!b || (actor.role === "CUSTOMER" && b.customerId !== actor.id)) throw ApiError.notFound("BOOKING_NOT_FOUND", "Không tìm thấy booking");
    if (b.status !== "CONFIRMED") throw ApiError.conflict("INVALID_TRANSITION", "Chỉ hủy được booking đã xác nhận");
    if (actor.role === "CUSTOMER") {
      const msLeft = b.startAt.getTime() - Date.now();
      if (msLeft < CANCEL_BEFORE_MINUTES * 60_000) {
        throw ApiError.unprocessable("CANCEL_TOO_LATE", "Chỉ tự hủy được khi còn ít nhất 2 giờ trước giờ bắt đầu");
      }
    } else if (!reason) {
      throw ApiError.unprocessable("REASON_REQUIRED", "Nhân viên hủy phải ghi lý do");
    }
    // Món đặt trước chưa chuẩn bị bị hủy cùng booking (trang 5)
    await tx.foodOrder.updateMany({ where: { bookingId, status: "PENDING" }, data: { status: "CANCELLED" } });
    return transitionBooking(tx, bookingId, "CANCELLED", actor, reason ?? "Khách tự hủy");
  });
}

// ------------------------------------------------------------------
// Nhân viên: lịch ngày, quá hạn, check-in, NO_SHOW, sử dụng không check-in, khách tại quầy
// ------------------------------------------------------------------
export function searchStaffBookings(query: string) {
  const q = query.trim();
  return prisma.booking.findMany({
    where: { OR: [{ code: { contains: q, mode: "insensitive" } }, { contactPhone: { contains: q } }] },
    select: { ...listSelect, contactName: true, contactPhone: true, occupiedUntil: true, source: true },
    orderBy: { startAt: "desc" },
    take: 20,
  });
}

export function listSchedule(dayStart: Date, dayEnd: Date) {
  return prisma.booking.findMany({
    where: { startAt: { gte: dayStart, lt: dayEnd } },
    select: { ...listSelect, contactName: true, contactPhone: true, occupiedUntil: true, checkedInAt: true, source: true },
    orderBy: [{ roomId: "asc" }, { startAt: "asc" }],
  });
}

/** Bộ lọc "đã qua giờ nhưng chưa xử lý" (EX06): CONFIRMED quá giờ bắt đầu, IN_USE quá giờ kết thúc */
export function listOverdue(now = new Date()) {
  return prisma.booking.findMany({
    where: { OR: [{ status: "CONFIRMED", startAt: { lt: now } }, { status: "IN_USE", endAt: { lt: now } }] },
    select: { ...listSelect, contactName: true, contactPhone: true, occupiedUntil: true },
    orderBy: { startAt: "asc" },
  });
}

export async function checkIn(actor: Actor, bookingId: number) {
  return prisma.$transaction(async (tx) => {
    const b = await tx.booking.findUnique({ where: { id: bookingId }, select: { startAt: true, endAt: true, status: true } });
    if (!b) throw ApiError.notFound("BOOKING_NOT_FOUND", "Không tìm thấy booking");
    const now = new Date();
    if (b.startAt > now) throw ApiError.conflict("TOO_EARLY_FOR_CHECK_IN", "Chỉ check-in từ giờ bắt đầu của booking");
    if (b.endAt <= now) throw ApiError.conflict("PAST_END", "Đã qua giờ kết thúc; dùng 'sử dụng không check-in' hoặc NO_SHOW (EX06)");
    return transitionBooking(tx, bookingId, "IN_USE", actor, "check-in");
  });
}

export async function markNoShow(actor: Actor, bookingId: number, reason: string | null) {
  return prisma.$transaction(async (tx) => {
    const b = await tx.booking.findUnique({ where: { id: bookingId }, select: { startAt: true } });
    if (!b) throw ApiError.notFound("BOOKING_NOT_FOUND", "Không tìm thấy booking");
    if (Date.now() - b.startAt.getTime() < LATE_WARNING_MINUTES * 60_000) {
      throw ApiError.conflict("TOO_EARLY_FOR_NO_SHOW", `Chỉ đánh dấu NO_SHOW sau ${LATE_WARNING_MINUTES} phút kể từ giờ bắt đầu`);
    }
    await tx.foodOrder.updateMany({ where: { bookingId, status: "PENDING" }, data: { status: "CANCELLED" } });
    return transitionBooking(tx, bookingId, "NO_SHOW", actor, reason ?? "Khách không đến");
  });
}

/** EX06: khách thực tế đã dùng phòng nhưng nhân viên quên check-in, đã qua giờ kết thúc */
export async function markUsedWithoutCheckIn(actor: Actor, bookingId: number, note: string) {
  return prisma.$transaction(async (tx) => {
    const b = await tx.booking.findUnique({ where: { id: bookingId }, select: { endAt: true } });
    if (!b) throw ApiError.notFound("BOOKING_NOT_FOUND", "Không tìm thấy booking");
    if (b.endAt > new Date()) throw ApiError.conflict("NOT_ENDED", "Chưa qua giờ kết thúc; hãy check-in bình thường");
    return transitionBooking(tx, bookingId, "COMPLETED", actor, `Sử dụng không check-in: ${note}`);
  });
}

/** UC04: nhân viên tạo booking tại quầy – cùng cơ chế chống trùng (T14) */
export function createCounterBooking(input: CreateBookingInput, staff: Actor) {
  return createBooking(input, { source: "COUNTER", customerId: null, createdById: staff.id });
}
