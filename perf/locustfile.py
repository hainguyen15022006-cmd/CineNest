"""
Kịch bản đo tải – Thành Lê (người 4). Đặc tả v1.7 trang 15 và Phụ lục B.
Chạy (từ thư mục gốc dự án, backend đang chạy, đã seed với SEED_PERF=1):
  PF01: locust -f perf/locustfile.py Customer  --headless -u 50  -r 10  -t 5m --tags search  --host http://localhost:3000 --csv perf/reports/pf01
  PF02: locust -f perf/locustfile.py Contender --headless -u 200 -r 200 -t 2m               --host http://localhost:3000 --csv perf/reports/pf02
  PF03: locust -f perf/locustfile.py,perf/ramp.py Customer --headless --tags journey        --host http://localhost:3000 --csv perf/reports/pf03
Mỗi lệnh chỉ định rõ lớp người dùng vì Locust mặc định chạy mọi lớp có trong file.
"""
import os
import random
import uuid
from datetime import date, timedelta

from gevent.event import Event
from locust import HttpUser, task, between, constant, tag, events

ACCOUNTS = [(f"perf{i}@demo.local", "Perf#12345") for i in range(1, 301)]  # 300 tài khoản seed (SEED_PERF=1)
PF_DATE = os.getenv("PF_DATE") or (date.today() + timedelta(days=7)).isoformat()  # trong cửa sổ 14 ngày
TARGET = {"roomId": int(os.getenv("PF_ROOM", "1")), "date": PF_DATE, "startTime": "19:00", "duration": 120}  # phòng/giờ để trống cho PF02
SUMMARY = {"201": 0, "409": 0, "422": 0, "other": 0}
ALL_READY = Event()  # rào chắn cho PF02


def login(client, email, pw):
    client.post("/api/auth/login", json={"email": email, "password": pw}, name="POST /auth/login")


def book(client, payload, name, allow_422):
    """201 và 409 luôn là phản hồi đúng; 422 chỉ đúng khi kịch bản chấp nhận (PF03: quá 3 booking)."""
    headers = {"Idempotency-Key": str(uuid.uuid4())}
    with client.post("/api/bookings", json=payload, headers=headers, name=name, catch_response=True) as r:
        if r.status_code == 201:
            SUMMARY["201"] += 1
            r.success()
        elif r.status_code == 409:  # xung đột nghiệp vụ dự kiến: KHÔNG phải lỗi hệ thống
            SUMMARY["409"] += 1
            r.success()
        elif r.status_code == 422 and allow_422:
            SUMMARY["422"] += 1
            r.success()
        else:  # 5xx, timeout, phản hồi lạ: lỗi hệ thống
            SUMMARY["other"] += 1
            r.failure(f"unexpected {r.status_code}")


class Customer(HttpUser):
    """PF01 (--tags search) và PF03 (--tags journey)."""

    wait_time = between(2, 5)

    def on_start(self):
        login(self.client, *random.choice(ACCOUNTS))

    def _search(self):
        q = {
            "date": (date.today() + timedelta(days=random.randint(0, 13))).isoformat(),
            "startTime": random.choice(["09:00", "11:30", "14:00", "16:30", "19:00", "20:30"]),
            "duration": 120,
            "guests": 2,
        }
        with self.client.get("/api/rooms/availability", params=q, name="GET /rooms/availability", catch_response=True) as r:
            if r.status_code != 200:
                r.failure(f"status {r.status_code}")
                return q, []
            return q, (r.json().get("data") or {}).get("rooms") or []

    @tag("search")
    @task
    def search_rooms(self):
        self._search()

    @tag("journey")
    @task
    def journey(self):
        q, rooms = self._search()
        if not rooms:
            return  # không có phòng trống: dừng lượt này
        room = random.choice(rooms)  # dùng đúng phòng do kết quả tìm trả về
        self.client.get(f"/api/rooms/{room['id']}", name="GET /rooms/:id")
        if random.random() < 0.10:  # 10% lượt kết thúc bằng đặt phòng
            book(self.client, {"roomId": room["id"], **q, "contactName": "Perf", "contactPhone": "0900000000"}, name="POST /bookings", allow_422=True)


class Contender(HttpUser):
    """PF02: mỗi người một tài khoản riêng; đăng nhập xong chờ đủ người rồi cùng gửi một yêu cầu."""

    wait_time = constant(0)
    seq = 0

    def on_start(self):
        Contender.seq += 1
        login(self.client, *ACCOUNTS[Contender.seq % len(ACCOUNTS)])

    @task
    def contend(self):
        ALL_READY.wait()  # rào chắn: chỉ mở khi spawning_complete
        book(self.client, {**TARGET, "guests": 2, "contactName": "Perf", "contactPhone": "0900000000"}, name="POST /bookings (contention)", allow_422=False)
        self.stop(force=True)


@events.spawning_complete.add_listener
def open_barrier(user_count, **kw):
    ALL_READY.set()  # đủ người mới cùng gửi


@events.quitting.add_listener
def print_summary(environment, **kw):
    print("BOOKING RESULTS:", SUMMARY)  # PF02 mong đợi: 201 = 1, 409 = N-1, 422 = 0, other = 0
