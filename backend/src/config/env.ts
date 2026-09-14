import dotenv from "dotenv";
import { z } from "zod";

// Khi chạy test (Vitest tự đặt NODE_ENV=test) ưu tiên .env.test để dùng CSDL riêng, không phá dữ liệu dev.
dotenv.config({ path: process.env.NODE_ENV === "test" ? [".env.test", ".env"] : [".env"] });

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1),
  SESSION_SECRET: z.string().min(16, "SESSION_SECRET phải dài ít nhất 16 ký tự"),
  WEB_ORIGIN: z.string().default("http://localhost:5173"),
  TZ: z.string().default("Asia/Ho_Chi_Minh"),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error("Thiếu hoặc sai biến môi trường:", parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
export const isProd = env.NODE_ENV === "production";
export const isTest = env.NODE_ENV === "test";
