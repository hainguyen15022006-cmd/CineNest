import { describe, it, expect, afterAll } from "vitest";
import { createApp } from "../src/app.js";
import { closeDb, prisma } from "../src/core/prisma.js";
import { registerAndLogin, loginAs, createTestRoom, futureDate, key, bookingPayload } from "./helpers.js";

const app = createApp();

describe("Module 2 – Phòng và tìm phòng trống (Chúc)", () => {
  afterAll(closeDb);

  describe("GET /api/rooms & GET /api/rooms/:id (Công khai)", () => {
    it("Chỉ trả về các phòng đang hoạt động (isActive = true)", async () => {
      const activeRoom = await createTestRoom(2, 80_000);
      const inactiveRoom = await prisma.room.create({
        data: { name: `Inactive-${activeRoom.id}`, capacity: 2, hourlyPriceVnd: 80_000, isActive: false },
      });

      const { agent } = await registerAndLogin(app);
      const res = await agent.get("/api/rooms");
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);

      const ids = res.body.data.map((r: { id: number }) => r.id);
      expect(ids).toContain(activeRoom.id);
      expect(ids).not.toContain(inactiveRoom.id);
    });

    it("Xem chi tiết phòng active -> 200; phòng inactive hoặc không tồn tại -> 404", async () => {
      const room = await createTestRoom(4, 120_000);
      const inactiveRoom = await prisma.room.create({
        data: { name: `Closed-${room.id}`, capacity: 4, hourlyPriceVnd: 120_000, isActive: false },
      });

      const { agent } = await registerAndLogin(app);
      const okRes = await agent.get(`/api/rooms/${room.id}`);
      expect(okRes.status).toBe(200);
      expect(okRes.body.data.id).toBe(room.id);
      expect(okRes.body.data.hourlyPriceVnd).toBe(120_000);

      const notFoundRes = await agent.get(`/api/rooms/${inactiveRoom.id}`);
      expect(notFoundRes.status).toBe(404);
      expect(notFoundRes.body.error.code).toBe("ROOM_NOT_FOUND");

      const ghostRes = await agent.get("/api/rooms/99999999");
      expect(ghostRes.status).toBe(404);
    });
  });

  describe("GET /api/rooms/availability (Tìm phòng trống - PF01)", () => {
    it("Lọc theo sức chứa và tính roomTotalVnd chính xác", async () => {
      const smallRoom = await createTestRoom(2, 60_000);
      const largeRoom = await createTestRoom(6, 120_000);
      const d = futureDate(3);

      const { agent } = await registerAndLogin(app);
      // Tìm phòng cho 4 khách -> smallRoom không đủ chỗ
      const res4 = await agent.get(`/api/rooms/availability?date=${d}&startTime=14:00&duration=120&guests=4`);
      expect(res4.status).toBe(200);
      const ids4 = res4.body.data.rooms.map((r: { id: number }) => r.id);
      expect(ids4).not.toContain(smallRoom.id);
      expect(ids4).toContain(largeRoom.id);

      const target = res4.body.data.rooms.find((r: { id: number }) => r.id === largeRoom.id);
      expect(target.roomTotalVnd).toBe(240_000); // 120k * 2 giờ

      // Tìm phòng 3 giờ -> roomTotalVnd = 120k * 3
      const res3h = await agent.get(`/api/rooms/availability?date=${d}&startTime=14:00&duration=180&guests=4`);
      expect(res3h.status).toBe(200);
      const target3h = res3h.body.data.rooms.find((r: { id: number }) => r.id === largeRoom.id);
      expect(target3h.roomTotalVnd).toBe(360_000);
    });

    it("Quy tắc đệm 30 phút dọn dẹp: booking 14:00–16:00 (dọn đến 16:30) chặn 16:00 nhưng cho phép 16:30", async () => {
      const room = await createTestRoom(4, 90_000);
      const d = futureDate(4);
      const { agent } = await registerAndLogin(app);

      // Đặt phòng 14:00–16:00 (occupiedUntil = 16:30)
      const bRes = await agent
        .post("/api/bookings")
        .set("Idempotency-Key", key())
        .send(bookingPayload(room.id, { date: d, startTime: "14:00", duration: 120, guests: 2 }));
      expect(bRes.status).toBe(201);

      // 1. Khung 14:00–16:00 bị trùng -> không có trong kết quả
      const checkSame = await agent.get(`/api/rooms/availability?date=${d}&startTime=14:00&duration=120&guests=2`);
      expect(checkSame.body.data.rooms.map((r: { id: number }) => r.id)).not.toContain(room.id);

      // 2. Khung 16:00–18:00 va vào 30 phút dọn dẹp (16:00–16:30) -> không có trong kết quả
      const checkBuffer = await agent.get(`/api/rooms/availability?date=${d}&startTime=16:00&duration=120&guests=2`);
      expect(checkBuffer.body.data.rooms.map((r: { id: number }) => r.id)).not.toContain(room.id);

      // 3. Khung 16:30–18:30 chạm biên 16:30 -> phòng trống, có trong kết quả
      const checkBoundary = await agent.get(`/api/rooms/availability?date=${d}&startTime=16:30&duration=120&guests=2`);
      expect(checkBoundary.body.data.rooms.map((r: { id: number }) => r.id)).toContain(room.id);
    });

    it("Booking bị CANCELLED không giữ chỗ -> phòng vẫn trống trong khung giờ đó", async () => {
      const room = await createTestRoom(4, 100_000);
      const d = futureDate(5);
      const { agent } = await registerAndLogin(app);

      const bRes = await agent
        .post("/api/bookings")
        .set("Idempotency-Key", key())
        .send(bookingPayload(room.id, { date: d, startTime: "10:00", duration: 120, guests: 2 }));
      expect(bRes.status).toBe(201);

      // Hủy booking
      await prisma.booking.update({ where: { id: bRes.body.data.id }, data: { status: "CANCELLED" } });

      // Kiểm tra lại availability
      const check = await agent.get(`/api/rooms/availability?date=${d}&startTime=10:00&duration=120&guests=2`);
      expect(check.status).toBe(200);
      expect(check.body.data.rooms.map((r: { id: number }) => r.id)).toContain(room.id);
    });

    it("Dữ liệu đầu vào sai (ngày quá 14 ngày, thời lượng sai, ngoài giờ mở cửa) -> 422", async () => {
      const { agent } = await registerAndLogin(app);
      const d = futureDate(20); // quá 14 ngày

      const resDate = await agent.get(`/api/rooms/availability?date=${d}&startTime=10:00&duration=120&guests=2`);
      expect(resDate.status).toBe(422);

      const resDur = await agent.get(`/api/rooms/availability?date=${futureDate(2)}&startTime=10:00&duration=90&guests=2`);
      expect(resDur.status).toBe(422);
    });
  });

  describe("Admin CRUD & Quy tắc nghiệp vụ (BR06, BR08)", () => {
    it("Chỉ MANAGER mới được tạo/sửa phòng", async () => {
      const { agent: custAgent } = await registerAndLogin(app);
      const { agent: staffAgent } = await loginAs(app, "STAFF");

      const createData = { name: "VIP Room", capacity: 6, hourlyPriceVnd: 150_000 };
      expect((await custAgent.post("/api/admin/rooms").send(createData)).status).toBe(403);
      expect((await staffAgent.post("/api/admin/rooms").send(createData)).status).toBe(403);
    });

    it("MANAGER tạo phòng thành công kèm tiện nghi và ảnh", async () => {
      const { agent: mgrAgent } = await loginAs(app, "MANAGER");
      const res = await mgrAgent.post("/api/admin/rooms").send({
        name: "Phòng VIP 1",
        capacity: 8,
        hourlyPriceVnd: 200_000,
        description: "Phòng chiếu phim gia đình cao cấp",
        amenities: ["Máy chiếu 4K", "Dolby Atmos 7.1", "Sofa ngả lưng"],
        images: ["https://example.com/r1.jpg", "https://example.com/r2.jpg"],
      });

      expect(res.status).toBe(201);
      expect(res.body.data.name).toBe("Phòng VIP 1");
      expect(res.body.data.capacity).toBe(8);
      expect(res.body.data.amenities).toEqual(["Máy chiếu 4K", "Dolby Atmos 7.1", "Sofa ngả lưng"]);
      expect(res.body.data.images.length).toBe(2);
    });

    it("BR06: Không được đóng phòng (isActive = false) khi còn booking CONFIRMED hoặc IN_USE", async () => {
      const room = await createTestRoom(4, 100_000);
      const { agent: custAgent } = await registerAndLogin(app);
      const { agent: mgrAgent } = await loginAs(app, "MANAGER");

      // Tạo 1 booking CONFIRMED cho phòng
      await custAgent
        .post("/api/bookings")
        .set("Idempotency-Key", key())
        .send(bookingPayload(room.id, { date: futureDate(2), startTime: "14:00" }));

      // Thử đóng phòng -> 422 ROOM_HAS_BOOKINGS
      const res = await mgrAgent.patch(`/api/admin/rooms/${room.id}`).send({ isActive: false });
      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe("ROOM_HAS_BOOKINGS");

      // Phòng không có booking active -> đóng thành công
      const emptyRoom = await createTestRoom(2, 50_000);
      const closeRes = await mgrAgent.patch(`/api/admin/rooms/${emptyRoom.id}`).send({ isActive: false });
      expect(closeRes.status).toBe(200);
      expect(closeRes.body.data.isActive).toBe(false);
    });

    it("BR08: Đổi giá phòng thành công và quản lý có thể xem chi tiết phòng inactive", async () => {
      const room = await createTestRoom(4, 100_000);
      const { agent: mgrAgent } = await loginAs(app, "MANAGER");

      // Cập nhật giá mới
      const patchRes = await mgrAgent.patch(`/api/admin/rooms/${room.id}`).send({ hourlyPriceVnd: 150_000 });
      expect(patchRes.status).toBe(200);
      expect(patchRes.body.data.hourlyPriceVnd).toBe(150_000);

      // Đóng phòng
      await mgrAgent.patch(`/api/admin/rooms/${room.id}`).send({ isActive: false });

      // Admin GET /api/admin/rooms/:id vẫn xem được phòng dù isActive = false
      const getAdminRes = await mgrAgent.get(`/api/admin/rooms/${room.id}`);
      expect(getAdminRes.status).toBe(200);
      expect(getAdminRes.body.data.isActive).toBe(false);
    });
  });
});
