/**
 * Kết nối cơ sở dữ liệu dùng chung cho mọi module.
 *  - `pool`  : node-postgres Pool – dùng cho session store, SQL thuần (FOR UPDATE, đếm, báo cáo).
 *  - `prisma`: Prisma Client 7 (Rust-free) qua adapter pg, dùng CÙNG pool ở trên.
 *
 * Quy ước: mã nghiệp vụ dùng `prisma` là chính; chỉ dùng `$queryRaw`/`$executeRaw`
 * cho các câu Prisma không biểu diễn được (SELECT ... FOR UPDATE, INSERT ... ON CONFLICT).
 */
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.js";
import { env } from "../config/env.js";

export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: 20,
  // Prisma driver adapter gửi Date ở dạng UTC không kèm offset. Buộc từng phiên
  // PostgreSQL đọc/ghi mốc đó theo UTC để API Prisma và SQL thuần dùng cùng một giờ.
  options: "-c timezone=UTC",
  // Một giao dịch tạo booking treo không được giữ khóa phòng vô hạn (trang 12)
  statement_timeout: 5_000,
});

const adapter = new PrismaPg(pool);

export const prisma = new PrismaClient({
  adapter,
  log: env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
});

/** Kiểu của client bên trong `prisma.$transaction(async (tx) => ...)` */
export type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

export async function closeDb(): Promise<void> {
  await prisma.$disconnect();
  await pool.end();
}
