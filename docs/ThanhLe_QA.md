# CineNest — Q&A phần Thành Lê

## Vì sao dùng `movieVersion` và `expectedVersion`?

Trang chuẩn bị phim có thể mở trước khi khách đổi phim. Mỗi lần đổi phim hoặc khi quản trị viên vô hiệu hóa phim đang được dùng, hệ thống tăng `movieVersion`. Yêu cầu của nhân viên phải gửi `expectedVersion`. Nếu phiên bản không còn khớp, API trả `MOVIE_CHANGED` và không cập nhật trạng thái. Cơ chế này ngăn thao tác từ màn hình cũ áp dụng cho phim mới.

## Vì sao cần transaction trong thao tác chuẩn bị phim?

Một lần cập nhật phải kiểm tra booking, kiểm tra phim, cập nhật trạng thái và ghi lịch sử. Transaction giữ các bước này trong cùng một đơn vị nguyên tử. Nếu một bước thất bại, cơ sở dữ liệu không lưu trạng thái dở dang.

## Khi quản trị viên tắt một phim đang có booking thì sao?

Hệ thống giữ booking nhưng chuyển trạng thái chuẩn bị phim sang `UNAVAILABLE` cho các booking `CONFIRMED` hoặc `IN_USE`. Đồng thời, hệ thống tăng `movieVersion`. Nhân viên phải tải lại dữ liệu trước khi thao tác tiếp.

## Importer tránh phim trùng như thế nào?

Importer dùng `tmdbId` làm khóa đối chiếu, loại trùng trong chính tệp CSV rồi đối chiếu các ID đã có trong cơ sở dữ liệu. Giới hạn `--limit` áp dụng lên tập phim hợp lệ trước bước đối chiếu nên chạy lại cùng lệnh không tiếp tục nhập phần đuôi ngoài giới hạn. Lượt kiểm tra cuối có đúng 5.000 phim TMDB và lần chạy lại thêm 0 bản ghi.

## Dữ liệu thiếu nhãn tuổi được xử lý thế nào?

Nguồn metadata không có phân loại tuổi Việt Nam đầy đủ. Importer gán `NR` để thể hiện “chưa phân loại”, thay vì suy đoán nhãn. Quản trị viên có thể sửa thủ công khi có nguồn phù hợp.

## PF01 đo gì?

PF01 tạo 50 người dùng, tăng 10 người dùng mỗi giây và chạy trong 5 phút. Endpoint availability nhận 4.233 request, p95 27 ms và 0 lỗi sau khi sửa dữ liệu ngày kiểm thử để không tạo khung giờ đã hết hạn.

## PF02 chứng minh chống double booking thế nào?

Kịch bản gửi 200 yêu cầu tranh cùng một phòng và cùng khung giờ. Kết quả có 1 phản hồi 201, 199 phản hồi 409, không có lỗi khác và cơ sở dữ liệu chỉ chứa đúng 1 booking. p95 của endpoint booking là 1.500 ms trong đợt tranh chấp này.

## PF03 đo gì?

PF03 tăng dần từ 0 lên 300 người dùng. Tổng cộng có 46.331 request, 0 lỗi và p95 toàn bộ là 110 ms. p95 availability là 130 ms, booking là 100 ms, còn login là 870 ms.

## Vì sao login chậm hơn các endpoint khác?

Đăng nhập phải chạy kiểm tra mật khẩu bằng bcrypt. Khi nhiều phiên đăng nhập đồng thời, công việc CPU này tốn thời gian hơn truy vấn đọc thông thường. Các phiên tải ổn định tái sử dụng session nên độ trễ login không chi phối toàn bộ PF03.

## Vì sao Lighthouse Best Practices chỉ đạt 96?

Trang chủ gọi `/api/me` để xác định trạng thái đăng nhập. Khi chưa có session, API trả 401 đúng hợp đồng nhưng Lighthouse vẫn ghi nhận phản hồi này trong phần Best Practices. Không nên đổi API thành 200 chỉ để tăng điểm vì sẽ làm sai ngữ nghĩa xác thực.

## Hạn chế còn lại là gì?

LCP trên máy kiểm thử vẫn ở mức 3,7 giây vì ảnh phòng lấy từ dịch vụ ảnh bên ngoài. PF02 cũng cho thấy đợt login đồng thời tốn CPU do bcrypt. Hai hướng cải thiện tiếp theo là tự phục vụ ảnh đã tối ưu và giới hạn hoặc phân bổ tải đăng nhập, sau đó đo lại trên môi trường gần production hơn.

## Kịch bản demo ngắn

1. Mở booking và tìm phim theo tên hoặc thể loại.
2. Đổi phim, quan sát trạng thái về `PENDING` và `movieVersion` tăng.
3. Ở trang nhân viên, cập nhật trạng thái sang `READY` bằng phiên bản hiện tại.
4. Gửi lại thao tác với phiên bản cũ để nhận `MOVIE_CHANGED`.
5. Tắt phim trong trang quản trị và kiểm tra booking liên quan chuyển sang `UNAVAILABLE`.
