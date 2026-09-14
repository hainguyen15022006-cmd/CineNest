# Hợp đồng ranh giới giữa các module (đặc tả v1.7, trang 16)

Ba hàm dưới đây là điểm tiếp xúc bắt buộc giữa module 2, 3, 5 và 6. Chúng ĐÃ CÓ trong bộ nền và có kiểm thử;
người sở hữu được sửa bên trong nhưng **không đổi chữ ký** nếu chưa thống nhất với người gọi.

## 1. Chuyển trạng thái sử dụng phòng – Hải Anh (module 3)
`backend/src/modules/bookings/bookings.service.ts`
```ts
transitionBooking(tx, bookingId, to, actor, reason, opts?: { endedEarly?: boolean }): Promise<Booking>
```
- Khóa dòng booking (`FOR UPDATE`), kiểm tra chuyển tiếp hợp lệ theo trang 5 (CONFIRMED → IN_USE | CANCELLED | NO_SHOW | COMPLETED; IN_USE → COMPLETED), ghi `booking_status_history` (field = `status`).
- Đặt `checked_in_at` khi vào IN_USE; `ended_at` (+ `ended_early_reason` nếu `endedEarly`) khi vào COMPLETED.
- KHÔNG đụng `payment_status`. Người gọi: Công Thành (checkout, end-early). Gọi bên trong `prisma.$transaction`.

## 2. Kiểm tra giao nhau / quy tắc thời gian – Hải Anh + Chúc (core)
`backend/src/core/time.ts`
```ts
overlaps(aStart, aEnd, bStart, bEnd): boolean           // khoảng nửa mở [start, end); chạm biên không giao
validateSlot(date, startTime, duration, { source }): Window  // BR02–BR04; ném ApiError 422 với mã rõ
computeWindow(startAt, durationMinutes): Window          // occupiedUntil = endAt + 30 phút
HOLDING_STATUSES = ['CONFIRMED','IN_USE','COMPLETED']    // khớp mệnh đề WHERE của EXCLUDE
```
- Tìm phòng trống (Chúc) dùng SQL `tstzrange(start_at, occupied_until, '[)') && …` với cùng tập trạng thái ⇒ kết quả tìm và kết quả đặt không bao giờ khác nhau.

## 3. Tiền món và trạng thái món để thanh toán – Sơn (module 5)
`backend/src/modules/menu/menu.service.ts`
```ts
computeItemsForBilling(tx, bookingId): Promise<{ itemsTotalVnd; unresolvedOrderIds: number[]; orders }>
buildPreorder(tx, items): Promise<{ lines; totalVnd }>   // chốt tên/giá từ DB khi tạo booking
resolveOrdersOnEarlyEnd(tx, bookingId)                    // EX02: PENDING → CANCELLED; PREPARING/SERVED giữ nguyên, vẫn tính tiền
```
- `itemsTotalVnd` chỉ gồm đơn không bị hủy. `unresolvedOrderIds` = đơn PENDING/PREPARING ⇒ module 6 chặn thu (trừ khi booking đã kết thúc sớm).
- Người gọi: Công Thành (`computeInvoice`, `checkout`), Hải Anh (`createBooking`).

## Người 6 (Công Thành) chỉ gọi, không tự sửa
`payments.service.ts` không được cập nhật `booking.status` trực tiếp hay tính lại tiền món từ bảng `food_order_item`; mọi thay đổi trạng thái tiền (`payment_status`) ghi lịch sử với field = `payment_status`.

## Chống gửi lặp – dùng chung (core)
`backend/src/core/idempotency.ts` → `withIdempotency(actorId, key, requestHash, run)`; xem trang 12. Route nào tạo dữ liệu hoặc thu tiền đều bọc bằng hàm này.
