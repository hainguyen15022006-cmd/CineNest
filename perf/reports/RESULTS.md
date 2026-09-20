# Kết quả hiệu năng CineNest

Ngày đo: 18/09/2026 (Asia/Ho_Chi_Minh).

## Môi trường

| Thành phần | Cấu hình |
|---|---|
| Máy | Intel Core i5-1145G7, 4 nhân / 8 luồng, RAM 15,4 GB |
| Hệ điều hành | Windows 11 Pro 10.0.26200 |
| Node.js | 24.20.0 |
| PostgreSQL | 16.15, Docker `postgres:16` |
| Python / Locust | Python 3.12.14 / Locust 2.46.6 |
| Dữ liệu | 10.000 booking lịch sử: 6.500 COMPLETED, 2.500 CANCELLED, 1.000 NO_SHOW |
| Cách đo | Backend và Locust cùng máy, loopback `localhost`; CSV dùng `--csv-full-history` |

## Kết quả

| Bài đo | Tải | Request chính | Số request | p95 | Error rate | Kết quả nghiệp vụ |
|---|---:|---|---:|---:|---:|---|
| PF01 | 50 users, ramp 10/s, 5 phút | `GET /rooms/availability` | 4.233 | 27 ms | 0% | Danh sách phòng trả đúng trên bảng 10.000 booking |
| PF02 | 200 users tranh cùng slot | `POST /bookings` | 200 | 1.500 ms | 0% | 1×201, 199×409; DB có đúng 1 booking giữ chỗ |
| PF03 | 0→100→200→300, giữ 300, hạ 50; 8 phút | Toàn hành trình | 46.331 | 110 ms tổng hợp | 0% | 552×201, 4×409, 1.154×422 hợp lệ; 0 phản hồi bất thường |

Chi tiết PF03 theo endpoint:

| Endpoint | Request | Median | p95 | Max |
|---|---:|---:|---:|---:|
| `GET /rooms/availability` | 27.084 | 15 ms | 130 ms | 848 ms |
| `GET /rooms/:id` | 17.237 | 12 ms | 84 ms | 844 ms |
| `POST /bookings` | 1.710 | 29 ms | 100 ms | 1.003 ms |
| `POST /auth/login` | 300 | 560 ms | 870 ms | 956 ms |

PF02 đo đăng nhập riêng: 200 lần đăng nhập đồng thời có p95 khoảng 16 giây do bcrypt dùng CPU; thao tác tranh chấp booking có p95 1,5 giây. Các phản hồi 409 là kết quả đúng của bài đo và được đánh dấu thành công trong Locust.

## Lighthouse trước / sau

Trang đo: `frontend/index.html`, Chrome headless, mobile preset mặc định.

| Chỉ số | Trước | Sau |
|---|---:|---:|
| Performance | 72 | 76 |
| Accessibility | 100 | 100 |
| Best Practices | 96 | 96 |
| SEO | 91 | 100 |
| FCP | 2,2 giây | 2,2 giây |
| LCP | 3,7 giây | 3,7 giây |
| CLS | 0,29 | 0,226 |

Thay đổi đã đo lại: tải layout và danh sách phòng song song, khai báo kích thước/độ ưu tiên ảnh, preconnect máy chủ ảnh, giữ trước chiều cao header, thêm meta description và favicon nội tuyến. Best Practices còn 96 vì trang công khai gọi `GET /api/me` và nhận 401 đúng hợp đồng khi chưa đăng nhập; không đổi contract chỉ để làm điểm Lighthouse đẹp hơn.

## Bằng chứng và khả năng tái lập

- `pf01-before_stats.csv`, `pf02_stats.csv`, `pf03_stats.csv` và các file history/failure tương ứng được sinh cục bộ trong thư mục này.
- `lighthouse-before.report.json` và `lighthouse-after.report.json` là báo cáo máy đọc được giữ trong Git; bản HTML tương ứng được sinh cục bộ.
- Lần PF01 đầu tiên bị dừng vì kịch bản chọn cả ngày hiện tại, tạo 422 `TOO_SOON` giả khi chạy buổi tối. Sau khi giới hạn ngày từ +1 đến +13, lượt đo chính thức có 0 lỗi.
- Lighthouse CLI trên máy Windows đã ghi báo cáo đầy đủ nhưng đôi khi trả cảnh báo `EPERM` khi dọn thư mục profile Chrome tạm; dữ liệu JSON/HTML vẫn hoàn chỉnh.
