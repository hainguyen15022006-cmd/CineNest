/**
 * Module 6 – Báo cáo (Công Thành). Đặc tả trang 10 "Báo cáo bắt buộc"; kiểm thử T12.
 * Tất cả nhóm theo ngày giờ Việt Nam (AT TIME ZONE 'Asia/Ho_Chi_Minh').
 */
import { pool } from "../../core/prisma.js";
import { VN_TZ } from "../../core/time.js";

type Range = { from: Date; to: Date }; // [from, to)

/** Số booking theo ngày BẮT ĐẦU và trạng thái sử dụng (không trộn với ngày tạo) */
export async function bookingsByDay({ from, to }: Range) {
  const { rows } = await pool.query(
    `SELECT (b."start_at" AT TIME ZONE $3)::date AS day, b."status"::text AS status, COUNT(*)::int AS count
     FROM "booking" b WHERE b."start_at" >= $1 AND b."start_at" < $2
     GROUP BY 1, 2 ORDER BY 1, 2`,
    [from, to, VN_TZ],
  );
  return rows;
}

/** Doanh thu ĐÃ THU theo ngày Payment.paid_at; tổng + chi tiết để đối chiếu */
export async function revenue({ from, to }: Range) {
  const { rows } = await pool.query(
    `SELECT (p."paid_at" AT TIME ZONE $3)::date AS day, COUNT(*)::int AS payments, SUM(p."amount_vnd")::bigint AS amount_vnd
     FROM "payment" p WHERE p."paid_at" >= $1 AND p."paid_at" < $2
     GROUP BY 1 ORDER BY 1`,
    [from, to, VN_TZ],
  );
  const details = await pool.query(
    `SELECT p."paid_at", b."code", p."original_total_vnd", p."adjustment_vnd", p."amount_vnd", p."method"::text AS method
     FROM "payment" p JOIN "booking" b ON b."id" = p."booking_id"
     WHERE p."paid_at" >= $1 AND p."paid_at" < $2 ORDER BY p."paid_at"`,
    [from, to],
  );
  const total = rows.reduce((s, r) => s + Number(r.amount_vnd), 0);
  return { totalVnd: total, byDay: rows.map((r) => ({ ...r, amount_vnd: Number(r.amount_vnd) })), details: details.rows };
}

/** Giờ phòng đã sử dụng: tổng thời lượng đặt của booking COMPLETED, nhóm theo ngày bắt đầu */
export async function roomHours({ from, to }: Range) {
  const { rows } = await pool.query(
    `SELECT (b."start_at" AT TIME ZONE $3)::date AS day,
            ROUND(SUM(EXTRACT(EPOCH FROM (b."end_at" - b."start_at")) / 3600)::numeric, 1)::float AS hours
     FROM "booking" b WHERE b."status" = 'COMPLETED' AND b."start_at" >= $1 AND b."start_at" < $2
     GROUP BY 1 ORDER BY 1`,
    [from, to, VN_TZ],
  );
  return rows;
}

/** Chưa thu và miễn: COMPLETED còn UNPAID, WAIVED, và điều chỉnh theo trạng thái duyệt */
export async function unpaidAndWaived({ from, to }: Range) {
  const { rows } = await pool.query(
    `SELECT b."id", b."code", b."start_at", b."status"::text AS status, b."payment_status"::text AS payment_status,
            b."room_total", b."ended_early_reason",
            a."kind"::text AS adjustment_kind, a."status"::text AS adjustment_status, a."amount_vnd" AS adjustment_vnd, a."reason" AS adjustment_reason,
            u."name" AS adjustment_by
     FROM "booking" b
     LEFT JOIN "adjustment" a ON a."booking_id" = b."id" AND a."is_current"
     LEFT JOIN "user" u ON u."id" = a."created_by"
     WHERE b."start_at" >= $1 AND b."start_at" < $2
       AND ((b."status" = 'COMPLETED' AND b."payment_status" = 'UNPAID') OR b."payment_status" = 'WAIVED' OR a."id" IS NOT NULL)
     ORDER BY b."start_at"`,
    [from, to],
  );
  return rows;
}
