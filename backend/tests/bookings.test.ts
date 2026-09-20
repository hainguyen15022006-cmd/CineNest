import { describe, it, expect, afterAll, vi } from "vitest";
import { createApp } from "../src/app.js";
import { closeDb, prisma, pool } from "../src/core/prisma.js";
import { registerAndLogin, loginAs, createTestRoom, bookingPayload, key, futureDate } from "./helpers.js";
import { addMinutes, dateToVn } from "../src/core/time.js";

const app = createApp();

describe("Module 3 – booking: quy tắc, chống trùng hai lớp, chống gửi lặp", () => {
  afterAll(closeDb);

  it("T01: đặt hợp lệ có phim và món -> 201, đúng giá chốt từ DB", async () => {
    const room = await createTestRoom(4, 100_000);
    const movie = await prisma.movie.findFirst({ where: { isActive: true, durationMinutes: { lte: 110 } } });
    const item = await prisma.menuItem.findFirst({ where: { isActive: true } });
    const { agent } = await registerAndLogin(app);
    const payload = bookingPayload(room.id, { movieId: movie!.id, items: [{ menuItemId: item!.id, quantity: 2 }] });
    const res = await agent
      .post("/api/bookings")
      .set("Idempotency-Key", key())
      .send(payload);
    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe("CONFIRMED");
    expect(res.body.data.roomTotal).toBe(200_000);
    expect(res.body.data.itemsTotalVnd).toBe(item!.priceVnd * 2);
    expect(res.body.data.preparationStatus).toBe("PENDING");
    const saved = await prisma.booking.findUniqueOrThrow({ where: { id: res.body.data.id } });
    expect(dateToVn(saved.startAt)).toEqual({ date: payload.date, time: payload.startTime });
  });

  it("T04: quá sức chứa, quá khứ, quá 23:00 -> 422 với mã rõ ràng", async () => {
    const room = await createTestRoom(2);
    const { agent } = await registerAndLogin(app);
    const send = (p: object) => agent.post("/api/bookings").set("Idempotency-Key", key()).send(p);
    expect((await send(bookingPayload(room.id, { guests: 3 }))).body.error.code).toBe("OVER_CAPACITY");
    expect((await send(bookingPayload(room.id, { date: "2020-01-01" }))).body.error.code).toBe("TOO_SOON");
    expect((await send(bookingPayload(room.id, { startTime: "21:00" }))).body.error.code).toBe("OUTSIDE_HOURS");
    expect((await send(bookingPayload(room.id, { startTime: "19:15" }))).body.error.code).toBe("INVALID_START_MINUTE");
    expect((await send(bookingPayload(room.id, { duration: 90 }))).body.error.code).toBe("INVALID_PACKAGE");
  });

  it("T03: giao thời gian dọn bị chặn (409); chạm biên occupied_until được phép", async () => {
    const room = await createTestRoom();
    const a = await registerAndLogin(app);
    const b = await registerAndLogin(app);
    expect((await a.agent.post("/api/bookings").set("Idempotency-Key", key()).send(bookingPayload(room.id, { startTime: "14:00" }))).status).toBe(201);
    // 16:00 nằm trong 30 phút dọn của 14:00–16:00 -> 409
    const clash = await b.agent.post("/api/bookings").set("Idempotency-Key", key()).send(bookingPayload(room.id, { startTime: "16:00" }));
    expect(clash.status).toBe(409);
    expect(clash.body.error.code).toBe("ROOM_TAKEN");
    expect(clash.body.error.details.suggest).toBeTruthy();
    // 16:30 đúng biên -> 201
    expect((await b.agent.post("/api/bookings").set("Idempotency-Key", key()).send(bookingPayload(room.id, { startTime: "16:30" }))).status).toBe(201);
  });

  it("Lớp 2: EXCLUDE trong PostgreSQL tự chặn hai dòng giao nhau dù không qua ứng dụng", async () => {
    const room = await createTestRoom();
    const d = futureDate(6);
    const ins = (start: string, end: string, occ: string) =>
      pool.query(
        `INSERT INTO "booking" ("code","room_id","contact_name","contact_phone","guest_count","start_at","end_at","occupied_until","room_rate_snapshot","room_total","updated_at")
         VALUES ($1,$2,'x','0900000000',1,$3,$4,$5,0,0,now())`,
        [`T-${Math.random().toString(36).slice(2, 8)}`, room.id, `${d}T${start}:00+07:00`, `${d}T${end}:00+07:00`, `${d}T${occ}:00+07:00`],
      );
    await ins("10:00", "12:00", "12:30");
    await expect(ins("12:00", "14:00", "14:30")).rejects.toMatchObject({ code: "23P01" });
    await expect(ins("12:30", "14:30", "15:00")).resolves.toBeTruthy();
  });

  it("T10: gửi lặp với cùng Idempotency-Key -> trả kết quả cũ, không sinh booking mới", async () => {
    const room = await createTestRoom();
    const { agent } = await registerAndLogin(app);
    const k = key();
    const first = await agent.post("/api/bookings").set("Idempotency-Key", k).send(bookingPayload(room.id));
    const second = await agent.post("/api/bookings").set("Idempotency-Key", k).send(bookingPayload(room.id));
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.headers["idempotent-replayed"]).toBe("true");
    expect(second.body.data.id).toBe(first.body.data.id);
    expect(await prisma.booking.count({ where: { roomId: room.id } })).toBe(1);
    // Cùng khóa nhưng khác nội dung -> 422
    const reused = await agent.post("/api/bookings").set("Idempotency-Key", k).send(bookingPayload(room.id, { guests: 3 }));
    expect(reused.status).toBe(422);
    expect(reused.body.error.code).toBe("IDEMPOTENCY_KEY_REUSED");
  });

  it("T02: N khách khác nhau cùng đặt một phòng/giờ đồng thời -> đúng 1×201, còn lại 409, DB đếm = 1", async () => {
    const N = 40; // Locust PF02 chạy 200; ở đây 40 để test nhanh – cơ chế là như nhau
    const room = await createTestRoom();
    const users = await Promise.all(Array.from({ length: N }, () => registerAndLogin(app)));
    const results = await Promise.all(
      users.map((u) => u.agent.post("/api/bookings").set("Idempotency-Key", key()).send(bookingPayload(room.id))),
    );
    const codes = results.map((r) => r.status);
    expect(codes.filter((c) => c === 201)).toHaveLength(1);
    expect(codes.filter((c) => c === 409)).toHaveLength(N - 1);
    expect(codes.filter((c) => c >= 500)).toHaveLength(0);
    expect(await prisma.booking.count({ where: { roomId: room.id, status: "CONFIRMED" } })).toBe(1);
  });

  it("Giới hạn 3 booking tương lai mỗi tài khoản -> 422 BOOKING_LIMIT", async () => {
    const { agent } = await registerAndLogin(app);
    for (let i = 0; i < 3; i++) {
      const room = await createTestRoom();
      expect((await agent.post("/api/bookings").set("Idempotency-Key", key()).send(bookingPayload(room.id))).status).toBe(201);
    }
    const room = await createTestRoom();
    const r = await agent.post("/api/bookings").set("Idempotency-Key", key()).send(bookingPayload(room.id));
    expect(r.status).toBe(422);
    expect(r.body.error.code).toBe("BOOKING_LIMIT");
  });

  it("T09: tổng gửi lên không khớp -> 409 PRICE_CHANGED; T06: hủy đúng chính sách", async () => {
    const room = await createTestRoom(4, 100_000);
    const { agent } = await registerAndLogin(app);
    const wrong = await agent.post("/api/bookings").set("Idempotency-Key", key()).send(bookingPayload(room.id, { expectedTotalVnd: 1 }));
    expect(wrong.status).toBe(409);
    expect(wrong.body.error.code).toBe("PRICE_CHANGED");
    const okRes = await agent.post("/api/bookings").set("Idempotency-Key", key()).send(bookingPayload(room.id, { expectedTotalVnd: 200_000 }));
    expect(okRes.status).toBe(201);
    const cancel = await agent.post(`/api/bookings/${okRes.body.data.id}/cancel`).send({});
    expect(cancel.status).toBe(200);
    expect(cancel.body.data.status).toBe("CANCELLED");
  });

  it("Counter route rejects an already-booked online slot (sequential regression)", async () => {
    const room = await createTestRoom();
    const customer = await registerAndLogin(app);
    const staff = await loginAs(app, "STAFF");
    expect((await customer.agent.post("/api/bookings").set("Idempotency-Key", key()).send(bookingPayload(room.id))).status).toBe(201);
    const counter = await staff.agent.post("/api/staff/bookings").set("Idempotency-Key", key()).send(bookingPayload(room.id));
    expect(counter.status).toBe(409);
  });

  it("T05: khách không xem được booking của người khác", async () => {
    const room = await createTestRoom();
    const a = await registerAndLogin(app);
    const b = await registerAndLogin(app);
    const created = await a.agent.post("/api/bookings").set("Idempotency-Key", key()).send(bookingPayload(room.id));
    expect((await b.agent.get(`/api/bookings/${created.body.data.id}`)).status).toBe(404);
    expect((await a.agent.get(`/api/bookings/${created.body.data.code}`)).status).toBe(200);
  });

  it("Day 2: create -> upcoming -> detail -> cancel -> past", async () => {
    const room = await createTestRoom();
    const { agent } = await registerAndLogin(app);
    const created = await agent
      .post("/api/bookings")
      .set("Idempotency-Key", key())
      .send(bookingPayload(room.id));

    expect(created.status).toBe(201);
    const bookingId = created.body.data.id as number;
    const bookingCode = created.body.data.code as string;

    const upcomingBeforeCancel = await agent.get("/api/me/bookings?scope=upcoming");
    expect(upcomingBeforeCancel.status).toBe(200);
    expect(upcomingBeforeCancel.body.data.some((booking: { id: number }) => booking.id === bookingId)).toBe(true);

    const detail = await agent.get(`/api/bookings/${bookingCode}`);
    expect(detail.status).toBe(200);
    expect(detail.body.data.id).toBe(bookingId);
    expect(detail.body.data.code).toBe(bookingCode);

    const cancelled = await agent.post(`/api/bookings/${bookingId}/cancel`).send({});
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.data.status).toBe("CANCELLED");

    const upcomingAfterCancel = await agent.get("/api/me/bookings?scope=upcoming");
    expect(upcomingAfterCancel.body.data.some((booking: { id: number }) => booking.id === bookingId)).toBe(false);

    const past = await agent.get("/api/me/bookings?scope=past");
    expect(past.status).toBe(200);
    expect(past.body.data.some((booking: { id: number }) => booking.id === bookingId)).toBe(true);
  });

  it("T06: customer cannot cancel less than two hours before the start time", async () => {
    const room = await createTestRoom();
    const { agent } = await registerAndLogin(app);
    const created = await agent
      .post("/api/bookings")
      .set("Idempotency-Key", key())
      .send(bookingPayload(room.id));
    expect(created.status).toBe(201);

    const startAt = addMinutes(new Date(), 90);
    await prisma.booking.update({
      where: { id: created.body.data.id },
      data: {
        startAt,
        endAt: addMinutes(startAt, 120),
        occupiedUntil: addMinutes(startAt, 150),
      },
    });

    const cancelled = await agent.post(`/api/bookings/${created.body.data.id}/cancel`).send({});
    expect(cancelled.status).toBe(422);
    expect(cancelled.body.error.code).toBe("CANCEL_TOO_LATE");
    expect((await prisma.booking.findUniqueOrThrow({ where: { id: created.body.data.id } })).status).toBe("CONFIRMED");
  });

  it("Day 3: nearest suggestion never goes beyond closing time", async () => {
    const room = await createTestRoom();
    const firstUser = await registerAndLogin(app);
    const secondUser = await registerAndLogin(app);
    const payload = bookingPayload(room.id, { startTime: "19:30", duration: 180 });

    const first = await firstUser.agent.post("/api/bookings").set("Idempotency-Key", key()).send(payload);
    expect(first.status).toBe(201);

    const conflict = await secondUser.agent.post("/api/bookings").set("Idempotency-Key", key()).send(payload);
    expect(conflict.status).toBe(409);
    expect(conflict.body.error.code).toBe("ROOM_TAKEN");
    expect(conflict.body.error.details.suggest).toBeNull();
  });

  it("Day 3: creating a booking requires an Idempotency-Key", async () => {
    const room = await createTestRoom();
    const { agent } = await registerAndLogin(app);
    const response = await agent.post("/api/bookings").send(bookingPayload(room.id));

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("IDEMPOTENCY_KEY_REQUIRED");
    expect(await prisma.booking.count({ where: { roomId: room.id } })).toBe(0);
  });

  it("Day 3: a failed idempotent request can be retried", async () => {
    const room = await createTestRoom();
    const firstUser = await registerAndLogin(app);
    const secondUser = await registerAndLogin(app);
    const payload = bookingPayload(room.id);

    const existing = await firstUser.agent.post("/api/bookings").set("Idempotency-Key", key()).send(payload);
    expect(existing.status).toBe(201);

    const retryKey = key();
    const blocked = await secondUser.agent.post("/api/bookings").set("Idempotency-Key", retryKey).send(payload);
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.code).toBe("ROOM_TAKEN");

    const cancelled = await firstUser.agent.post(`/api/bookings/${existing.body.data.id}/cancel`).send({});
    expect(cancelled.status).toBe(200);

    const retried = await secondUser.agent.post("/api/bookings").set("Idempotency-Key", retryKey).send(payload);
    expect(retried.status).toBe(201);
    expect(retried.headers["idempotent-replayed"]).toBe("false");
  });

  it("Day 3: concurrent requests cannot exceed three upcoming bookings", async () => {
    const rooms = await Promise.all(Array.from({ length: 4 }, () => createTestRoom()));
    const { agent, id: customerId } = await registerAndLogin(app);
    const responses = await Promise.all(
      rooms.map((room) => agent.post("/api/bookings").set("Idempotency-Key", key()).send(bookingPayload(room.id))),
    );
    const statuses = responses.map((response) => response.status);

    expect(statuses.filter((status) => status === 201)).toHaveLength(3);
    expect(
      responses.filter((response) => response.status === 422 && response.body.error.code === "BOOKING_LIMIT"),
    ).toHaveLength(1);
    expect(
      await prisma.booking.count({
        where: { customerId, status: "CONFIRMED", startAt: { gt: new Date() } },
      }),
    ).toBe(3);
  });

  it("Day 4: staff schedule uses the requested Vietnam date and search finds code or phone", async () => {
    const room = await createTestRoom();
    const customer = await registerAndLogin(app);
    const staff = await loginAs(app, "STAFF");
    const date = futureDate(4);
    const created = await customer.agent
      .post("/api/bookings")
      .set("Idempotency-Key", key())
      .send(bookingPayload(room.id, { date, contactPhone: "0987654321" }));
    expect(created.status).toBe(201);

    const schedule = await staff.agent.get(`/api/staff/bookings?date=${date}`);
    expect(schedule.status).toBe(200);
    expect(
      schedule.body.data.some(
        (booking: { id: number }) => booking.id === created.body.data.id,
      ),
    ).toBe(true);

    const byCode = await staff.agent.get(
      `/api/staff/bookings/search?q=${created.body.data.code.slice(-4).toLowerCase()}`,
    );
    expect(byCode.status).toBe(200);
    expect(
      byCode.body.data.some(
        (booking: { id: number }) => booking.id === created.body.data.id,
      ),
    ).toBe(true);

    const byPhone = await staff.agent.get(
      "/api/staff/bookings/search?q=87654321",
    );
    expect(byPhone.status).toBe(200);
    expect(
      byPhone.body.data.some(
        (booking: { id: number }) => booking.id === created.body.data.id,
      ),
    ).toBe(true);
  });

  it("Day 4: a counter booking supports six guests, food and staff ownership", async () => {
    const room = await createTestRoom(6, 120_000);
    const staff = await loginAs(app, "STAFF");
    const item = await prisma.menuItem.findFirstOrThrow({
      where: { isActive: true },
    });
    const payload = bookingPayload(room.id, {
      date: futureDate(3),
      guests: 6,
      items: [{ menuItemId: item.id, quantity: 2 }],
      expectedTotalVnd: 240_000 + item.priceVnd * 2,
    });
    const created = await staff.agent
      .post("/api/staff/bookings")
      .set("Idempotency-Key", key())
      .send(payload);

    expect(created.status).toBe(201);
    expect(created.body.data.source).toBe("COUNTER");
    expect(created.body.data.customerId).toBeNull();
    expect(created.body.data.createdById).toBe(staff.id);
    expect(created.body.data.foodOrders[0].items[0].quantity).toBe(2);

    const anotherRoom = await createTestRoom(6);
    const overCapacity = await staff.agent
      .post("/api/staff/bookings")
      .set("Idempotency-Key", key())
      .send(bookingPayload(anotherRoom.id, { date: futureDate(3), guests: 7 }));
    expect(overCapacity.status).toBe(422);
    expect(overCapacity.body.error.code).toBe("OVER_CAPACITY");
  });

  it("BR06: closing a room and creating a booking cannot both succeed concurrently", async () => {
    const room = await createTestRoom(6);
    const customer = await registerAndLogin(app);
    const manager = await loginAs(app, "MANAGER");

    const [created, closed] = await Promise.all([
      customer.agent.post("/api/bookings").set("Idempotency-Key", key()).send(bookingPayload(room.id, { guests: 6 })),
      manager.agent.patch(`/api/admin/rooms/${room.id}`).send({ isActive: false }),
    ]);

    expect(
      (created.status === 201 && closed.status === 422)
      || (created.status === 422 && closed.status === 200),
    ).toBe(true);
    const saved = await prisma.booking.count({ where: { roomId: room.id, status: "CONFIRMED" } });
    const currentRoom = await prisma.room.findUniqueOrThrow({ where: { id: room.id } });
    expect(saved === 1 && currentRoom.isActive).toBe(created.status === 201);
  });

  it("Day 4: a booking-code collision retries the transaction with a new code", async () => {
    const firstRoom = await createTestRoom();
    const secondRoom = await createTestRoom();
    const customer = await registerAndLogin(app);
    const first = await customer.agent
      .post("/api/bookings")
      .set("Idempotency-Key", key())
      .send(bookingPayload(firstRoom.id));
    expect(first.status).toBe(201);

    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const firstCode = first.body.data.code as string;
    const firstSuffix = firstCode.slice(-4);
    const prefix = firstCode.slice(0, -4);
    const existingCodes = new Set((await prisma.booking.findMany({ select: { code: true } })).map(({ code }) => code));
    // Previous runs may already occupy the first few forced suffixes. Find a free code
    // across the real alphabet instead of requiring a database reset after five runs.
    let alternateSuffix: string | undefined;
    for (let n = 0; n < alphabet.length ** 4; n++) {
      const suffix = [3, 2, 1, 0].map((power) => alphabet[Math.floor(n / alphabet.length ** power) % alphabet.length]).join("");
      if (!existingCodes.has(prefix + suffix)) { alternateSuffix = suffix; break; }
    }
    expect(alternateSuffix).toBeTruthy();
    const randomValues = [...firstSuffix, ...alternateSuffix!].map((character) => (alphabet.indexOf(character) + 0.25) / alphabet.length);
    const random = vi.spyOn(Math, "random").mockImplementation(() => randomValues.shift() ?? 0);

    try {
      const second = await customer.agent
        .post("/api/bookings")
        .set("Idempotency-Key", key())
        .send(bookingPayload(secondRoom.id));
      expect(second.status).toBe(201);
      expect(second.body.data.code).toBe(prefix + alternateSuffix);
      expect(second.body.data.code).not.toBe(firstCode);
    } finally {
      random.mockRestore();
    }
  });

  it("Day 4: check-in waits for the start time and records history", async () => {
    const room = await createTestRoom();
    const customer = await registerAndLogin(app);
    const staff = await loginAs(app, "STAFF");
    const created = await customer.agent
      .post("/api/bookings")
      .set("Idempotency-Key", key())
      .send(bookingPayload(room.id));
    expect(created.status).toBe(201);

    const early = await staff.agent
      .post(`/api/staff/bookings/${created.body.data.id}/check-in`)
      .send({});
    expect(early.status).toBe(409);
    expect(early.body.error.code).toBe("TOO_EARLY_FOR_CHECK_IN");

    const now = new Date();
    await prisma.booking.update({
      where: { id: created.body.data.id },
      data: {
        startAt: addMinutes(now, -5),
        endAt: addMinutes(now, 115),
        occupiedUntil: addMinutes(now, 145),
      },
    });
    const checkedIn = await staff.agent
      .post(`/api/staff/bookings/${created.body.data.id}/check-in`)
      .send({});
    expect(checkedIn.status).toBe(200);
    expect(checkedIn.body.data.status).toBe("IN_USE");
    expect(checkedIn.body.data.checkedInAt).toBeTruthy();
    expect(
      await prisma.bookingStatusHistory.count({
        where: {
          bookingId: created.body.data.id,
          oldValue: "CONFIRMED",
          newValue: "IN_USE",
          reason: "check-in",
        },
      }),
    ).toBe(1);
  });

  it("Day 4: no-show is blocked before 15 minutes and cancels pending food when valid", async () => {
    const room = await createTestRoom();
    const customer = await registerAndLogin(app);
    const staff = await loginAs(app, "STAFF");
    const item = await prisma.menuItem.findFirstOrThrow({
      where: { isActive: true },
    });
    const created = await customer.agent
      .post("/api/bookings")
      .set("Idempotency-Key", key())
      .send(
        bookingPayload(room.id, {
          items: [{ menuItemId: item.id, quantity: 1 }],
        }),
      );

    const early = await staff.agent
      .post(`/api/staff/bookings/${created.body.data.id}/no-show`)
      .send({});
    expect(early.status).toBe(409);
    expect(early.body.error.code).toBe("TOO_EARLY_FOR_NO_SHOW");

    const now = new Date();
    await prisma.booking.update({
      where: { id: created.body.data.id },
      data: {
        startAt: addMinutes(now, -20),
        endAt: addMinutes(now, 100),
        occupiedUntil: addMinutes(now, 130),
      },
    });
    const noShow = await staff.agent
      .post(`/api/staff/bookings/${created.body.data.id}/no-show`)
      .send({ reason: "Customer did not arrive" });
    expect(noShow.status).toBe(200);
    expect(noShow.body.data.status).toBe("NO_SHOW");
    expect(
      await prisma.foodOrder.count({
        where: { bookingId: created.body.data.id, status: "CANCELLED" },
      }),
    ).toBe(1);
  });

  it("Day 4: overdue includes unresolved bookings and mark-used requires a finished session", async () => {
    const customer = await registerAndLogin(app);
    const staff = await loginAs(app, "STAFF");
    const confirmedRoom = await createTestRoom();
    const inUseRoom = await createTestRoom();
    const markUsedRoom = await createTestRoom();
    const create = async (roomId: number) =>
      customer.agent
        .post("/api/bookings")
        .set("Idempotency-Key", key())
        .send(bookingPayload(roomId));
    const confirmed = await create(confirmedRoom.id);
    const inUse = await create(inUseRoom.id);
    const markUsed = await create(markUsedRoom.id);
    const now = new Date();

    await prisma.booking.update({
      where: { id: confirmed.body.data.id },
      data: {
        startAt: addMinutes(now, -10),
        endAt: addMinutes(now, 110),
        occupiedUntil: addMinutes(now, 140),
      },
    });
    await prisma.booking.update({
      where: { id: inUse.body.data.id },
      data: {
        status: "IN_USE",
        startAt: addMinutes(now, -180),
        endAt: addMinutes(now, -60),
        occupiedUntil: addMinutes(now, -30),
      },
    });

    const overdue = await staff.agent.get("/api/staff/bookings/overdue");
    const overdueIds = overdue.body.data.map(
      (booking: { id: number }) => booking.id,
    );
    expect(overdueIds).toContain(confirmed.body.data.id);
    expect(overdueIds).toContain(inUse.body.data.id);

    const tooEarly = await staff.agent
      .post(`/api/staff/bookings/${markUsed.body.data.id}/mark-used`)
      .send({ note: "Forgot check-in" });
    expect(tooEarly.status).toBe(409);
    expect(tooEarly.body.error.code).toBe("NOT_ENDED");

    await prisma.booking.update({
      where: { id: markUsed.body.data.id },
      data: {
        startAt: addMinutes(now, -180),
        endAt: addMinutes(now, -60),
        occupiedUntil: addMinutes(now, -30),
      },
    });
    const completed = await staff.agent
      .post(`/api/staff/bookings/${markUsed.body.data.id}/mark-used`)
      .send({ note: "Customer used the room; staff forgot to check in" });
    expect(completed.status).toBe(200);
    expect(completed.body.data.status).toBe("COMPLETED");
    expect(completed.body.data.endedEarlyReason).toBeNull();
    expect(
      await prisma.bookingStatusHistory.count({
        where: {
          bookingId: markUsed.body.data.id,
          oldValue: "CONFIRMED",
          newValue: "COMPLETED",
        },
      }),
    ).toBe(1);
  });
});
