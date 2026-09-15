/**
 * Dữ liệu mẫu dùng chung (đặc tả trang 15: 8–10 phòng, 15–20 món, 3 tài khoản demo; ~50 phim thật – nhập thêm hàng nghìn phim bằng prisma/import-movies.ts).
 * Chạy: npm run db:seed   (xóa sạch dữ liệu cũ rồi nạp lại – CHỈ dùng cho môi trường phát triển/demo)
 * Đặt SEED_PERF=1 để tạo thêm 300 tài khoản perf1..perf300@demo.local (mật khẩu Perf#12345) cho Locust.
 * Bộ sinh 10.000 booking lịch sử cho PF01 là việc của Thành Lê (perf/generate_history.py) – không nằm ở đây.
 */
import bcrypt from "bcryptjs";
import { pool, prisma, closeDb } from "../src/core/prisma.js";
import { vnToDate, todayVn, addMinutes, computeWindow, roomTotal, generateBookingCode, dateToVn } from "../src/core/time.js";

const PASSWORDS = { manager: "Manager#123", staff: "Staff#1234", customer: "Khach#123", perf: "Perf#12345" };

function shiftDate(date: string, days: number): string {
  return dateToVn(addMinutes(vnToDate(date, "12:00"), days * 24 * 60)).date;
}

