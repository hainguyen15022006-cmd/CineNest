import "dotenv/config"; // Prisma 7 không tự nạp .env
import { defineConfig } from "prisma/config";

// Prisma 7: cấu hình CLI. URL lấy từ biến môi trường DATABASE_URL (xem .env.example).
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: process.env.DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/moviecafe",
  },
});
