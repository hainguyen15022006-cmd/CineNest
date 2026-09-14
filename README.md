# CineNest – bộ nền dùng chung

Đồ án cuối kỳ Phát triển web · nhóm 6 người · theo **đặc tả v1.7** (`docs/DacTa_MovieCafeBookingSystem_v1.7.pdf`).
Bản cập nhật tên, phân công và ranh giới làm song song: `output/pdf/CineNest_v1.8_ADDENDUM.pdf` (bản soạn thảo: `docs/CineNest_v1.8_ADDENDUM.md`).
Phân công chi tiết cho từng thành viên và lịch hoàn thành đúng 7 ngày: `output/pdf/CineNest_PhanCongCongViec_7Ngay.pdf`.
Bộ nền này đã chạy được từ đầu đến cuối (tìm phòng → đặt → phim/món → check-in → thu tiền → báo cáo) với dữ liệu mẫu,
có 25 kiểm thử tự động (T01–T18 lõi + danh mục phim) đang xanh. Mỗi người mở module của mình trên khung này, không dựng lại từ đầu.

## 1. Cài đặt (ngày 1, mỗi máy ~15 phút)

Yêu cầu: **Node.js 24 LTS** (tối thiểu 22), **Docker Desktop** (cho PostgreSQL), Git. Python 3.10+ chỉ cần cho người 4 (đo tải).

```bash
git clone <repo> && cd cinenest-booking-system
npm ci                                     # cài đúng phiên bản đã khóa cho backend và frontend
docker compose up -d                       # PostgreSQL 16 tại localhost:5432, db moviecafe
cp backend/.env.example backend/.env       # sửa SESSION_SECRET thành chuỗi ngẫu nhiên dài
npm run db:generate                        # sinh Prisma Client
npm run db:migrate                         # áp dụng migration có sẵn (bảng + EXCLUDE chống trùng, CHECK, cột sinh session)
npm run db:seed                            # 10 phòng, 51 phim thật (Việt Nam + thế giới), 15 món, 4 tài khoản, 10 booking đủ trạng thái
npm run dev                                # API http://localhost:3000/api  +  web http://localhost:5173
```

**Kho phim thật (nhóm đã chốt: The Movies Dataset – Kaggle).** Seed chỉ có 51 phim để chạy nhanh; muốn kho vài nghìn phim:
1. Tải https://www.kaggle.com/datasets/rounakbanik/the-movies-dataset (cần tài khoản Kaggle, gói zip ≈ 230 MB), lấy **`movies_metadata.csv`** (≈ 34 MB, 45.466 phim) đặt vào `backend/data/` (thư mục bị `.gitignore`, không commit).
2. `npm run db:import-movies -- --file data/movies_metadata.csv` → nhập tối đa 5.000 phim có ≥ 100 lượt đánh giá, thời lượng 60–200 phút, có poster + mô tả, không phải phim người lớn; ưu tiên phim nhiều lượt đánh giá. Chạy lại không tạo trùng.
   Tùy chọn: `--limit 3000`, `--min-votes 300`, `--dry-run` (chỉ đếm), `--no-filter`. Thử nhanh với file mẫu: `npm run db:import-movies -- --file data/samples/movies_metadata.sample.csv --min-votes 0`.
3. Thể loại được dịch sang tiếng Việt; nhãn tuổi chưa có trong nguồn được ghi `NR` (T18 nếu dữ liệu đánh dấu adult) – quản lý sửa tay ở `admin/movies.html`. Poster lấy từ `image.tmdb.org` (đã cho phép trong CSP). Mô tả là tóm tắt tiếng Anh của TMDB.
   Khi dùng dữ liệu, ghi trong báo cáo: *“Dữ liệu phim: The Movies Dataset (Kaggle) / TMDB”*.
   Định dạng khác: MovieLens `movies.csv` (không có thời lượng → thêm `--assume-runtime`) hoặc CSV tự soạn `title,runtime,genre,...` (xem `backend/data/samples/README.md`).

Tài khoản demo: `khach@demo.local / Khach#123` · `staff@demo.local / Staff#1234` · `manager@demo.local / Manager#123`.

Kiểm thử tự động (CSDL riêng `moviecafe_test`, không phá dữ liệu dev):
```bash
cp backend/.env.test.example backend/.env.test
npm run db:test:setup                      # tạo db test + migrate + seed
npm test                                   # 25 test: T01–T06, T09–T12, T14–T18 + danh mục phim (tìm/phân trang/MOV03)
npm run test:e2e                           # Playwright: đăng ký → tìm phòng → booking bốn bước
```

