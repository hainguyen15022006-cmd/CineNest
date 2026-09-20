/**
 * Module 6 – Thanh toán, ngoại lệ, báo cáo (Công Thành). Đặc tả trang 7, 8 (EX01–EX07), 12; kiểm thử T10–T12, T15, T16.
 *
 * Nguyên tắc "duyệt trước, thu sau": chỉ điều chỉnh APPROVED mới được trừ; chưa duyệt thì thu đủ Tổng gốc
 * hoặc để UNPAID. Mỗi booking một Payment. Module này CHỈ gọi transitionBooking() của module 3 và
 * computeItemsForBilling() của module 5, không tự sửa status hay tính lại tiền món.
 */
import { ApiError } from "../../core/http.js";
import { transitionBooking, type Actor } from "../bookings/bookings.service.js";
import { computeItemsForBilling, resolveOrdersOnEarlyEnd } from "../menu/menu.service.js";
import type { PaymentMethod } from "../../generated/prisma/enums.js";
import { prisma, type Tx } from "../../core/prisma.js";

export type Invoice = {
  bookingId: number;
  code: string;
  status: string;
  paymentStatus: string;
  endedEarlyReason: string | null;
  roomTotalVnd: number;
  itemsTotalVnd: number;
  originalTotalVnd: number;
  adjustment: { id: number; kind: string; status: string; amountVnd: number; reason: string } | null;
  /** Chỉ APPROVED mới được trừ (trang 7) */
  approvedAdjustmentVnd: number;
  amountDueVnd: number;
  unresolvedOrderIds: number[];
  /** Có thể thu ngay? Sai nếu còn món dở (khi không kết thúc sớm) hoặc điều chỉnh còn chờ duyệt */
  canCollect: boolean;
  /** Chỉ đúng khi vật cản duy nhất là đề nghị đang chờ; nhân viên có thể chủ động thu đủ Tổng gốc. */
  canCollectOriginalTotal: boolean;
  blockers: string[];
};

/**
 * Computes the invoice for a given booking.
 * Acts as the Source of Truth for billing and collection readiness.
 */
export async function computeInvoice(tx: Tx, bookingId: number): Promise<Invoice> {
  const b = await tx.booking.findUnique({
    where: { id: bookingId },
    select: { id: true, code: true, status: true, paymentStatus: true, roomTotal: true, endedEarlyReason: true },
  });
  if (!b) throw ApiError.notFound("BOOKING_NOT_FOUND", "Booking not found");

  const items = await computeItemsForBilling(tx, bookingId);
  const adj = await tx.adjustment.findFirst({ where: { bookingId, isCurrent: true } });

  const originalTotal = b.roomTotal + items.itemsTotalVnd;

  /** Chỉ APPROVED mới được trừ (trang 7) - Capped at originalTotal */
  const approved = adj && adj.status === "APPROVED" ? Math.min(adj.amountVnd, originalTotal) : 0;

  const blockers: string[] = [];
  if (b.status !== "IN_USE" && b.status !== "COMPLETED") blockers.push("BOOKING_NOT_SERVING");
  if (b.paymentStatus !== "UNPAID") blockers.push("ALREADY_SETTLED");
  if (items.unresolvedOrderIds.length > 0 && !b.endedEarlyReason) blockers.push("ORDERS_UNRESOLVED");
  if (adj && adj.status === "PENDING_APPROVAL") blockers.push("ADJUSTMENT_PENDING");

  return {
    bookingId: b.id,
    code: b.code,
    status: b.status,
    paymentStatus: b.paymentStatus,
    endedEarlyReason: b.endedEarlyReason,
    roomTotalVnd: b.roomTotal,
    itemsTotalVnd: items.itemsTotalVnd,
    originalTotalVnd: originalTotal,
    adjustment: adj ? { id: adj.id, kind: adj.kind, status: adj.status, amountVnd: adj.amountVnd, reason: adj.reason } : null,
    approvedAdjustmentVnd: approved,
    amountDueVnd: b.paymentStatus === "UNPAID" ? originalTotal - approved : 0,
    unresolvedOrderIds: items.unresolvedOrderIds,
    canCollect: blockers.length === 0,
    canCollectOriginalTotal: blockers.length === 1 && blockers[0] === "ADJUSTMENT_PENDING",
    blockers,
  };
}

