/**
 * Module 5 – Menu và đơn món (Sơn). Đặc tả trang 7 (đặt món, PENDING→PREPARING→SERVED), EX02; kiểm thử T11.
 *
 * HÀM RANH GIỚI cho module 6 (trang 16): computeItemsForBilling(tx, bookingId)
 *   -> tiền món (chỉ dòng không bị hủy) và trạng thái món có "sạch" để thanh toán hay chưa.
 */
import { prisma, type Tx } from "../../core/prisma.js";
import { ApiError } from "../../core/http.js";
import type { FoodOrderStatus } from "../../generated/prisma/enums.js";

const itemSelect = { id: true, name: true, category: true, imageUrl: true, priceVnd: true, isActive: true } as const;

export function listMenu(includeInactive = false) {
  return prisma.menuItem.findMany({
    where: includeInactive ? {} : { isActive: true },
    select: itemSelect,
    orderBy: [{ category: "asc" }, { name: "asc" }],
  });
}

export type PreorderLine = { menuItemId: number; itemNameSnapshot: string; unitPriceVnd: number; quantity: number };

/**
 * HÀM DÙNG CHUNG với module 3: chốt tên/giá món từ DB, kiểm tra còn bán và số lượng 1–20.
 * Trả về các dòng để chèn vào food_order_item cùng tổng tiền.
 */
export async function buildPreorder(
  tx: Tx,
  items: { menuItemId: number; quantity: number }[],
): Promise<{ lines: PreorderLine[]; totalVnd: number }> {
  if (items.length === 0) return { lines: [], totalVnd: 0 };
  const ids = [...new Set(items.map((i) => i.menuItemId))];
  const menu = await tx.menuItem.findMany({ where: { id: { in: ids } }, select: itemSelect });
  const byId = new Map(menu.map((m) => [m.id, m]));
  const lines: PreorderLine[] = [];
  for (const it of items) {
    const m = byId.get(it.menuItemId);
    if (!m || !m.isActive) throw ApiError.unprocessable("MENU_ITEM_UNAVAILABLE", `Món #${it.menuItemId} không còn bán`);
    if (!Number.isInteger(it.quantity) || it.quantity < 1 || it.quantity > 20)
      throw ApiError.unprocessable("INVALID_QUANTITY", "Số lượng mỗi dòng từ 1 đến 20");
    lines.push({ menuItemId: m.id, itemNameSnapshot: m.name, unitPriceVnd: m.priceVnd, quantity: it.quantity });
  }
  const totalVnd = lines.reduce((s, l) => s + l.unitPriceVnd * l.quantity, 0);
  return { lines, totalVnd };
}

/** Nhân viên thêm món cho booking IN_USE (trang 7) */
export async function addOrder(bookingId: number, items: { menuItemId: number; quantity: number }[], staffId: number) {
  return prisma.$transaction(async (tx) => {
    const b = await tx.booking.findUnique({ where: { id: bookingId }, select: { status: true, paymentStatus: true } });
    if (!b) throw ApiError.notFound("BOOKING_NOT_FOUND", "Không tìm thấy booking");
    if (b.status !== "IN_USE") throw ApiError.conflict("NOT_IN_USE", "Chỉ thêm món khi khách đang sử dụng phòng");
    if (b.paymentStatus !== "UNPAID") throw ApiError.conflict("ALREADY_PAID", "Không thêm món sau khi đã thanh toán");
    const { lines } = await buildPreorder(tx, items);
    if (lines.length === 0) throw ApiError.unprocessable("EMPTY_ORDER", "Đơn món trống");
    return tx.foodOrder.create({ data: { bookingId, createdById: staffId, items: { create: lines } }, include: { items: true } });
  });
}

const ORDER_FLOW: Record<FoodOrderStatus, FoodOrderStatus[]> = {
  PENDING: ["PREPARING", "CANCELLED"],
  PREPARING: ["SERVED"],
  SERVED: [],
  CANCELLED: [],
};

