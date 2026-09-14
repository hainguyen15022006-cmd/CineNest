-- CineNest v1.7: lưu định danh nguồn để nhập lại The Movies Dataset không tạo trùng
-- và không gộp nhầm các bản phim có cùng tên/thời lượng.
ALTER TABLE "movie" ADD COLUMN "source" TEXT;
ALTER TABLE "movie" ADD COLUMN "external_id" TEXT;
CREATE UNIQUE INDEX "movie_source_external_id_key" ON "movie"("source", "external_id");