Windows: dùng Git Bash hoặc WSL để chạy các lệnh trên. Khi **sửa schema** mới dùng `npm run db:migrate:dev -- --name <ten>` (tạo migration mới); nếu Prisma báo "drift" thì **không** chọn reset, báo Dương (quyền merge schema).

## 2. Cấu trúc

```
backend/                    Node.js 24 + Express 5 + Prisma 7 + PostgreSQL 16 (ESM, TypeScript, chạy bằng tsx)
  prisma/schema.prisma      toàn bộ bảng (trang 11) – Dương kiểm tra, Hải Anh merge
  prisma/migrations/        0001 bảng; 0002 ràng buộc; 0003 định danh nguồn phim
  prisma/seed.ts            dữ liệu mẫu (phim thật); SEED_PERF=1 thêm 300 tài khoản cho Locust
  prisma/import-movies.ts   nhập kho phim thật từ CSV (The Movies Dataset / MovieLens / CSV chung) – Thành Lê
  data/samples/             3 file CSV mẫu để thử script nhập
  src/core/                 prisma (pool + client), session, auth (requireRole), http (ApiError, {ok,data,error}),
                            dbErrors (23P01/23505 → 409), idempotency (chống gửi lặp), time (BR02–BR04, overlaps), logger
  src/modules/<module>/     *.service.ts + *.routes.ts; route nhân viên nằm trong <module>/*.staff.routes.ts
  src/app.ts, server.ts     khung Express, gắn router
  tests/                    Vitest + Supertest trên CSDL thật
frontend/                   HTML5 + CSS3 + TypeScript, Vite nhiều trang (mỗi màn hình = 1 .html + 1 .ts cùng tên)
  shared/                   api.ts, auth.ts (requireRole), layout.ts (header, toast, trạng thái), format.ts, styles.css – Dương
                            movie-picker.ts (ô chọn phim: tìm tên, lọc thể loại, "Xem thêm"; dùng ở booking, booking-view, walk-in) – Thành Lê
  *.html / staff/ / admin/  22 trang, dòng đầu mỗi .html ghi chủ sở hữu và mục đặc tả
perf/                       locustfile.py, ramp.py (Phụ lục B) – Thành Lê
docs/                       đặc tả PDF, API.md (hợp đồng API), CONTRACTS.md (3 hàm ranh giới)
```

## 3. Ai làm gì – điểm bắt đầu ngày 1 (đặc tả trang 16)

| Người | Module | File để bắt đầu | Việc đầu tiên |
|---|---|---|---|
| **Dương** (1) | tài khoản và nền dùng chung | `backend/src/modules/auth/*`, `frontend/shared/{api,auth,layout,format,styles}.ts`, `.github/workflows/ci.yml` | hoàn thiện `admin/employees`; đề xuất migration qua PR riêng; hỗ trợ CI |
| **Chúc** (2) | phòng và tìm phòng trống | `backend/src/modules/rooms/*`, `frontend/index.ts`, `rooms.ts`, `room.ts`, `admin/rooms.ts` | tối ưu `findAvailableRooms` (chỉ mục, EXPLAIN); hoàn thiện giao diện phòng |
| **Hải Anh** (3, nhóm trưởng) | booking, lịch nhân viên và tích hợp | `backend/src/modules/bookings/*`, `backend/src/core/{time,idempotency}.ts`, `frontend/booking.ts`, `my-bookings.ts`, `booking-view.ts`, `staff/{schedule,walk-in,booking-detail}.ts` | quản lý GitHub/PR/merge/demo; chạy T02; hoàn thiện luồng 4 bước và lịch nhân viên |
| **Thành Lê** (4) | phim, đo tải | `backend/src/modules/movies/*`, `backend/prisma/import-movies.ts`, `frontend/shared/movie-picker.ts`, `staff/movie-preparation.ts`, `admin/movies.ts`, `perf/*` | tải `movies_metadata.csv` từ Kaggle và chạy `db:import-movies`; hoàn thiện ô chọn phim (poster, mô tả); viết `perf/generate_history.py`; chạy PF01 lần đầu |
| **Sơn** (5) | menu, đơn món | `backend/src/modules/menu/*`, `frontend/shared/menu-picker.ts`, `frontend/staff/orders.ts`, `admin/menu.ts` | hoàn thiện bộ chọn món và giao diện đơn món; kiểm thử T11 mở rộng |
| **Công Thành** (6) | hóa đơn, thu tiền, ngoại lệ, báo cáo | `backend/src/modules/payments/*`, `reports/*`, `frontend/staff/checkout.ts`, `admin/adjustments.ts`, `admin/reports.ts` | rà `computeInvoice` với bảng tổ hợp trạng thái; biểu đồ báo cáo |