export function getInvoice(bookingId: number) {
  return prisma.$transaction((tx) => computeInvoice(tx, bookingId));
}

/**
 * Thu tiền và hoàn thành nguyên tử (UC05, T10, T11, T15). Idempotency-Key xử lý ở route.
 * Khóa dòng booking -> kiểm tra món và điều chỉnh -> tính lại hóa đơn -> chèn payment (unique booking_id)
 * -> payment_status = PAID -> nếu IN_USE thì transitionBooking(COMPLETED) -> lịch sử.
 */
export async function checkout(bookingId: number, method: PaymentMethod, idempotencyKey: string, staff: Actor, collectFullAmount = false) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "booking" WHERE "id" = ${bookingId} FOR UPDATE`;
    const inv = await computeInvoice(tx, bookingId);
    if (inv.paymentStatus === "PAID") throw ApiError.conflict("ALREADY_PAID", "Booking đã thanh toán");
    const collectingOriginalTotal = collectFullAmount && inv.canCollectOriginalTotal;
    if (!inv.canCollect && !collectingOriginalTotal) {
      throw ApiError.conflict("CANNOT_COLLECT", "Chưa thể thu tiền", { blockers: inv.blockers, unresolvedOrderIds: inv.unresolvedOrderIds });
    }
    if (collectingOriginalTotal) {
      await tx.adjustment.updateMany({
        where: { bookingId, isCurrent: true, status: "PENDING_APPROVAL" },
        data: { isCurrent: false },
      });
      await tx.bookingStatusHistory.create({
        data: {
          bookingId,
          field: "adjustment",
          oldValue: "PENDING_APPROVAL",
          newValue: "WITHDRAWN",
          actorId: staff.id,
          reason: "Customer agreed to pay the full original total",
        },
      });
    }
    const payment = await tx.payment.create({
      data: {
        bookingId,
        originalTotalVnd: inv.originalTotalVnd,
        adjustmentVnd: inv.approvedAdjustmentVnd,
        amountVnd: inv.amountDueVnd,
        method,
        recordedById: staff.id,
        idempotencyKey,
      },
    });
    await tx.booking.update({ where: { id: bookingId }, data: { paymentStatus: "PAID" } });
    await tx.bookingStatusHistory.create({ data: { bookingId, field: "payment_status", oldValue: "UNPAID", newValue: "PAID", actorId: staff.id, reason: method } });
    if (inv.status === "IN_USE") await transitionBooking(tx, bookingId, "COMPLETED", staff, "check-out");
    return {
      payment,
      invoice: {
        ...inv,
        paymentStatus: "PAID",
        status: "COMPLETED",
        adjustment: collectingOriginalTotal ? null : inv.adjustment,
        amountDueVnd: 0,
        canCollect: false,
        canCollectOriginalTotal: false,
        blockers: ["ALREADY_SETTLED"],
      },
    };
  });
}

/** EX01 + EX02: kết thúc sớm có lý do; món PENDING hủy, PREPARING/SERVED tính tiền; tiền xử lý sau. */
export async function endEarly(bookingId: number, reason: string, staff: Actor) {
  return prisma.$transaction(async (tx) => {
    const booking = await transitionBooking(tx, bookingId, "COMPLETED", staff, reason, { endedEarly: true });
    await resolveOrdersOnEarlyEnd(tx, bookingId);
    return { booking, invoice: await computeInvoice(tx, bookingId) };
  });
}

/** EX03/EX04: nhân viên tạo đề nghị giảm (REDUCE) hoặc miễn (WAIVE) – chờ quản lý duyệt. */
export async function proposeAdjustment(bookingId: number, kind: "REDUCE" | "WAIVE", amountVnd: number | undefined, reason: string, staff: Actor) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "booking" WHERE "id" = ${bookingId} FOR UPDATE`;
    const inv = await computeInvoice(tx, bookingId);
    if (inv.status !== "IN_USE" && inv.status !== "COMPLETED") {
      throw ApiError.conflict("INVALID_TRANSITION", "Chỉ tạo điều chỉnh cho booking đang sử dụng hoặc đã hoàn thành");
    }
    if (inv.paymentStatus !== "UNPAID") throw ApiError.conflict("ALREADY_SETTLED", "Không tạo điều chỉnh sau khi đã thanh toán/miễn");
    const amount = kind === "WAIVE" ? inv.originalTotalVnd : (amountVnd ?? 0);
    if (amount <= 0 || amount > inv.originalTotalVnd) throw ApiError.unprocessable("INVALID_ADJUSTMENT", "Số tiền điều chỉnh phải > 0 và không vượt Tổng gốc");
    // Thay đổi trước khi duyệt: vô hiệu bản cũ, giữ lịch sử (trang 8)
    await tx.adjustment.updateMany({ where: { bookingId, isCurrent: true }, data: { isCurrent: false } });
    return tx.adjustment.create({ data: { bookingId, kind, amountVnd: amount, reason, createdById: staff.id } });
  });
}

