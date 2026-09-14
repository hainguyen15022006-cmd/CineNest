/**
 * Module 2 – Phòng và tìm phòng (Chúc). Đặc tả trang 4, 10; kiểm thử T03, T04; đo tải PF01.
 * Bộ nền cung cấp bản chạy được tối thiểu; Chúc sở hữu và tối ưu tiếp (chỉ mục, truy vấn).
 */
import { prisma, pool } from "../../core/prisma.js";
import { ApiError } from "../../core/http.js";
import { validateSlot, roomTotal, HOLDING_STATUSES } from "../../core/time.js";

const roomSelect = {
  id: true,
  name: true,
  capacity: true,
  description: true,
  amenities: true,
  hourlyPriceVnd: true,
  isActive: true,
  images: { select: { url: true, sortOrder: true }, orderBy: { sortOrder: "asc" as const } },
};

export function listRooms(includeInactive = false) {
  return prisma.room.findMany({ where: includeInactive ? {} : { isActive: true }, select: roomSelect, orderBy: { id: "asc" } });
}

export async function getRoom(id: number) {
  const room = await prisma.room.findUnique({ where: { id }, select: roomSelect });
  if (!room || !room.isActive) throw ApiError.notFound("ROOM_NOT_FOUND", "Không tìm thấy phòng");
  return room;
}

export type AvailabilityQuery = { date: string; startTime: string; duration: number; guests: number };

/**
 * Tìm phòng trống cho một khung giờ (GET /api/rooms/availability – API được đo ở PF01).
 * Dùng ĐÚNG quy tắc giao nhau của lớp 2: tstzrange(start_at, occupied_until, '[)') && khoảng yêu cầu,
 * nên kết quả tìm phòng và kết quả tạo booking không bao giờ khác nhau.
 */
export async function findAvailableRooms(q: AvailabilityQuery) {
  const win = validateSlot(q.date, q.startTime, q.duration, { source: "ONLINE" });
  const { rows } = await pool.query<{
    id: number; name: string; capacity: number; description: string; amenities: unknown; hourly_price_vnd: number; cover: string | null;
  }>(
    `SELECT r."id", r."name", r."capacity", r."description", r."amenities", r."hourly_price_vnd",
            (SELECT ri."url" FROM "room_image" ri WHERE ri."room_id" = r."id" ORDER BY ri."sort_order" LIMIT 1) AS cover
     FROM "room" r
     WHERE r."is_active" = true
       AND r."capacity" >= $3
       AND NOT EXISTS (
         SELECT 1 FROM "booking" b
         WHERE b."room_id" = r."id"
           AND b."status"::text = ANY($4::text[])
           AND tstzrange(b."start_at", b."occupied_until", '[)') && tstzrange($1::timestamptz, $2::timestamptz, '[)')
       )
     ORDER BY r."hourly_price_vnd", r."id"`,
    [win.startAt, win.occupiedUntil, q.guests, [...HOLDING_STATUSES]],
  );
  return {
    window: win,
    rooms: rows.map((r) => ({
      id: r.id,
      name: r.name,
      capacity: r.capacity,
      description: r.description,
      amenities: r.amenities,
      hourlyPriceVnd: r.hourly_price_vnd,
      roomTotalVnd: roomTotal(r.hourly_price_vnd, q.duration),
      cover: r.cover,
    })),
  };
}

// ---- Quản trị phòng (chỉ MANAGER) ----

export type RoomInput = {
  name: string;
  capacity: number;
  description?: string;
  amenities?: string[];
  hourlyPriceVnd: number;
  isActive?: boolean;
  images?: string[];
};

export function createRoom(input: RoomInput) {
  return prisma.room.create({
    data: {
      name: input.name,
      capacity: input.capacity,
      description: input.description ?? "",
      amenities: input.amenities ?? [],
      hourlyPriceVnd: input.hourlyPriceVnd,
      isActive: input.isActive ?? true,
      images: { create: (input.images ?? []).map((url, i) => ({ url, sortOrder: i })) },
    },
    select: roomSelect,
  });
}

export async function updateRoom(id: number, input: Partial<RoomInput>) {
  if (input.isActive === false) {
    // BR06: không đóng phòng khi còn booking xác nhận hoặc đang sử dụng
    const active = await prisma.booking.count({ where: { roomId: id, status: { in: ["CONFIRMED", "IN_USE"] } } });
    if (active > 0) throw ApiError.unprocessable("ROOM_HAS_BOOKINGS", "Phòng còn booking đang hiệu lực, hãy xử lý trước khi đóng");
  }
  return prisma.room.update({
    where: { id },
    data: {
      ...(input.name !== undefined && { name: input.name }),
      ...(input.capacity !== undefined && { capacity: input.capacity }),
      ...(input.description !== undefined && { description: input.description }),
      ...(input.amenities !== undefined && { amenities: input.amenities }),
      ...(input.hourlyPriceVnd !== undefined && { hourlyPriceVnd: input.hourlyPriceVnd }), // BR08: giá mới chỉ áp dụng cho booking tạo sau
      ...(input.isActive !== undefined && { isActive: input.isActive }),
      ...(input.images !== undefined && {
        images: { deleteMany: {}, create: input.images.map((url, i) => ({ url, sortOrder: i })) },
      }),
    },
    select: roomSelect,
  });
}
