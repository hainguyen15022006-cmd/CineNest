-- Migration 0001: toàn bộ bảng theo schema.prisma (đặc tả v1.7, trang 11).
-- Viết theo đúng quy ước SQL mà Prisma Migrate sinh ra để tránh drift.

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('CUSTOMER', 'STAFF', 'MANAGER');
CREATE TYPE "BookingStatus" AS ENUM ('CONFIRMED', 'IN_USE', 'COMPLETED', 'CANCELLED', 'NO_SHOW');
CREATE TYPE "PaymentStatus" AS ENUM ('UNPAID', 'PAID', 'WAIVED');
CREATE TYPE "BookingSource" AS ENUM ('ONLINE', 'COUNTER');
CREATE TYPE "PreparationStatus" AS ENUM ('NOT_SELECTED', 'PENDING', 'READY', 'UNAVAILABLE');
CREATE TYPE "FoodOrderStatus" AS ENUM ('PENDING', 'PREPARING', 'SERVED', 'CANCELLED');
CREATE TYPE "MenuCategory" AS ENUM ('DRINK', 'SNACK', 'FOOD');
CREATE TYPE "AdjustmentKind" AS ENUM ('REDUCE', 'WAIVE');
CREATE TYPE "AdjustmentStatus" AS ENUM ('PENDING_APPROVAL', 'APPROVED', 'REJECTED');
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'TRANSFER');
CREATE TYPE "IdempotencyStatus" AS ENUM ('IN_PROGRESS', 'DONE');

-- CreateTable
CREATE TABLE "user" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'CUSTOMER',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

-- CreateTable (schema mặc định của connect-pg-simple; cột user_id thêm ở migration 0002)
CREATE TABLE "session" (
    "sid" TEXT NOT NULL,
    "sess" JSON NOT NULL,
    "expire" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "session_pkey" PRIMARY KEY ("sid")
);

