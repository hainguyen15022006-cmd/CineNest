# Mẫu định dạng cho `npm run db:import-movies`

Ba file nhỏ để kiểm tra script nhập phim mà không cần tải bộ dữ liệu lớn. Tất cả là **phim thật**.

| File | Định dạng | Ghi chú |
|---|---|---|
| `movies_metadata.sample.csv` | đúng 24 cột của `movies_metadata.csv` trong **The Movies Dataset** (Kaggle) | 10 phim đầu của bộ dữ liệu; `genres` là chuỗi kiểu Python, `runtime` dạng `81.0` |
| `movielens.sample.csv` | `movieId,title,genres` của MovieLens | không có thời lượng → phải chạy với `--assume-runtime` |
| `phim-viet.sample.csv` | CSV chung `title,year,runtime,genre,age,description` | dùng khi nhóm tự soạn danh sách phim Việt |

Bộ dữ liệu thật: tải `movies_metadata.csv` (≈34 MB) từ https://www.kaggle.com/datasets/rounakbanik/the-movies-dataset
và đặt vào `backend/data/` (thư mục này bị `.gitignore`, chỉ commit các file mẫu ở đây).
