/**
 * Module 4 – Phim (Thành Lê). Đặc tả trang 6 (MOV01–MOV08); kiểm thử T07, T08, T13.
 * Bộ nền cung cấp: danh mục, kiểm tra phim cho booking, đổi phim, chuẩn bị phim, CRUD quản trị.
 */
import { prisma, type Tx } from "../../core/prisma.js";
import { ApiError } from "../../core/http.js";
import { STABILIZE_MINUTES } from "../../core/time.js";
import type { PreparationStatus } from "../../generated/prisma/enums.js";

const movieSelect = { id: true, title: true, genre: true, durationMinutes: true, ageLabel: true, description: true, posterUrl: true, isActive: true } as const;

export type MovieListQuery = { q?: string; genre?: string; maxMinutes?: number; includeInactive?: boolean; page?: number; limit?: number };

/**
 * Danh mục phim có tìm kiếm + phân trang (kho phim thật vài nghìn phim từ The Movies Dataset nên không trả toàn bộ).
 * `q` tìm theo tên (không phân biệt hoa thường); `genre` lọc thể loại; `maxMinutes` = gói − 10 phút (MOV03) để chỉ lấy phim vừa gói.
 */
export async function listMovies(opts: MovieListQuery = {}) {
  const page = Math.max(1, opts.page ?? 1);
  const limit = Math.min(100, Math.max(1, opts.limit ?? 24));
  const where = {
    ...(opts.includeInactive ? {} : { isActive: true }),
    ...(opts.q ? { title: { contains: opts.q.trim(), mode: "insensitive" as const } } : {}),
    ...(opts.genre ? { genre: opts.genre } : {}),
    ...(opts.maxMinutes ? { durationMinutes: { lte: opts.maxMinutes } } : {}),
  };
  const [items, total] = await prisma.$transaction([
    prisma.movie.findMany({ where, select: movieSelect, orderBy: [{ title: "asc" }, { id: "asc" }], skip: (page - 1) * limit, take: limit }),
    prisma.movie.count({ where }),
  ]);
  return { items, total, page, limit };
}

/** Thể loại đang có (kèm số phim ACTIVE) để lọc trong giao diện chọn phim */
export async function listGenres() {
  const rows = await prisma.movie.groupBy({ by: ["genre"], where: { isActive: true }, _count: { _all: true }, orderBy: { _count: { genre: "desc" } } });
  return rows.map((r) => ({ genre: r.genre, count: r._count._all }));
}

export async function getMovie(id: number) {
  const m = await prisma.movie.findUnique({ where: { id }, select: movieSelect });
  if (!m) throw ApiError.notFound("MOVIE_NOT_FOUND", "Không tìm thấy phim");
  return m;
}

/** Thời lượng tối đa của phim cho một khoảng thời gian còn lại (MOV03: trừ 10 phút ổn định) */
export function maxMovieMinutes(availableMinutes: number): number {
  return availableMinutes - STABILIZE_MINUTES;
}

/**
 * HÀM DÙNG CHUNG với module 3: kiểm tra phim ACTIVE và đủ ngắn cho thời lượng cho phép.
 * `availableMinutes` = thời lượng gói khi đặt trước; = thời gian còn lại khi chọn tại quán (trang 6).
 */
export async function validateMovieForBooking(tx: Tx, movieId: number, availableMinutes: number) {
  // Ngăn quản lý ngừng phim giữa lúc booking đang chụp snapshot lựa chọn.
  await tx.$queryRaw`SELECT "id" FROM "movie" WHERE "id" = ${movieId} FOR SHARE`;
  const movie = await tx.movie.findUnique({ where: { id: movieId }, select: movieSelect });
  if (!movie || !movie.isActive) throw ApiError.unprocessable("MOVIE_UNAVAILABLE", "Phim không còn phục vụ");
  if (movie.durationMinutes > maxMovieMinutes(availableMinutes)) {
    throw ApiError.unprocessable(
      "MOVIE_TOO_LONG",
      `Phim dài ${movie.durationMinutes} phút, vượt mức cho phép ${maxMovieMinutes(availableMinutes)} phút; chọn phim khác hoặc gói dài hơn`,
    );
  }
  return movie;
}

/** MOV05/MOV06: khách đổi phim khi CONFIRMED và chưa đến giờ; đặt lại PENDING, tăng movie_version */
export async function changeMovie(bookingId: number, movieId: number | null, actorId: number, isStaff: boolean) {
  return prisma.$transaction(async (tx) => {
    // updateMovie khóa movie rồi cập nhật booking; giữ cùng thứ tự để tránh deadlock.
    if (movieId) await tx.$queryRaw`SELECT "id" FROM "movie" WHERE "id" = ${movieId} FOR SHARE`;
    await tx.$queryRaw`SELECT "id" FROM "booking" WHERE "id" = ${bookingId} FOR UPDATE`;
    const b = await tx.booking.findUnique({
      where: { id: bookingId },
      select: { customerId: true, status: true, startAt: true, endAt: true, movieVersion: true, movieTitleSnapshot: true },
    });
    if (!b || (!isStaff && b.customerId !== actorId)) throw ApiError.notFound("BOOKING_NOT_FOUND", "Không tìm thấy booking");
    const now = new Date();
    let available: number;
    if (isStaff && b.status === "IN_USE") {
      // Chọn phim tại quán: so với thời gian còn lại (trang 6)
      available = Math.floor((b.endAt.getTime() - now.getTime()) / 60_000);
    } else {
      if (b.status !== "CONFIRMED" || b.startAt <= now) throw ApiError.conflict("MOVIE_LOCKED", "Chỉ đổi phim khi booking đã xác nhận và chưa đến giờ bắt đầu");
      available = Math.round((b.endAt.getTime() - b.startAt.getTime()) / 60_000);
    }
    const movie = movieId ? await validateMovieForBooking(tx, movieId, available) : null;
    const updated = await tx.booking.update({
      where: { id: bookingId },
      data: {
        movieId: movie?.id ?? null,
        movieTitleSnapshot: movie?.title ?? null,
        movieDurationSnapshot: movie?.durationMinutes ?? null,
        preparationStatus: movie ? "PENDING" : "NOT_SELECTED",
        movieVersion: { increment: 1 },
      },
      select: { id: true, movieId: true, movieTitleSnapshot: true, preparationStatus: true, movieVersion: true },
    });
    await tx.bookingStatusHistory.create({
      data: { bookingId, field: "preparation_status", oldValue: b.movieTitleSnapshot ?? "(none)", newValue: movie ? `PENDING:${movie.title}` : "NOT_SELECTED", actorId },
    });
    return updated;
  });
}

