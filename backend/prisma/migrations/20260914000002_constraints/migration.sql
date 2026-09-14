-- Migration 0002: ràng buộc Prisma không biểu diễn được (đặc tả v1.7, Phụ lục A, trang 12).
-- Đây là "lớp 2" chống trùng phòng: đúng đắn được bảo đảm ở tầng cơ sở dữ liệu
-- ngay cả khi mã ứng dụng có lỗi hoặc có nhiều tiến trình máy chủ.

CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Thời gian: start < end <= occupied_until (BR04)
ALTER TABLE "booking" ADD CONSTRAINT "booking_time_check"
  CHECK ("start_at" < "end_at" AND "end_at" <= "occupied_until");

-- Hai booking cùng phòng không được giao nhau trên khoảng chiếm dụng nửa mở [start_at, occupied_until).
-- CANCELLED và NO_SHOW không giữ chỗ nên nằm ngoài mệnh đề WHERE.
-- Lỗi vi phạm: SQLSTATE 23P01 (exclusion_violation) -> ứng dụng ánh xạ thành 409.
ALTER TABLE "booking" ADD CONSTRAINT "booking_no_overlap"
  EXCLUDE USING gist (
    "room_id" WITH =,
    tstzrange("start_at", "occupied_until", '[)') WITH &&
  )
  WHERE ("status" IN ('CONFIRMED', 'IN_USE', 'COMPLETED'));

-- Số lượng và tiền
ALTER TABLE "booking" ADD CONSTRAINT "booking_guest_count_check" CHECK ("guest_count" >= 1);
ALTER TABLE "booking" ADD CONSTRAINT "booking_money_check" CHECK ("room_rate_snapshot" >= 0 AND "room_total" >= 0);
ALTER TABLE "room" ADD CONSTRAINT "room_capacity_check" CHECK ("capacity" >= 1);
ALTER TABLE "room" ADD CONSTRAINT "room_price_check" CHECK ("hourly_price_vnd" >= 0);
ALTER TABLE "menu_item" ADD CONSTRAINT "menu_item_price_check" CHECK ("price_vnd" >= 0);
ALTER TABLE "food_order_item" ADD CONSTRAINT "food_order_item_quantity_check" CHECK ("quantity" BETWEEN 1 AND 20);
ALTER TABLE "food_order_item" ADD CONSTRAINT "food_order_item_price_check" CHECK ("unit_price_vnd" >= 0);
ALTER TABLE "adjustment" ADD CONSTRAINT "adjustment_amount_check" CHECK ("amount_vnd" > 0);
ALTER TABLE "payment" ADD CONSTRAINT "payment_money_check"
  CHECK ("original_total_vnd" >= 0 AND "adjustment_vnd" >= 0 AND "amount_vnd" >= 0
         AND "amount_vnd" = "original_total_vnd" - "adjustment_vnd");

-- Mỗi booking chỉ có một điều chỉnh đang hiệu lực
CREATE UNIQUE INDEX "adjustment_one_current" ON "adjustment" ("booking_id") WHERE ("is_current");

-- Bảng session: cột sinh user_id từ sess->>'userId' để "khóa tài khoản xóa mọi phiên"
-- (DELETE FROM "session" WHERE "user_id" = $1). Ứng dụng KHÔNG BAO GIỜ ghi cột này.
ALTER TABLE "session" ADD COLUMN "user_id" INTEGER
  GENERATED ALWAYS AS (NULLIF("sess" ->> 'userId', '')::integer) STORED;
CREATE INDEX "session_user_id_idx" ON "session" ("user_id");
