# Hợp đồng API (đặc tả v1.7, trang 13) – bản đang chạy trong bộ nền

Tiền tố `/api`. Phản hồi: thành công `{ ok: true, data }`, lỗi `{ ok: false, error: { code, message, details? } }`.
Mã HTTP: 401 chưa đăng nhập / phiên hết hiệu lực, 403 sai vai trò, 404 không thấy, 409 xung đột (trùng phòng, trạng thái, thao tác lặp), 422 dữ liệu sai hoặc vi phạm quy tắc, 429 quá giới hạn thử đăng nhập.
Header `Idempotency-Key` (UUID) **bắt buộc** với `POST /bookings`, `POST /staff/bookings`, `POST /staff/bookings/:id/checkout`; gửi lại cùng khóa + cùng nội dung trả lại kết quả cũ (header `Idempotent-Replayed: true`).

Thời gian: gửi lên `date` (YYYY-MM-DD) + `startTime` (HH:mm) theo giờ Việt Nam; trả về ISO UTC (`startAt`, `endAt`, `occupiedUntil`). Tiền: số nguyên VND.

| Phương thức / đường dẫn | Quyền | Chủ module | Ghi chú |
|---|---|---|---|
| `POST /auth/register` `{name,email,phone,password}` | công khai | Dương | luôn CUSTOMER; tự đăng nhập sau đăng ký |
| `POST /auth/login` `{email,password}` | công khai | Dương | 5 lần sai/10 phút theo email hoặc IP → 429 |
| `POST /auth/logout` · `GET /me` | đăng nhập | Dương | `/me` trả 401 nếu tài khoản bị khóa |
| `GET /rooms` · `GET /rooms/:id` | công khai | Chúc | chỉ phòng đang phục vụ |
| `GET /rooms/availability?date&startTime&duration&guests` | công khai | Chúc | API đo ở PF01; trả `{ window, rooms[] }` với `roomTotalVnd` |
| `GET /movies?q&genre&maxMinutes&page&limit` · `GET /movies/genres` · `GET /movies/:id` | công khai | Thành Lê | chỉ phim ACTIVE; trả `{ items, total, page, limit }` (mặc định 24/trang, tối đa 100); `q` tìm theo tên không phân biệt hoa thường; `maxMinutes` = gói − 10 (MOV03); `/genres` → `[{ genre, count }]` |
| `GET /menu-items` | công khai | Sơn | chỉ món đang bán |
| `POST /bookings` `{roomId,date,startTime,duration,guests,contactName,contactPhone,movieId?,items?[],note?,expectedTotalVnd?}` | CUSTOMER | Hải Anh | 201; 409 `ROOM_TAKEN` (kèm `details.suggest`), 409 `PRICE_CHANGED`, 422 `BOOKING_LIMIT`/`OVER_CAPACITY`/`TOO_SOON`/… |
| `GET /me/bookings?scope=upcoming|past` | đăng nhập | Hải Anh | |
| `GET /bookings/:idOrCode` | chủ sở hữu / nhân viên | Hải Anh | gồm món, điều chỉnh hiện hành, payment, lịch sử |
| `POST /bookings/:id/cancel` `{reason?}` | chủ sở hữu / nhân viên | Hải Anh | khách: còn ≥ 2 giờ; nhân viên: bắt buộc lý do |
| `PATCH /bookings/:id/movie` `{movieId|null}` | chủ sở hữu / nhân viên | Thành Lê | MOV05; tại quán so với thời gian còn lại |
| `GET /staff/bookings?date` | STAFF | Hải Anh | lịch ngày theo phòng |
| `GET /staff/bookings/search?q` | STAFF | Hải Anh | tìm tối đa 20 booking theo mã hoặc số điện thoại |
| `GET /staff/bookings/overdue` | STAFF | Hải Anh | EX06 |
| `POST /staff/bookings` (cùng body với `/bookings`) | STAFF | Hải Anh | khách tại quầy, không cần báo trước 30 phút |
| `POST /staff/bookings/:id/check-in` · `/no-show` `{reason?}` · `/mark-used` `{note}` | STAFF | Hải Anh | |
| `GET /staff/preparation?date` · `PATCH /staff/bookings/:id/preparation` `{status,expectedVersion}` | STAFF | Thành Lê | 409 `MOVIE_CHANGED` khi version lệch |
| `GET /staff/orders?status` · `POST /staff/bookings/:id/orders` `{items[]}` · `PATCH /staff/orders/:id/status` `{status}` | STAFF | Sơn | chỉ thêm món khi IN_USE và UNPAID |
| `GET /staff/bookings/:id/invoice` | STAFF | Công Thành | Tổng gốc, điều chỉnh (chỉ APPROVED), Số phải trả, `canCollect`, `blockers[]` |
| `POST /staff/bookings/:id/checkout` `{method}` | STAFF | Công Thành | 409 `CANNOT_COLLECT` (details.blockers), 409 `ALREADY_PAID` |
| `POST /staff/bookings/:id/end-early` `{reason}` | STAFF | Công Thành | EX01 + EX02 |
| `POST /staff/bookings/:id/adjustments` `{kind,amountVnd?,reason}` | STAFF | Công Thành | chờ duyệt; WAIVE tự lấy Tổng gốc |
| `GET /admin/staff` · `POST /admin/staff` · `PATCH /admin/staff/:id/active` `{isActive}` | MANAGER | Dương | khóa ⇒ xóa mọi phiên |
| `GET/POST /admin/rooms` · `PATCH /admin/rooms/:id` | MANAGER | Chúc | BR06, BR08 |
| `GET/POST /admin/movies` · `PATCH /admin/movies/:id` | MANAGER | Thành Lê | MOV07; GET cùng tham số `q/genre/page/limit`, gồm cả phim ngừng phục vụ |
| `GET/POST /admin/menu-items` · `PATCH /admin/menu-items/:id` | MANAGER | Sơn | |
| `GET /admin/adjustments` · `POST /admin/adjustments/:id/approve|reject` `{note?}` | MANAGER | Công Thành | WAIVE duyệt ⇒ `payment_status = WAIVED` |
| `GET /admin/reports/bookings|revenue|room-hours|unpaid-waived?from&to` | MANAGER | Công Thành | nhóm theo ngày giờ VN |

Thêm endpoint mới: cập nhật bảng này trong cùng pull request.