async function main() {
  console.log("Xóa dữ liệu cũ...");
  await pool.query(`TRUNCATE "payment","adjustment","food_order_item","food_order","booking_status_history","idempotency_request",
    "booking","room_image","room","movie","menu_item","login_attempt","session","user" RESTART IDENTITY CASCADE`);

  console.log("Tài khoản demo...");
  const [manager, staff, customer] = await Promise.all([
    prisma.user.create({ data: { name: "Demo Manager", email: "manager@demo.local", phone: "0900000001", role: "MANAGER", passwordHash: await bcrypt.hash(PASSWORDS.manager, 10) } }),
    prisma.user.create({ data: { name: "Demo Staff", email: "staff@demo.local", phone: "0900000002", role: "STAFF", passwordHash: await bcrypt.hash(PASSWORDS.staff, 10) } }),
    prisma.user.create({ data: { name: "Demo Customer", email: "khach@demo.local", phone: "0900000003", role: "CUSTOMER", passwordHash: await bcrypt.hash(PASSWORDS.customer, 10) } }),
  ]);
  const customer2 = await prisma.user.create({ data: { name: "Nguyễn Văn An", email: "an@demo.local", phone: "0900000004", role: "CUSTOMER", passwordHash: await bcrypt.hash(PASSWORDS.customer, 10) } });

  if (process.env.SEED_PERF === "1") {
    console.log("300 tài khoản perf cho Locust...");
    const hash = await bcrypt.hash(PASSWORDS.perf, 10);
    await prisma.user.createMany({
      data: Array.from({ length: 300 }, (_, i) => ({ name: `Perf ${i + 1}`, email: `perf${i + 1}@demo.local`, phone: `09${String(10000000 + i).padStart(8, "0")}`, role: "CUSTOMER" as const, passwordHash: hash })),
    });
  }

  console.log("Phòng...");
  const roomDefs = [
    { name: "Room 101 – Classic", capacity: 2, price: 89_000, amenities: ["120-inch projector", "Soundbar", "Air conditioning", "Two-seat sofa"] },
    { name: "Room 102 – Classic", capacity: 2, price: 89_000, amenities: ["120-inch projector", "Soundbar", "Air conditioning", "Two-seat sofa"] },
    { name: "Room 103 – Classic", capacity: 2, price: 89_000, amenities: ["120-inch projector", "Soundbar", "Air conditioning", "Floor seating"] },
    { name: "Room 201 – Queen", capacity: 3, price: 99_000, amenities: ["150-inch projector", "2.1 sound system", "Air conditioning", "Air purifier", "Private restroom"] },
    { name: "Room 202 – Queen", capacity: 3, price: 99_000, amenities: ["150-inch projector", "2.1 sound system", "Air conditioning", "Air purifier", "Private restroom"] },
    { name: "Room 203 – Queen", capacity: 3, price: 99_000, amenities: ["150-inch projector", "2.1 sound system", "Air conditioning", "Private restroom"] },
    { name: "Room 301 – King", capacity: 4, price: 109_000, amenities: ["200-inch projector", "5.1 sound system", "Air conditioning", "Air purifier", "Private restroom", "Window"] },
    { name: "Room 302 – King", capacity: 4, price: 109_000, amenities: ["200-inch projector", "5.1 sound system", "Air conditioning", "Air purifier", "Private restroom", "Window"] },
    { name: "Room 401 – Group", capacity: 6, price: 139_000, amenities: ["200-inch projector", "5.1 sound system", "Air conditioning", "Two sofas", "Large table"] },
    { name: "Room 402 – Group", capacity: 6, price: 139_000, amenities: ["200-inch projector", "5.1 sound system", "Air conditioning", "Two sofas", "Large table"] },
  ];
  const rooms = [];
  for (const [i, r] of roomDefs.entries()) {
    rooms.push(
      await prisma.room.create({
        data: {
          name: r.name,
          capacity: r.capacity,
          hourlyPriceVnd: r.price,
          amenities: r.amenities,
          description: `Private room for up to ${r.capacity} guests, with a private key and no cameras.`,
          images: { create: [{ url: `https://picsum.photos/seed/room${i + 1}/800/500`, sortOrder: 0 }, { url: `https://picsum.photos/seed/room${i + 1}b/800/500`, sortOrder: 1 }] },
        },
      }),
    );
  }

  console.log("Phim (phim thật; thời lượng theo bản chiếu rạp, nhãn tuổi theo phân loại Việt Nam, quản lý sửa tay nếu cần)...");
  // [tên, năm, phút, thể loại, nhãn tuổi, quốc gia]. Vài phim dài (>170 phút) để kiểm MOV03/MOV04: không vừa gói nào.
  const movieDefs: [string, number, number, string, string, string][] = [
    ["Bố Già", 2021, 128, "Tâm lý", "T13", "Việt Nam"],
    ["Mắt Biếc", 2019, 117, "Tình cảm", "P", "Việt Nam"],
    ["Em và Trịnh", 2022, 136, "Tâm lý", "T13", "Việt Nam"],
    ["Nhà Bà Nữ", 2023, 108, "Hài", "T13", "Việt Nam"],
    ["Mai", 2024, 131, "Tâm lý", "T18", "Việt Nam"],
    ["Lật Mặt 6: Tấm Vé Định Mệnh", 2023, 132, "Hành động", "T16", "Việt Nam"],
    ["Hai Phượng", 2019, 98, "Hành động", "T18", "Việt Nam"],
    ["Tiệc Trăng Máu", 2020, 118, "Hài", "T16", "Việt Nam"],
    ["Tháng Năm Rực Rỡ", 2018, 135, "Tâm lý", "T13", "Việt Nam"],
    ["Cô Ba Sài Gòn", 2017, 100, "Hài", "P", "Việt Nam"],
    ["Ròm", 2019, 79, "Tâm lý", "T16", "Việt Nam"],
    ["Đào, Phở và Piano", 2024, 100, "Tâm lý", "T13", "Việt Nam"],
    ["Inception", 2010, 148, "Khoa học viễn tưởng", "T13", "Mỹ"],
    ["Interstellar", 2014, 169, "Khoa học viễn tưởng", "T13", "Mỹ"],
    ["The Dark Knight", 2008, 152, "Hành động", "T13", "Mỹ"],
    ["Parasite", 2019, 132, "Tâm lý", "T18", "Hàn Quốc"],
    ["Joker", 2019, 122, "Tâm lý", "T18", "Mỹ"],
    ["Titanic", 1997, 194, "Tình cảm", "T13", "Mỹ"],
    ["La La Land", 2016, 128, "Tình cảm", "T13", "Mỹ"],
    ["Whiplash", 2014, 106, "Tâm lý", "T13", "Mỹ"],
    ["Forrest Gump", 1994, 142, "Tâm lý", "T13", "Mỹ"],
    ["The Shawshank Redemption", 1994, 142, "Tâm lý", "T16", "Mỹ"],
    ["Pulp Fiction", 1994, 154, "Tâm lý", "T18", "Mỹ"],
    ["The Godfather", 1972, 175, "Tâm lý", "T18", "Mỹ"],
    ["Get Out", 2017, 104, "Kinh dị", "T16", "Mỹ"],
    ["A Quiet Place", 2018, 90, "Kinh dị", "T16", "Mỹ"],
    ["The Conjuring", 2013, 112, "Kinh dị", "T18", "Mỹ"],
    ["Hereditary", 2018, 127, "Kinh dị", "T18", "Mỹ"],
    ["Train to Busan", 2016, 118, "Kinh dị", "T16", "Hàn Quốc"],
    ["Oldboy", 2003, 120, "Tâm lý", "T18", "Hàn Quốc"],
    ["Spirited Away", 2001, 125, "Hoạt hình", "P", "Nhật Bản"],
    ["My Neighbor Totoro", 1988, 86, "Hoạt hình", "P", "Nhật Bản"],
    ["Howl's Moving Castle", 2004, 119, "Hoạt hình", "P", "Nhật Bản"],
    ["Your Name", 2016, 106, "Hoạt hình", "P", "Nhật Bản"],
    ["Weathering with You", 2019, 112, "Hoạt hình", "P", "Nhật Bản"],
    ["Suzume", 2022, 122, "Hoạt hình", "P", "Nhật Bản"],
    ["Toy Story", 1995, 81, "Hoạt hình", "P", "Mỹ"],
    ["Coco", 2017, 105, "Hoạt hình", "P", "Mỹ"],
    ["Inside Out", 2015, 95, "Hoạt hình", "P", "Mỹ"],
    ["Up", 2009, 96, "Hoạt hình", "P", "Mỹ"],
    ["Zootopia", 2016, 108, "Hoạt hình", "P", "Mỹ"],
    ["Kung Fu Panda", 2008, 92, "Hoạt hình", "P", "Mỹ"],
    ["Home Alone", 1990, 103, "Hài", "P", "Mỹ"],
    ["The Intouchables", 2011, 112, "Hài", "T13", "Pháp"],
    ["3 Idiots", 2009, 170, "Hài", "T13", "Ấn Độ"],
    ["About Time", 2013, 123, "Tình cảm", "T13", "Anh"],
    ["Crazy Rich Asians", 2018, 120, "Hài", "T13", "Mỹ"],
    ["Avengers: Endgame", 2019, 181, "Hành động", "T13", "Mỹ"],
    ["Mad Max: Fury Road", 2015, 120, "Hành động", "T16", "Úc"],
    ["John Wick", 2014, 101, "Hành động", "T18", "Mỹ"],
    ["Mission: Impossible – Fallout", 2018, 147, "Hành động", "T13", "Mỹ"],
  ];
  const movies: { id: number; title: string; durationMinutes: number }[] = [];
  const genreInEnglish: Record<string, string> = {
    "Tâm lý": "Drama", "Tình cảm": "Romance", "Hài": "Comedy", "Hành động": "Action",
    "Khoa học viễn tưởng": "Science Fiction", "Kinh dị": "Horror", "Hoạt hình": "Animation",
  };
  const countryInEnglish: Record<string, string> = {
    "Việt Nam": "Vietnam", "Mỹ": "United States", "Hàn Quốc": "South Korea", "Nhật Bản": "Japan",
    "Pháp": "France", "Ấn Độ": "India", "Anh": "United Kingdom", "Úc": "Australia",
  };
  for (const [title, year, duration, genre, age, country] of movieDefs) {
    const displayGenre = genreInEnglish[genre] ?? genre;
    const displayCountry = countryInEnglish[country] ?? country;
    movies.push(
      await prisma.movie.create({
        data: { title, genre: displayGenre, durationMinutes: duration, ageLabel: age, description: `${displayGenre} · ${year} · ${displayCountry}`, posterUrl: null },
      }),
    );
  }

  /** Phim theo tên – booking mẫu phải chọn phim VỪA gói (MOV03: gói 120 ≤ 110 phút, gói 180 ≤ 170 phút) */
  const movie = (title: string) => movies.find((m) => m.title === title)!;

  console.log("Menu...");
  const menuDefs: [string, "DRINK" | "SNACK" | "FOOD", number][] = [
    ["Peach orange lemongrass tea", "DRINK", 35_000], ["Pearl milk tea", "DRINK", 35_000], ["Vietnamese iced coffee", "DRINK", 30_000], ["Hot cocoa", "DRINK", 35_000],
    ["Orange juice", "DRINK", 40_000], ["Blueberry soda", "DRINK", 39_000], ["Butter popcorn", "SNACK", 40_000], ["French fries", "SNACK", 45_000],
    ["Chicken skewers", "SNACK", 65_000], ["Fried fermented pork rolls", "SNACK", 55_000], ["Grilled sausage", "SNACK", 50_000], ["Mini pizza", "FOOD", 65_000],
    ["Beef spaghetti", "FOOD", 65_000], ["Grilled beef baguette", "FOOD", 50_000], ["Popcorn + 2 drinks combo", "SNACK", 99_000],
  ];
  const menu: { id: number; name: string; priceVnd: number }[] = [];
  for (const [i, [name, category, price]] of menuDefs.entries()) {
    menu.push(await prisma.menuItem.create({ data: { name, category, priceVnd: price, imageUrl: `https://picsum.photos/seed/menu${i + 1}/300/200` } }));
  }

  console.log("Booking mẫu ở đủ trạng thái...");
  const today = todayVn();
  const now = new Date();
  const roundedNow = new Date(Math.floor(now.getTime() / (30 * 60_000)) * 30 * 60_000);

  type Seed = { room: number; date: string; time?: string; startAt?: Date; duration: number; status: "CONFIRMED" | "IN_USE" | "COMPLETED" | "CANCELLED" | "NO_SHOW"; pay?: "PAID" | "WAIVED"; customer?: number; movie?: number; items?: [number, number][]; orderStatus?: "PENDING" | "PREPARING" | "SERVED"; endedEarly?: string; adjustment?: { kind: "REDUCE" | "WAIVE"; amount?: number; reason: string; status?: "PENDING_APPROVAL" | "APPROVED" }; note?: string };
  const seeds: Seed[] = [
    { room: 0, date: shiftDate(today, 1), time: "19:00", duration: 120, status: "CONFIRMED", customer: customer.id, movie: movie("Cô Ba Sài Gòn").id, items: [[0, 2], [6, 1]], note: "Birthday" },
    { room: 3, date: shiftDate(today, 2), time: "14:00", duration: 180, status: "CONFIRMED", customer: customer.id, movie: movie("Interstellar").id },
    { room: 1, date: today, startAt: addMinutes(roundedNow, -60), duration: 120, status: "IN_USE", customer: customer2.id, movie: movie("Hai Phượng").id, items: [[1, 2]], orderStatus: "PREPARING" },
    { room: 6, date: shiftDate(today, -1), time: "19:30", duration: 120, status: "COMPLETED", pay: "PAID", customer: customer.id, movie: movie("Toy Story").id, items: [[6, 1], [0, 2]], orderStatus: "SERVED" },
    { room: 2, date: shiftDate(today, -1), time: "14:00", duration: 120, status: "CANCELLED", customer: customer2.id },
    { room: 4, date: shiftDate(today, -1), time: "16:30", duration: 120, status: "NO_SHOW", customer: customer2.id },
    { room: 7, date: shiftDate(today, -2), time: "20:00", duration: 120, status: "COMPLETED", customer: customer2.id, items: [[8, 1]], orderStatus: "SERVED", endedEarly: "Customer left before paying" },
    { room: 5, date: today, startAt: addMinutes(roundedNow, -30), duration: 120, status: "IN_USE", customer: customer.id, movie: movie("Up").id, adjustment: { kind: "REDUCE", amount: 50_000, reason: "Projector unavailable for 20 minutes" } },
    { room: 3, date: shiftDate(today, -3), time: "10:00", duration: 120, status: "COMPLETED", pay: "WAIVED", customer: customer2.id, adjustment: { kind: "WAIVE", reason: "Full power outage", status: "APPROVED" } },
    { room: 2, date: today, startAt: addMinutes(roundedNow, -150), duration: 120, status: "CONFIRMED", customer: customer2.id, note: "Overdue and awaiting action (EX06)" },
  ];

  for (const s of seeds) {
    const room = rooms[s.room]!;
    const startAt = s.startAt ?? vnToDate(s.date, s.time!);
    const win = computeWindow(startAt, s.duration);
    const mv = s.movie ? movies.find((m) => m.id === s.movie)! : null;
    const booking = await prisma.booking.create({
      data: {
        code: generateBookingCode("CN", startAt),
        customerId: s.customer ?? null,
        source: "ONLINE",
        roomId: room.id,
        contactName: s.customer === customer.id ? customer.name : customer2.name,
        contactPhone: s.customer === customer.id ? customer.phone : customer2.phone,
        guestCount: Math.min(2, room.capacity),
        startAt: win.startAt,
        endAt: win.endAt,
        occupiedUntil: win.occupiedUntil,
        status: s.status,
        paymentStatus: s.pay ?? "UNPAID",
        roomRateSnapshot: room.hourlyPriceVnd,
        roomTotal: roomTotal(room.hourlyPriceVnd, s.duration),
        checkedInAt: s.status === "IN_USE" || (s.status === "COMPLETED" && !s.endedEarly) ? win.startAt : null,
        endedAt: s.status === "COMPLETED" ? (s.endedEarly ? addMinutes(win.startAt, 40) : win.endAt) : null,
        endedEarlyReason: s.endedEarly ?? null,
        movieId: mv?.id ?? null,
        movieTitleSnapshot: mv?.title ?? null,
        movieDurationSnapshot: mv?.durationMinutes ?? null,
        preparationStatus: mv ? (s.status === "CONFIRMED" ? "PENDING" : "READY") : "NOT_SELECTED",
        note: s.note ?? null,
        history: { create: { field: "status", newValue: s.status, actorId: staff.id, reason: "seed" } },
        ...(s.items && {
          foodOrders: {
            create: {
              status: s.orderStatus ?? "PENDING",
              createdById: staff.id,
              items: { create: s.items.map(([mi, qty]) => ({ menuItemId: menu[mi]!.id, itemNameSnapshot: menu[mi]!.name, unitPriceVnd: menu[mi]!.priceVnd, quantity: qty })) },
            },
          },
        }),
      },
      include: { foodOrders: { include: { items: true } } },
    });

    if (s.adjustment) {
      const itemsTotal = booking.foodOrders.filter((o) => o.status !== "CANCELLED").reduce((sum, o) => sum + o.items.reduce((x, i) => x + i.unitPriceVnd * i.quantity, 0), 0);
      const original = booking.roomTotal + itemsTotal;
      await prisma.adjustment.create({
        data: {
          bookingId: booking.id,
          kind: s.adjustment.kind,
          amountVnd: s.adjustment.kind === "WAIVE" ? original : s.adjustment.amount!,
          reason: s.adjustment.reason,
          status: s.adjustment.status ?? "PENDING_APPROVAL",
          createdById: staff.id,
          approvedById: s.adjustment.status === "APPROVED" ? manager.id : null,
          decidedAt: s.adjustment.status === "APPROVED" ? new Date() : null,
        },
      });
    }
    if (s.pay === "PAID") {
      const itemsTotal = booking.foodOrders.reduce((sum, o) => sum + o.items.reduce((x, i) => x + i.unitPriceVnd * i.quantity, 0), 0);
      const original = booking.roomTotal + itemsTotal;
      await prisma.payment.create({
        data: { bookingId: booking.id, originalTotalVnd: original, adjustmentVnd: 0, amountVnd: original, method: "CASH", recordedById: staff.id, idempotencyKey: `seed-${booking.id}`, paidAt: booking.endAt },
      });
    }
  }

  console.log(`Xong. Đăng nhập demo: manager@demo.local / ${PASSWORDS.manager} | staff@demo.local / ${PASSWORDS.staff} | khach@demo.local / ${PASSWORDS.customer}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
