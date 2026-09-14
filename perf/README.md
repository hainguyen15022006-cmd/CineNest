# Đo tải (Thành Lê – người 4) – đặc tả trang 15, Phụ lục B

1. `pip install -r perf/requirements.txt`
2. Seed có tài khoản perf: `cd backend && SEED_PERF=1 npm run db:seed` (Windows PowerShell: `$env:SEED_PERF="1"; npm run db:seed`)
3. Backend chạy ở cổng 3000 (`npm run dev` hoặc `npm start` với NODE_ENV=production để đo).
4. Chạy PF01/PF02/PF03 theo lệnh ở đầu `locustfile.py`. Kết quả CSV trong `perf/reports/`.
5. Sau PF02, kiểm tra trong DB: `SELECT count(*) FROM booking WHERE room_id = 1 AND status IN ('CONFIRMED','IN_USE','COMPLETED') AND start_at = '<PF_DATE> 19:00+07';` → phải bằng 1.
6. Sinh 10.000 booking lịch sử 12 tháng cho PF01 bằng `python perf/generate_history.py` (65% COMPLETED / 25% CANCELLED / 10% NO_SHOW, tối đa 5 lượt COMPLETED/phòng/ngày). Script có seed cố định, tôn trọng EXCLUDE và chỉ thay dữ liệu mã `PFH-`. Khôi phục DB từ seed trước mỗi lần đo.

Nguyên tắc: 409 trong PF02 là kết quả đúng; 422 chỉ chấp nhận ở PF03; ghi rõ máy, phiên bản Node/PostgreSQL, đo qua LAN; đo trước/sau tối ưu cùng điều kiện; không cố tạo bản đầu chậm để làm đẹp số liệu.