Ba hàm ranh giới (Hải Anh ↔ Chúc ↔ Sơn ↔ Công Thành) đã có sẵn: xem `docs/CONTRACTS.md`. Danh sách API: `docs/API.md`.

## 4. Quy ước làm việc

- Nhánh `feat/<module>-<việc>` từ `main`; pull request nhỏ; ít nhất một người review chéo (1↔6, 2↔3, 4↔5). Hải Anh là người duy nhất merge vào `main` và giữ bản demo luôn chạy được.
- Thay đổi `schema.prisma` và `prisma/migrations/` phải nằm trong PR riêng: Dương kiểm tra schema, Hải Anh review và merge. Không sửa migration đã được merge; luôn tạo migration mới.
- Backend: mọi route dùng `ok()`/`ApiError`; kiểm tra dữ liệu vào bằng zod; không tin giá/vai trò/trạng thái từ trình duyệt; tiền là số nguyên VND; thời gian `timestamptz`, quy đổi giờ VN bằng `core/time.ts`.
- Frontend: không gọi `fetch` trực tiếp (dùng `shared/api.ts`); trang nội bộ gọi `requireRole()` ở dòng đầu; header bằng `mountLayout()`; trạng thái tải/rỗng/lỗi bằng `setState()`; xác nhận trước khi hủy/kết thúc/thu tiền.
- Mã sinh bởi AI: đưa cho AI đúng trang đặc tả của module + `docs/CONTRACTS.md`; mã mới phải kèm kiểm thử theo mã T ở trang 14; không để AI "sáng tác" quy tắc khác đặc tả.
- Đóng băng tính năng đầu ngày 6; ngày 6–7 chỉ sửa lỗi, đo lại, tập trình bày.

## 5. Lệnh hay dùng

| Lệnh | Tác dụng |
|---|---|
| `npm run dev` | chạy API + web (hoặc `npm run dev:api` / `npm run dev:web` ở hai cửa sổ) |
| `npm run typecheck` | kiểm tra kiểu cả hai phần |
| `npm test` | kiểm thử backend (cần `.env.test` + `npm run db:test:setup`) |
| `npm run db:reset` | xóa và tạo lại CSDL dev + seed |
| `npm run build` | build frontend vào `frontend/dist` (backend `NODE_ENV=production` phục vụ thư mục này) |
| `cd backend && npx prisma studio` | xem dữ liệu bằng giao diện |

## 6. Ghi chú kỹ thuật quan trọng

- **Chống trùng hai lớp** (trang 12): `createBooking` khóa dòng phòng (`SELECT … FOR UPDATE`) rồi kiểm tra giao nhau; ràng buộc `booking_no_overlap` (EXCLUDE gist) trong PostgreSQL chặn mọi trường hợp còn sót ⇒ lỗi 23P01 được `core/dbErrors.ts` đổi thành 409. `tests/bookings.test.ts` T02 bắn 40 yêu cầu song song (Locust PF02 chạy 200).
- **Chống gửi lặp** (`core/idempotency.ts`): nhận khóa bằng `INSERT … ON CONFLICT DO NOTHING` **ngoài** giao dịch nghiệp vụ; cùng khóa + cùng nội dung ⇒ trả kết quả cũ; khác nội dung ⇒ 422; thất bại ⇒ xóa khóa để thử lại.
- **Duyệt trước, thu sau** (trang 8): `computeInvoice` chỉ trừ điều chỉnh APPROVED; còn PENDING_APPROVAL ⇒ `canCollect = false`.
- **Kho phim**: `GET /api/movies` luôn phân trang (`{ items, total, page, limit }`) vì kho phim thật có vài nghìn phim; giao diện dùng `shared/movie-picker.ts` thay vì tải toàn bộ danh sách. Dữ liệu: The Movies Dataset (Kaggle/TMDB), nhập bằng `db:import-movies`.
- **Phiên**: bảng `session` theo connect-pg-simple + cột sinh `user_id`; khóa tài khoản ⇒ `deleteSessionsOfUser` ⇒ yêu cầu kế tiếp 401 (T17).
- Prisma 7 chạy không cần engine Rust (adapter `pg`); `prisma migrate` cần tải schema-engine một lần khi có mạng.
