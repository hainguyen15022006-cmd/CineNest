/**
 * Phiên đăng nhập phía máy chủ (đặc tả trang 3):
 *  - express-session + connect-pg-simple, bảng "session" (sid, sess, expire) do migration tạo.
 *  - Cookie HttpOnly, SameSite=Lax, Secure khi production (HTTPS).
 *  - Trong sess chỉ lưu { userId }. Cột sinh session.user_id (migration 0002) cho phép
 *    "khóa tài khoản xóa mọi phiên" bằng deleteSessionsOfUser().
 */
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { pool } from "./prisma.js";
import { env, isProd } from "../config/env.js";

declare module "express-session" {
  interface SessionData {
    userId?: number;
  }
}

const PgStore = connectPgSimple(session);

export const sessionMiddleware = session({
  store: new PgStore({
    pool,
    tableName: "session",
    createTableIfMissing: false, // bảng được tạo bởi Prisma migration
    pruneSessionInterval: 60 * 15,
  }),
  name: "mc.sid",
  secret: env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  rolling: true,
  cookie: {
    httpOnly: true,
    sameSite: "lax",
    secure: isProd,
    maxAge: 1000 * 60 * 60 * 12, // 12 giờ
  },
});

/** Khóa tài khoản => thu hồi quyền ngay: xóa toàn bộ phiên của người dùng (T17). */
export async function deleteSessionsOfUser(userId: number): Promise<number> {
  const r = await pool.query('DELETE FROM "session" WHERE "user_id" = $1', [userId]);
  return r.rowCount ?? 0;
}