/** Danh sách booking cần chuẩn bị phim cho một ngày (trang 10 – nhân viên) */
export function listPreparation(dayStart: Date, dayEnd: Date) {
  return prisma.booking.findMany({
    where: { startAt: { gte: dayStart, lt: dayEnd }, status: { in: ["CONFIRMED", "IN_USE"] }, movieId: { not: null } },
    select: { id: true, code: true, startAt: true, room: { select: { name: true } }, movieTitleSnapshot: true, movieDurationSnapshot: true, preparationStatus: true, movieVersion: true },
    orderBy: { startAt: "asc" },
  });
}

/** MOV06: đánh dấu READY với khóa lạc quan movie_version; MOV07: UNAVAILABLE */
export async function setPreparation(bookingId: number, status: Extract<PreparationStatus, "READY" | "UNAVAILABLE" | "PENDING">, expectedVersion: number, actorId: number) {
  return prisma.$transaction(async (tx) => {
    const current = await tx.booking.findUnique({
      where: { id: bookingId },
      select: {
        status: true,
        movieId: true,
        movieVersion: true,
        preparationStatus: true,
        movie: { select: { isActive: true } },
      },
    });
    if (!current || current.movieId === null) {
      throw ApiError.notFound("BOOKING_NOT_FOUND", "Không tìm thấy booking có phim cần chuẩn bị");
    }
    if (current.movieVersion !== expectedVersion) {
      throw ApiError.conflict("MOVIE_CHANGED", "Lựa chọn phim đã thay đổi, hãy tải lại trước khi xác nhận");
    }
    if (current.status !== "CONFIRMED" && current.status !== "IN_USE") {
      throw ApiError.conflict("INVALID_TRANSITION", "Booking không còn ở trạng thái cho phép chuẩn bị phim");
    }
    if (status !== "UNAVAILABLE" && !current.movie?.isActive) {
      throw ApiError.unprocessable("MOVIE_UNAVAILABLE", "Phim không còn phục vụ");
    }

    // Giữ điều kiện version ngay trên UPDATE để một thay đổi phim xảy ra sau lần đọc
    // vẫn làm thao tác này thất bại thay vì ghi đè PENDING/UNAVAILABLE mới hơn.
    const updated = await tx.booking.updateMany({
      where: { id: bookingId, movieVersion: expectedVersion, movieId: { not: null }, status: { in: ["CONFIRMED", "IN_USE"] } },
      data: { preparationStatus: status },
    });
    if (updated.count === 0) {
      throw ApiError.conflict("MOVIE_CHANGED", "Lựa chọn phim đã thay đổi, hãy tải lại trước khi xác nhận");
    }
    await tx.bookingStatusHistory.create({
      data: { bookingId, field: "preparation_status", oldValue: current.preparationStatus, newValue: status, actorId },
    });
    return tx.booking.findUnique({ where: { id: bookingId }, select: { id: true, preparationStatus: true, movieVersion: true } });
  });
}

// ---- Quản trị phim ----
export type MovieInput = { title: string; genre: string; durationMinutes: number; ageLabel: string; description?: string; posterUrl?: string | null; isActive?: boolean };

export function createMovie(input: MovieInput) {
  return prisma.movie.create({ data: { ...input, description: input.description ?? "" }, select: movieSelect });
}

/** MOV07: ngừng phục vụ phim -> booking đang chọn phim đó chuyển UNAVAILABLE để chọn lại */
export async function updateMovie(id: number, input: Partial<MovieInput>) {
  return prisma.$transaction(async (tx) => {
    const previous = await tx.movie.findUnique({ where: { id }, select: { isActive: true } });
    if (!previous) throw ApiError.notFound("MOVIE_NOT_FOUND", "Không tìm thấy phim");
    const movie = await tx.movie.update({ where: { id }, data: input, select: movieSelect });
    if (previous.isActive && input.isActive === false) {
      await tx.booking.updateMany({
        where: { movieId: id, status: { in: ["CONFIRMED", "IN_USE"] } },
        // Tăng version để mọi màn hình nhân viên đang giữ lựa chọn cũ nhận MOVIE_CHANGED.
        data: { preparationStatus: "UNAVAILABLE", movieVersion: { increment: 1 } },
      });
    }
    return movie;
  });
}