/** Chuyển trạng thái đơn món. Chỉ bắt đầu chuẩn bị sau check-in (trang 7). */
export async function setOrderStatus(orderId: number, to: FoodOrderStatus) {
  return prisma.$transaction(async (tx) => {
    const o = await tx.foodOrder.findUnique({ where: { id: orderId }, select: { status: true, booking: { select: { status: true } } } });
    if (!o) throw ApiError.notFound("ORDER_NOT_FOUND", "Không tìm thấy đơn món");
    if (!ORDER_FLOW[o.status].includes(to))
      throw ApiError.conflict("INVALID_ORDER_TRANSITION", `Không thể chuyển đơn từ ${o.status} sang ${to}`);
    if (to !== "CANCELLED" && o.booking.status !== "IN_USE") {
      throw ApiError.conflict("NOT_IN_USE", "Food orders can only be processed while the booking is in use");
    }
    return tx.foodOrder.update({ where: { id: orderId }, data: { status: to }, include: { items: true } });
  });
}

export function listOrders(status?: FoodOrderStatus) {
  return prisma.foodOrder.findMany({
    where: status ? { status } : { status: { in: ["PENDING", "PREPARING"] } },
    include: { items: true, booking: { select: { id: true, code: true, room: { select: { name: true } }, status: true } } },
    orderBy: { createdAt: "asc" },
  });
}

export type BillingItems = {
  /** Tiền món = tổng (giá đã chốt × số lượng) của dòng thuộc đơn không bị hủy */
  itemsTotalVnd: number;
  /** Đơn còn PENDING/PREPARING – chưa được thanh toán bình thường (T11) */
  unresolvedOrderIds: number[];
  orders: { id: number; status: FoodOrderStatus; totalVnd: number }[];
};

/** HÀM RANH GIỚI cho module 6: tiền món và trạng thái hợp lệ để thanh toán. */
export async function computeItemsForBilling(tx: Tx, bookingId: number): Promise<BillingItems> {
  const orders = await tx.foodOrder.findMany({ where: { bookingId }, include: { items: true } });
  const mapped = orders.map((o) => ({
    id: o.id,
    status: o.status,
    totalVnd: o.items.reduce((s, i) => s + i.unitPriceVnd * i.quantity, 0),
  }));
  return {
    itemsTotalVnd: mapped.filter((o) => o.status !== "CANCELLED").reduce((s, o) => s + o.totalVnd, 0),
    unresolvedOrderIds: mapped.filter((o) => o.status === "PENDING" || o.status === "PREPARING").map((o) => o.id),
    orders: mapped,
  };
}

/**
 * EX02 – món dở khi kết thúc sớm: PENDING -> CANCELLED (không tính tiền).
 * PREPARING và SERVED GIỮ NGUYÊN trạng thái và vẫn tính tiền; KHÔNG đánh dấu "đã phục vụ" chỉ để
 * vượt điều kiện thanh toán. Muốn không thu phần PREPARING thì tạo Điều chỉnh chờ quản lý duyệt.
 * Với booking đã kết thúc sớm, module 6 cho phép thu tiền dù còn đơn PREPARING.
 */
export async function resolveOrdersOnEarlyEnd(tx: Tx, bookingId: number) {
  await tx.foodOrder.updateMany({ where: { bookingId, status: "PENDING" }, data: { status: "CANCELLED" } });
}

// ---- Quản trị menu ----
export type MenuInput = {
  name: string;
  category: "DRINK" | "SNACK" | "FOOD";
  imageUrl?: string | null;
  priceVnd: number;
  isActive?: boolean;
};
export function createMenuItem(input: MenuInput) {
  return prisma.menuItem.create({ data: input, select: itemSelect });
}
export function updateMenuItem(id: number, input: Partial<MenuInput>) {
  return prisma.menuItem.update({ where: { id }, data: input, select: itemSelect });
}
