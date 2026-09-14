/**
 * Module 4 – Phim (Thành Lê). Danh mục phim có tìm kiếm + phân trang (kho phim thật vài nghìn phim) và MOV02/MOV03.
 * Tự tạo phim riêng (tiền tố ngẫu nhiên) nên không phụ thuộc seed.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { closeDb, prisma } from "../src/core/prisma.js";
import { computeWindow, vnToDate } from "../src/core/time.js";
import { changeMovie, updateMovie, validateMovieForBooking } from "../src/modules/movies/movies.service.js";
import { bookingPayload, createTestRoom, futureDate, key, loginAs, registerAndLogin, uid } from "./helpers.js";

const app = createApp();
const tag = `ZZ${uid()}`; // tên phim bắt đầu bằng tag để tìm được đúng nhóm phim của test này

describe("Module 4 – danh mục phim: tìm kiếm, phân trang, lọc theo gói", () => {
  beforeAll(async () => {
    await prisma.movie.createMany({
      data: Array.from({ length: 30 }, (_, i) => ({
        title: `${tag} phim ${String(i + 1).padStart(2, "0")}`,
        genre: i % 3 === 0 ? `${tag}-Hài` : `${tag}-Tâm lý`,
        durationMinutes: 80 + i * 4, // 80 .. 196 phút
        ageLabel: "T13",
        description: "phim kiểm thử",
        isActive: i !== 29, // phim cuối ngừng phục vụ (MOV02)
      })),
    });
  });
  afterAll(async () => {
    const taggedMovies = await prisma.movie.findMany({ where: { title: { startsWith: tag } }, select: { id: true } });
    const taggedMovieIds = taggedMovies.map((m) => m.id);
    const linkedBookings = await prisma.booking.findMany({ where: { movieId: { in: taggedMovieIds } }, select: { id: true } });
    const linkedBookingIds = linkedBookings.map((b) => b.id);
    await prisma.bookingStatusHistory.deleteMany({ where: { bookingId: { in: linkedBookingIds } } });
    await prisma.booking.deleteMany({ where: { id: { in: linkedBookingIds } } });
    await prisma.movie.deleteMany({ where: { title: { startsWith: tag } } });
    await closeDb();
  });

  it("GET /api/movies trả { items, total, page, limit }; mặc định 24/trang; phim ngừng phục vụ bị ẩn", async () => {
    const r1 = await request(app).get(`/api/movies?q=${tag}`);
    expect(r1.status).toBe(200);
    expect(r1.body.data.total).toBe(29);
    expect(r1.body.data.items).toHaveLength(24);
    expect(r1.body.data.page).toBe(1);
    const r2 = await request(app).get(`/api/movies?q=${tag}&page=2`);
    expect(r2.body.data.items).toHaveLength(5);
    expect(r2.body.data.items.map((m: { title: string }) => m.title)).not.toContain(`${tag} phim 30`);
  });

  it("tìm không phân biệt hoa thường, lọc thể loại, giới hạn limit ≤ 100", async () => {
    const r = await request(app).get(`/api/movies?q=${tag.toLowerCase()}%20phim%2001`);
    expect(r.body.data.total).toBe(1);
    const g = await request(app).get(`/api/movies?q=${tag}&genre=${encodeURIComponent(`${tag}-Hài`)}&limit=100`);
    expect(g.body.data.total).toBe(10);
    expect((await request(app).get("/api/movies?limit=500")).status).toBe(422);
  });

  it("maxMinutes chỉ trả phim vừa gói (MOV03: gói 120 → tối đa 110 phút)", async () => {
    const r = await request(app).get(`/api/movies?q=${tag}&maxMinutes=110&limit=100`);
    expect(r.body.data.items.every((m: { durationMinutes: number }) => m.durationMinutes <= 110)).toBe(true);
    expect(r.body.data.total).toBe(8); // 80,84,...,108
  });

  it("GET /api/movies/genres trả thể loại kèm số phim ACTIVE", async () => {
    const r = await request(app).get("/api/movies/genres");
    expect(r.status).toBe(200);
    const hai = r.body.data.find((x: { genre: string }) => x.genre === `${tag}-Hài`);
    expect(hai.count).toBe(10);
    const tamly = r.body.data.find((x: { genre: string }) => x.genre === `${tag}-Tâm lý`);
    expect(tamly.count).toBe(19); // 20 phim, 1 ngừng phục vụ
  });

  it("quản lý thấy cả phim ngừng phục vụ ở /api/admin/movies", async () => {
    const { agent } = await loginAs(app, "MANAGER");
    const r = await agent.get(`/api/admin/movies?q=${tag}&limit=100`);
    expect(r.status).toBe(200);
    expect(r.body.data.total).toBe(30);
  });

  it("T07: phim 110 phút vừa gói 120; phim 111 phút bị chặn", async () => {
    const [fits, tooLong] = await Promise.all([
      prisma.movie.create({ data: { title: `${tag} T07-110`, genre: "Test", durationMinutes: 110, ageLabel: "NR" } }),
      prisma.movie.create({ data: { title: `${tag} T07-111`, genre: "Test", durationMinutes: 111, ageLabel: "NR" } }),
    ]);
    await expect(prisma.$transaction((tx) => validateMovieForBooking(tx, fits.id, 120))).resolves.toMatchObject({ id: fits.id });
    await expect(prisma.$transaction((tx) => validateMovieForBooking(tx, tooLong.id, 120))).rejects.toMatchObject({ code: "MOVIE_TOO_LONG" });
  });

  it("T08: đổi phim sau READY đưa về PENDING; ngừng phim đưa booking về UNAVAILABLE", async () => {
    const customer = await registerAndLogin(app);
    const room = await createTestRoom();
    const [oldMovie, newMovie] = await Promise.all([
      prisma.movie.create({ data: { title: `${tag} T08-old`, genre: "Test", durationMinutes: 90, ageLabel: "NR" } }),
      prisma.movie.create({ data: { title: `${tag} T08-new`, genre: "Test", durationMinutes: 95, ageLabel: "NR" } }),
    ]);
    const startAt = vnToDate(futureDate(7), "14:00");
    const window = computeWindow(startAt, 120);
    const booking = await prisma.booking.create({
      data: {
        code: `T08-${uid()}`,
        customerId: customer.id,
        roomId: room.id,
        contactName: "Khách test",
        contactPhone: "0912345678",
        guestCount: 2,
        startAt: window.startAt,
        endAt: window.endAt,
        occupiedUntil: window.occupiedUntil,
        roomRateSnapshot: room.hourlyPriceVnd,
        roomTotal: room.hourlyPriceVnd * 2,
        movieId: oldMovie.id,
        movieTitleSnapshot: oldMovie.title,
        movieDurationSnapshot: oldMovie.durationMinutes,
        preparationStatus: "READY",
      },
    });
    const changed = await changeMovie(booking.id, newMovie.id, customer.id, false);
    expect(changed.preparationStatus).toBe("PENDING");
    await updateMovie(newMovie.id, { isActive: false });
    expect((await prisma.booking.findUnique({ where: { id: booking.id } }))?.preparationStatus).toBe("UNAVAILABLE");
  });

  it("T13: hai phòng khác nhau được đặt cùng một phim", async () => {
    const movie = await prisma.movie.findFirstOrThrow({ where: { isActive: true, durationMinutes: { lte: 110 } } });
    const [roomA, roomB, userA, userB] = await Promise.all([createTestRoom(), createTestRoom(), registerAndLogin(app), registerAndLogin(app)]);
    const date = futureDate(8);
    const [a, b] = await Promise.all([
      userA.agent.post("/api/bookings").set("Idempotency-Key", key()).send(bookingPayload(roomA.id, { date, startTime: "09:00", movieId: movie.id })),
      userB.agent.post("/api/bookings").set("Idempotency-Key", key()).send(bookingPayload(roomB.id, { date, startTime: "09:00", movieId: movie.id })),
    ]);
    expect([a.status, b.status]).toEqual([201, 201]);
    expect([a.body.data.movieId, b.body.data.movieId]).toEqual([movie.id, movie.id]);
  });
});
