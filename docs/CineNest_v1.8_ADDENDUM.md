# CineNest – hiệu chỉnh đặc tả v1.8

Tài liệu này bổ sung cho `DacTa_MovieCafeBookingSystem_v1.7.pdf`. Mọi yêu cầu nghiệp vụ v1.7 được giữ nguyên; các điểm dưới đây thay thế thông tin tổ chức và kỹ thuật tương ứng trong bản v1.7.

## 1. Tên hệ thống

- Tên chính thức: **CineNest**.
- Tên mô tả: **CineNest – Movie Café Booking System**.
- Mã booking: `CN-YYMMDD-XXXX`.
- Repository: `cinenest-booking-system`.

## 2. Trách nhiệm tích hợp

- **Hải Anh (người 3, nhóm trưởng):** quản lý GitHub, review và merge Pull Request, giải quyết xung đột, giữ `main` chạy được và chuẩn bị bản demo.
- **Dương (người 1):** tài khoản, phiên, phân quyền, các tiện ích giao diện dùng chung, CI; kiểm tra mọi đề xuất thay đổi schema.
- Mọi migration được tạo thành file mới. Dương kiểm tra schema; Hải Anh là người merge vào `main`.
- `staff/schedule.*` thuộc Hải Anh cùng module booking và vận hành lịch.

## 3. Ranh giới file để làm song song

- `backend/src/modules/staff/staff.routes.ts` chỉ gắn bốn router con.
- Route nhân viên nằm trong module sở hữu: `bookings.staff.routes.ts`, `movies.staff.routes.ts`, `menu.staff.routes.ts`, `payments.staff.routes.ts`.
- Thành Lê sở hữu `frontend/shared/movie-picker.ts`.
- Sơn sở hữu `frontend/shared/menu-picker.ts`.
- Hải Anh điều phối bốn bước trong `frontend/booking.ts` và chỉ gọi hai widget trên.

## 4. Kho phim The Movies Dataset

- Nguồn: The Movies Dataset trên Kaggle, dữ liệu phim từ TMDB.
- Script `backend/prisma/import-movies.ts` nhập `movies_metadata.csv`, lọc theo thời lượng, lượt đánh giá, poster và mô tả; API luôn phân trang.
- Mỗi phim nhập lưu `source` và `external_id`; cặp này là duy nhất để chạy lại không tạo trùng và không gộp nhầm phim trùng tên.
- Khi nguồn không có phân loại tuổi Việt Nam, nhãn là `NR` (chưa phân loại). Quản lý chỉ đổi nhãn khi có thông tin chính xác.
- File CSV/ZIP gốc không đưa lên GitHub; repository chỉ giữ script và dữ liệu mẫu nhỏ.

## 5. Kiểm thử và hiệu năng

- Vitest + Supertest bao phủ đủ T01–T18, gồm T07, T08 và T13.
- Playwright có một smoke test cho luồng đăng ký → tìm phòng → đặt phòng bốn bước.
- `perf/generate_history.py` sinh 10.000 booking lịch sử với seed cố định cho PF01/PF03.
- Không ghi mục tiêu hiệu năng thành kết quả. Kết quả PF01–PF03 và Lighthouse chỉ được điền sau khi đo thật, kèm cấu hình máy và ngày đo.

## 6. Cập nhật Phụ lục B

API `GET /api/rooms/availability` trả `{ data: { window, rooms } }`. Locust phải lấy danh sách bằng `(response.json().get("data") or {}).get("rooms") or []` như file `perf/locustfile.py` trong repository.
