"""PF03: 0->100->200->300 trong 3 phút, giữ 300 trong 3 phút, giảm về 50 trong 2 phút. Chỉ nạp cùng locustfile khi chạy PF03."""
from locust import LoadTestShape


class RampShape(LoadTestShape):
    stages = [(60, 100, 5), (120, 200, 5), (180, 300, 5), (360, 300, 5), (480, 50, 10)]  # (giây, users, spawn/giây)

    def tick(self):
        t = self.get_run_time()
        for limit, users, rate in self.stages:
            if t < limit:
                return (users, rate)
        return None
