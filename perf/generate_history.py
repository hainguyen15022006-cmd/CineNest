"""Sinh 10.000 booking lịch sử có seed cố định cho PF01/PF03.

Chạy từ thư mục gốc sau khi `npm run db:seed`:
    python perf/generate_history.py

Script chỉ thay các booking có mã PFH- và giữ nguyên dữ liệu demo.
"""
from __future__ import annotations

import os
import random
import sys
from datetime import datetime, time, timedelta, timezone
from pathlib import Path

import psycopg

if sys.platform == "win32":
    # PowerShell/CI có thể dùng code page cp1252; ép UTF-8 để thông báo tiếng Việt
    # không làm script báo lỗi sau khi đã ghi đủ dữ liệu.
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")

SEED = int(os.getenv("PERF_HISTORY_SEED", "20260914"))
TOTAL = 10_000
COUNTS = {"COMPLETED": 6_500, "CANCELLED": 2_500, "NO_SHOW": 1_000}
VN = timezone(timedelta(hours=7))
SLOTS = [time(9, 0), time(11, 30), time(14, 0), time(16, 30), time(19, 0)]


def database_url() -> str:
    if value := os.getenv("DATABASE_URL"):
        return value
    env_file = Path(__file__).resolve().parents[1] / "backend" / ".env"
    if env_file.exists():
        for line in env_file.read_text(encoding="utf-8").splitlines():
            if line.startswith("DATABASE_URL="):
                return line.split("=", 1)[1].strip().strip('"').strip("'")
    raise SystemExit("Thiếu DATABASE_URL; hãy tạo backend/.env hoặc export biến môi trường này")


def main() -> None:
    rng = random.Random(SEED)
    today = datetime.now(VN).date()
    first_day = today - timedelta(days=365)

    with psycopg.connect(database_url()) as conn:
        with conn.cursor() as cur:
            # Xóa dữ liệu hiệu năng của lần chạy trước trước khi tính các ô giờ trống.
            # Các booking demo/booking thật khác vẫn được giữ nguyên.
            cur.execute('DELETE FROM "booking" WHERE "code" LIKE \'PFH-%\'')
            cur.execute('SELECT id, hourly_price_vnd FROM "room" WHERE is_active ORDER BY id')
            rooms = cur.fetchall()
            if not rooms:
                raise SystemExit("Không có phòng ACTIVE; hãy chạy npm run db:seed trước")

            cur.execute(
                '''SELECT "room_id", "start_at", "occupied_until" FROM "booking"
                   WHERE "status" IN ('CONFIRMED', 'IN_USE', 'COMPLETED')'''
            )
            reserved: dict[int, list[tuple[datetime, datetime]]] = {}
            for room_id, start_at, occupied_until in cur.fetchall():
                reserved.setdefault(room_id, []).append((start_at, occupied_until))

            def available(day, room_id: int, slot: time) -> bool:
                start = datetime.combine(day, slot, VN)
                occupied_until = start + timedelta(minutes=150)
                return all(
                    occupied_until <= existing_start or start >= existing_end
                    for existing_start, existing_end in reserved.get(room_id, [])
                )

            completed_slots = [
                (first_day + timedelta(days=day), room_id, price, slot)
                for day in range(365)
                for room_id, price in rooms
                for slot in SLOTS
                if available(first_day + timedelta(days=day), room_id, slot)
            ]
            rng.shuffle(completed_slots)
            if len(completed_slots) < COUNTS["COMPLETED"]:
                raise SystemExit("Không đủ phòng/ngày để tạo 6.500 booking COMPLETED không trùng")

            rows: list[tuple[object, ...]] = []

            def append_row(index: int, status: str, day, room_id: int, price: int, slot: time) -> None:
                start = datetime.combine(day, slot, VN)
                end = start + timedelta(minutes=120)
                occupied_until = end + timedelta(minutes=30)
                rows.append((
                    f"PFH-{index:05d}", room_id, "Khách hiệu năng", "0900000000", 2,
                    start, end, occupied_until, status, price, price * 2, start, start,
                ))

            index = 1
            for day, room_id, price, slot in completed_slots[: COUNTS["COMPLETED"]]:
                append_row(index, "COMPLETED", day, room_id, price, slot)
                index += 1

            for status in ("CANCELLED", "NO_SHOW"):
                for _ in range(COUNTS[status]):
                    room_id, price = rng.choice(rooms)
                    day = first_day + timedelta(days=rng.randrange(365))
                    append_row(index, status, day, room_id, price, rng.choice(SLOTS))
                    index += 1

            rng.shuffle(rows)
            cur.executemany(
                '''INSERT INTO "booking"
                   ("code", "room_id", "contact_name", "contact_phone", "guest_count",
                    "start_at", "end_at", "occupied_until", "status",
                    "room_rate_snapshot", "room_total", "created_at", "updated_at")
                   VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)''',
                rows,
            )
            cur.execute(
                '''SELECT status, count(*) FROM "booking"
                   WHERE code LIKE 'PFH-%' GROUP BY status ORDER BY status'''
            )
            result = dict(cur.fetchall())
        conn.commit()

    if sum(result.values()) != TOTAL or any(result.get(k) != v for k, v in COUNTS.items()):
        raise SystemExit(f"Số liệu sau khi sinh không đúng: {result}")
    print(f"Đã sinh {TOTAL:,} booking với seed {SEED}: {result}")


if __name__ == "__main__":
    main()