/** Quản lý duyệt/từ chối. WAIVE được duyệt => payment_status = WAIVED, không tạo Payment (EX04). */
export async function decideAdjustment(adjustmentId: number, approve: boolean, manager: Actor, note?: string) {
  return prisma.$transaction(async (tx) => {
    const reference = await tx.adjustment.findUnique({ where: { id: adjustmentId }, select: { bookingId: true } });
    if (!reference) throw ApiError.notFound("ADJUSTMENT_NOT_FOUND", "Không tìm thấy điều chỉnh");

    // Giữ cùng thứ tự khóa với tạo đề nghị/checkout: booking trước, adjustment sau.
    // Đọc lại sau khi khóa để hai quản lý không thể cùng quyết định từ dữ liệu cũ.
    await tx.$queryRaw`SELECT "id" FROM "booking" WHERE "id" = ${reference.bookingId} FOR UPDATE`;
    await tx.$queryRaw`SELECT "id" FROM "adjustment" WHERE "id" = ${adjustmentId} FOR UPDATE`;
    const adj = await tx.adjustment.findUnique({ where: { id: adjustmentId } });
    if (!adj || !adj.isCurrent) throw ApiError.notFound("ADJUSTMENT_NOT_FOUND", "Không tìm thấy điều chỉnh");
    if (adj.status !== "PENDING_APPROVAL") throw ApiError.conflict("ALREADY_DECIDED", "Điều chỉnh đã được xử lý");
    const b = await tx.booking.findUnique({ where: { id: adj.bookingId }, select: { status: true, paymentStatus: true } });
    if (b?.status !== "IN_USE" && b?.status !== "COMPLETED") {
      throw ApiError.conflict("INVALID_TRANSITION", "Không điều chỉnh booking đã hủy hoặc không đến");
    }
    if (b.paymentStatus !== "UNPAID") throw ApiError.conflict("ALREADY_SETTLED", "Booking đã thanh toán/miễn");

    const updated = await tx.adjustment.update({
      where: { id: adjustmentId },
      data: { status: approve ? "APPROVED" : "REJECTED", approvedById: manager.id, decidedAt: new Date(), ...(note ? { reason: `${adj.reason} | QL: ${note}` } : {}) },
    });
    if (approve && adj.kind === "WAIVE") {
      await tx.booking.update({ where: { id: adj.bookingId }, data: { paymentStatus: "WAIVED" } });
      await tx.bookingStatusHistory.create({ data: { bookingId: adj.bookingId, field: "payment_status", oldValue: "UNPAID", newValue: "WAIVED", actorId: manager.id, reason: adj.reason } });
    }
    return updated;
  });
}

export function listPendingAdjustments() {
  return prisma.adjustment.findMany({
    where: { status: "PENDING_APPROVAL", isCurrent: true },
    include: { booking: { select: { id: true, code: true, roomTotal: true, status: true, room: { select: { name: true } } } }, createdBy: { select: { name: true } } },
    orderBy: { createdAt: "asc" },
  });
}
