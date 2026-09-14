/**
 * Chạy trước mỗi file test (vitest setupFiles): xóa lịch sử thử đăng nhập để giới hạn theo IP
 * (mọi test đều đến từ 127.0.0.1) không chặn lẫn nhau giữa các lần chạy.
 */
import { beforeAll } from "vitest";
import { prisma } from "../src/core/prisma.js";

beforeAll(async () => {
  await prisma.loginAttempt.deleteMany({});
});
