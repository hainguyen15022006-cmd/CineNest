import { describe, it, expect, afterAll } from "vitest";
import { createApp } from "../src/app.js";
import { closeDb, prisma } from "../src/core/prisma.js";
import { loginAs, createTestRoom, key, uid } from "./helpers.js";
import { computeWindow, addMinutes } from "../src/core/time.js";
import { getReports } from "../src/modules/payments/reports.service.js";

const app = createApp();

/** Create an IN_USE booking directly to test service workflows */
async function inUseBooking(roomId: number, price = 100_000) {
  const startAt = addMinutes(new Date(), -30);
  const win = computeWindow(startAt, 120);
  return prisma.booking.create({
    data: {
      code: `T-${uid()}`, roomId, contactName: "Khách", contactPhone: "0900000000", guestCount: 2,
      startAt: win.startAt, endAt: win.endAt, occupiedUntil: win.occupiedUntil,
      status: "IN_USE", checkedInAt: startAt, roomRateSnapshot: price, roomTotal: 200_000,
    },
  });
}

describe("Module 5 + 6 – món, hóa đơn, thu tiền, ngoại lệ (T11, T12, T15, T16)", () => {
  afterAll(closeDb);

  it("T11: còn món PENDING/PREPARING -> chặn thu; sau khi phục vụ -> thu được, booking COMPLETED + PAID", async () => {
    const room = await createTestRoom();
    const staff = await loginAs(app, "STAFF");
    const b = await inUseBooking(room.id);
    const item = await prisma.menuItem.findFirst({ where: { isActive: true } });

    const order = await staff.agent.post(`/api/staff/bookings/${b.id}/orders`).send({ items: [{ menuItemId: item!.id, quantity: 2 }] });
    expect(order.status).toBe(201);

    const blocked = await staff.agent.post(`/api/staff/bookings/${b.id}/checkout`).set("Idempotency-Key", key()).send({ method: "CASH" });
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.details.blockers).toContain("ORDERS_UNRESOLVED");

    expect((await staff.agent.patch(`/api/staff/orders/${order.body.data.id}/status`).send({ status: "PREPARING" })).status).toBe(200);
    expect((await staff.agent.patch(`/api/staff/orders/${order.body.data.id}/status`).send({ status: "SERVED" })).status).toBe(200);

    const inv = await staff.agent.get(`/api/staff/bookings/${b.id}/invoice`);
    expect(inv.body.data.amountDueVnd).toBe(200_000 + item!.priceVnd * 2);
    expect(inv.body.data.canCollect).toBe(true);

    const k = key();
    const paid = await staff.agent.post(`/api/staff/bookings/${b.id}/checkout`).set("Idempotency-Key", k).send({ method: "CASH" });
    expect(paid.status).toBe(201);
    expect(paid.body.data.payment.amountVnd).toBe(200_000 + item!.priceVnd * 2);

    // T10: thu tiền lặp cùng khóa -> kết quả cũ; khóa khác -> 409 vì đã PAID
    const again = await staff.agent.post(`/api/staff/bookings/${b.id}/checkout`).set("Idempotency-Key", k).send({ method: "CASH" });
    expect(again.status).toBe(201);
    expect(again.headers["idempotent-replayed"]).toBe("true");
    const other = await staff.agent.post(`/api/staff/bookings/${b.id}/checkout`).set("Idempotency-Key", key()).send({ method: "CASH" });
    expect(other.status).toBe(409);

    const after = await prisma.booking.findUnique({ where: { id: b.id } });
    expect(after?.status).toBe("COMPLETED");
    expect(after?.paymentStatus).toBe("PAID");
    expect(await prisma.payment.count({ where: { bookingId: b.id } })).toBe(1);
  });

  it("T15: kết thúc sớm với món PENDING/PREPARING/SERVED; đề nghị giảm; chặn thu khi chưa duyệt; duyệt rồi thu số sau giảm", async () => {
    const room = await createTestRoom();
    const staff = await loginAs(app, "STAFF");
    const manager = await loginAs(app, "MANAGER");
    const b = await inUseBooking(room.id);
    const items = await prisma.menuItem.findMany({ where: { isActive: true }, take: 3 });
    const mk = async (status: "PENDING" | "PREPARING" | "SERVED", it: { id: number; name: string; priceVnd: number }) =>
      prisma.foodOrder.create({ data: { bookingId: b.id, status, items: { create: { menuItemId: it.id, itemNameSnapshot: it.name, unitPriceVnd: it.priceVnd, quantity: 1 } } } });
    const pending = await mk("PENDING", items[0]!);
    await mk("PREPARING", items[1]!);
    await mk("SERVED", items[2]!);

    const ended = await staff.agent.post(`/api/staff/bookings/${b.id}/end-early`).send({ reason: "Máy chiếu hỏng" });
    expect(ended.status).toBe(200);
    expect(ended.body.data.booking.status).toBe("COMPLETED");
    expect((await prisma.foodOrder.findUnique({ where: { id: pending.id } }))?.status).toBe("CANCELLED");
    expect(ended.body.data.invoice.itemsTotalVnd).toBe(items[1]!.priceVnd + items[2]!.priceVnd);
    const original = 200_000 + items[1]!.priceVnd + items[2]!.priceVnd;

    const proposal = await staff.agent.post(`/api/staff/bookings/${b.id}/adjustments`).send({ kind: "REDUCE", amountVnd: 50_000, reason: "Máy chiếu lỗi 20 phút" });
    expect(proposal.status).toBe(201);

    const blocked = await staff.agent.post(`/api/staff/bookings/${b.id}/checkout`).set("Idempotency-Key", key()).send({ method: "CASH" });
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.details.blockers).toContain("ADJUSTMENT_PENDING");

    expect((await manager.agent.post(`/api/admin/adjustments/${proposal.body.data.id}/approve`).send({})).status).toBe(200);

    const paid = await staff.agent.post(`/api/staff/bookings/${b.id}/checkout`).set("Idempotency-Key", key()).send({ method: "TRANSFER" });
    expect(paid.status).toBe(201);
    expect(paid.body.data.payment.originalTotalVnd).toBe(original);
    expect(paid.body.data.payment.adjustmentVnd).toBe(50_000);
    expect(paid.body.data.payment.amountVnd).toBe(original - 50_000);
  });

  it("T16 + T12: khách bỏ về -> COMPLETED + UNPAID; miễn toàn bộ -> WAIVED; cả hai không vào doanh thu, có trong 'chưa thu và miễn'", async () => {
    const staff = await loginAs(app, "STAFF");
    const manager = await loginAs(app, "MANAGER");
    const b1 = await inUseBooking((await createTestRoom()).id);
    const b2 = await inUseBooking((await createTestRoom()).id);

    expect((await staff.agent.post(`/api/staff/bookings/${b1.id}/end-early`).send({ reason: "Khách rời đi chưa thanh toán" })).status).toBe(200);
    const waive = await staff.agent.post(`/api/staff/bookings/${b2.id}/adjustments`).send({ kind: "WAIVE", reason: "Mất điện" });
    expect((await manager.agent.post(`/api/admin/adjustments/${waive.body.data.id}/approve`).send({})).status).toBe(200);

    const r1 = await prisma.booking.findUnique({ where: { id: b1.id } });
    const r2 = await prisma.booking.findUnique({ where: { id: b2.id } });
    expect([r1?.status, r1?.paymentStatus]).toEqual(["COMPLETED", "UNPAID"]);
    expect(r2?.paymentStatus).toBe("WAIVED");
    expect(await prisma.payment.count({ where: { bookingId: { in: [b1.id, b2.id] } } })).toBe(0);

    const rep = await manager.agent.get("/api/admin/reports/unpaid-waived");
    const ids = rep.body.data.map((r: { id: number }) => r.id);
    expect(ids).toContain(b1.id);
    expect(ids).toContain(b2.id);
    const rev = await manager.agent.get("/api/admin/reports/revenue");
    expect(rev.body.data.details.map((d: { code: string }) => d.code)).not.toContain(b1.code);

    // Call getReports directly to print raw JSON report output to Terminal
    const reportData = await getReports();
    console.error("\n== DB RECONCILED REPORT DATA ==");
    console.error(JSON.stringify(reportData, null, 2));
    console.error("====\n");
  });
});