-- CreateTable
CREATE TABLE "login_attempt" (
    "id" SERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "ip" TEXT NOT NULL,
    "succeeded" BOOLEAN NOT NULL,
    "attempted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "login_attempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "room" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "amenities" JSONB NOT NULL DEFAULT '[]',
    "hourly_price_vnd" INTEGER NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "room_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "room_image" (
    "id" SERIAL NOT NULL,
    "room_id" INTEGER NOT NULL,
    "url" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "room_image_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "movie" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "genre" TEXT NOT NULL,
    "duration_minutes" INTEGER NOT NULL,
    "age_label" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "poster_url" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "movie_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "booking" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "customer_id" INTEGER,
    "created_by" INTEGER,
    "source" "BookingSource" NOT NULL DEFAULT 'ONLINE',
    "room_id" INTEGER NOT NULL,
    "contact_name" TEXT NOT NULL,
    "contact_phone" TEXT NOT NULL,
    "guest_count" INTEGER NOT NULL,
    "start_at" TIMESTAMPTZ(6) NOT NULL,
    "end_at" TIMESTAMPTZ(6) NOT NULL,
    "occupied_until" TIMESTAMPTZ(6) NOT NULL,
    "status" "BookingStatus" NOT NULL DEFAULT 'CONFIRMED',
    "payment_status" "PaymentStatus" NOT NULL DEFAULT 'UNPAID',
    "room_rate_snapshot" INTEGER NOT NULL,
    "room_total" INTEGER NOT NULL,
    "ended_early_reason" TEXT,
    "ended_at" TIMESTAMPTZ(6),
    "checked_in_at" TIMESTAMPTZ(6),
    "movie_id" INTEGER,
    "movie_title_snapshot" TEXT,
    "movie_duration_snapshot" INTEGER,
    "preparation_status" "PreparationStatus" NOT NULL DEFAULT 'NOT_SELECTED',
    "movie_version" INTEGER NOT NULL DEFAULT 0,
    "note" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "booking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "menu_item" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "category" "MenuCategory" NOT NULL,
    "image_url" TEXT,
    "price_vnd" INTEGER NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "menu_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "food_order" (
    "id" SERIAL NOT NULL,
    "booking_id" INTEGER NOT NULL,
    "status" "FoodOrderStatus" NOT NULL DEFAULT 'PENDING',
    "created_by" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "food_order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "food_order_item" (
    "id" SERIAL NOT NULL,
    "order_id" INTEGER NOT NULL,
    "menu_item_id" INTEGER NOT NULL,
    "item_name_snapshot" TEXT NOT NULL,
    "unit_price_vnd" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,

    CONSTRAINT "food_order_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "adjustment" (
    "id" SERIAL NOT NULL,
    "booking_id" INTEGER NOT NULL,
    "amount_vnd" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "kind" "AdjustmentKind" NOT NULL,
    "status" "AdjustmentStatus" NOT NULL DEFAULT 'PENDING_APPROVAL',
    "created_by" INTEGER NOT NULL,
    "approved_by" INTEGER,
    "decided_at" TIMESTAMPTZ(6),
    "is_current" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "adjustment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment" (
    "id" SERIAL NOT NULL,
    "booking_id" INTEGER NOT NULL,
    "original_total_vnd" INTEGER NOT NULL,
    "adjustment_vnd" INTEGER NOT NULL DEFAULT 0,
    "amount_vnd" INTEGER NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "paid_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recorded_by" INTEGER NOT NULL,
    "idempotency_key" TEXT NOT NULL,

    CONSTRAINT "payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "booking_status_history" (
    "id" SERIAL NOT NULL,
    "booking_id" INTEGER NOT NULL,
    "field" TEXT NOT NULL,
    "old_value" TEXT,
    "new_value" TEXT NOT NULL,
    "actor_id" INTEGER,
    "changed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reason" TEXT,

    CONSTRAINT "booking_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "idempotency_request" (
    "id" SERIAL NOT NULL,
    "actor_id" INTEGER NOT NULL,
    "key" TEXT NOT NULL,
    "request_hash" TEXT NOT NULL,
    "status" "IdempotencyStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "response_code" INTEGER,
    "response_body" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "idempotency_request_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_email_key" ON "user"("email");
CREATE INDEX "IDX_session_expire" ON "session"("expire");
CREATE INDEX "login_attempt_email_attempted_at_idx" ON "login_attempt"("email", "attempted_at");
CREATE INDEX "login_attempt_ip_attempted_at_idx" ON "login_attempt"("ip", "attempted_at");
CREATE INDEX "room_image_room_id_sort_order_idx" ON "room_image"("room_id", "sort_order");
CREATE UNIQUE INDEX "booking_code_key" ON "booking"("code");
CREATE INDEX "booking_room_id_start_at_idx" ON "booking"("room_id", "start_at");
CREATE INDEX "booking_customer_id_start_at_idx" ON "booking"("customer_id", "start_at" DESC);
CREATE INDEX "booking_status_start_at_idx" ON "booking"("status", "start_at");
CREATE INDEX "food_order_booking_id_idx" ON "food_order"("booking_id");
CREATE INDEX "food_order_status_idx" ON "food_order"("status");
CREATE INDEX "food_order_item_order_id_idx" ON "food_order_item"("order_id");
CREATE INDEX "adjustment_status_idx" ON "adjustment"("status");
CREATE INDEX "adjustment_booking_id_idx" ON "adjustment"("booking_id");
CREATE UNIQUE INDEX "payment_booking_id_key" ON "payment"("booking_id");
CREATE UNIQUE INDEX "payment_idempotency_key_key" ON "payment"("idempotency_key");
CREATE INDEX "payment_paid_at_idx" ON "payment"("paid_at");
CREATE INDEX "booking_status_history_booking_id_changed_at_idx" ON "booking_status_history"("booking_id", "changed_at");
CREATE UNIQUE INDEX "idempotency_request_actor_id_key_key" ON "idempotency_request"("actor_id", "key");

-- AddForeignKey
ALTER TABLE "room_image" ADD CONSTRAINT "room_image_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "room"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "booking" ADD CONSTRAINT "booking_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "booking" ADD CONSTRAINT "booking_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "booking" ADD CONSTRAINT "booking_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "room"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "booking" ADD CONSTRAINT "booking_movie_id_fkey" FOREIGN KEY ("movie_id") REFERENCES "movie"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "food_order" ADD CONSTRAINT "food_order_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "food_order" ADD CONSTRAINT "food_order_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "food_order_item" ADD CONSTRAINT "food_order_item_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "food_order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "food_order_item" ADD CONSTRAINT "food_order_item_menu_item_id_fkey" FOREIGN KEY ("menu_item_id") REFERENCES "menu_item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "adjustment" ADD CONSTRAINT "adjustment_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "adjustment" ADD CONSTRAINT "adjustment_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "adjustment" ADD CONSTRAINT "adjustment_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "payment" ADD CONSTRAINT "payment_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payment" ADD CONSTRAINT "payment_recorded_by_fkey" FOREIGN KEY ("recorded_by") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "booking_status_history" ADD CONSTRAINT "booking_status_history_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "booking_status_history" ADD CONSTRAINT "booking_status_history_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "idempotency_request" ADD CONSTRAINT "idempotency_request_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
