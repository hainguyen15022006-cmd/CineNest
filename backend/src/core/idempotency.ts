/**
 * Chống gửi lặp (đặc tả trang 12, Phụ lục A) – dùng cho POST /bookings, POST /staff/bookings,
 * POST /staff/bookings/:id/checkout và mọi thao tác tạo/thu tiền khác.
 *
 * Nguyên tắc: nhận khóa trong một câu lệnh RIÊNG (ngoài giao dịch nghiệp vụ) bằng
 * INSERT ... ON CONFLICT DO NOTHING. Không bao giờ bắt lỗi trùng khóa rồi dùng tiếp
 * giao dịch đã lỗi (PostgreSQL hủy giao dịch sau lỗi – 25P02).
 *
 *   cùng khóa + cùng nội dung + DONE        -> trả lại phản hồi cũ (replayed = true)
 *   cùng khóa + đang IN_PROGRESS (< 30 s)   -> 409 REQUEST_IN_PROGRESS
 *   cùng khóa + IN_PROGRESS quá 30 s        -> coi là bỏ dở: xóa khóa, chạy lại
 *   cùng khóa + khác nội dung               -> 422 IDEMPOTENCY_KEY_REUSED
 *   thao tác thất bại                       -> xóa khóa để khách thử lại với cùng khóa
 */
import { createHash } from "node:crypto";
import type { Request } from "express";
import { pool } from "./prisma.js";
import { ApiError } from "./http.js";

export const STALE_AFTER_MS = 30_000;

export type IdempotentResult<T> = { status: number; body: T; replayed: boolean };

export function hashRequest(req: Request): string {
  const canonical = JSON.stringify({ m: req.method, p: req.originalUrl.split("?")[0], b: req.body ?? null });
  return createHash("sha256").update(canonical).digest("hex");
}

/** Đọc header Idempotency-Key; thiếu -> 400. */
export function getIdempotencyKey(req: Request): string {
  const key = req.get("Idempotency-Key");
  if (!key || key.length > 100) {
    throw ApiError.badRequest("IDEMPOTENCY_KEY_REQUIRED", "Thiếu header Idempotency-Key");
  }
  return key;
}

type Row = {
  id: number;
  request_hash: string;
  status: "IN_PROGRESS" | "DONE";
  response_code: number | null;
  response_body: unknown;
  created_at: Date;
};

export async function withIdempotency<T>(
  actorId: number,
  key: string,
  requestHash: string,
  run: () => Promise<{ status: number; body: T }>,
): Promise<IdempotentResult<T>> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const claimed = await pool.query(
      `INSERT INTO "idempotency_request" ("actor_id", "key", "request_hash", "status")
       VALUES ($1, $2, $3, 'IN_PROGRESS')
       ON CONFLICT ("actor_id", "key") DO NOTHING
       RETURNING "id"`,
      [actorId, key, requestHash],
    );

    if (claimed.rowCount === 0) {
      const prevRes = await pool.query<Row>(
        `SELECT "id", "request_hash", "status", "response_code", "response_body", "created_at"
         FROM "idempotency_request" WHERE "actor_id" = $1 AND "key" = $2`,
        [actorId, key],
      );
      const prev = prevRes.rows[0];
      if (!prev) continue; // vừa bị xóa bởi tiến trình khác: thử nhận lại

      if (prev.request_hash !== requestHash) {
        throw ApiError.unprocessable("IDEMPOTENCY_KEY_REUSED", "Idempotency-Key đã dùng cho một yêu cầu khác");
      }
      if (prev.status === "IN_PROGRESS") {
        if (Date.now() - new Date(prev.created_at).getTime() > STALE_AFTER_MS) {
          await pool.query(`DELETE FROM "idempotency_request" WHERE "id" = $1`, [prev.id]);
          continue; // bỏ dở: chạy lại
        }
        throw ApiError.conflict("REQUEST_IN_PROGRESS", "Yêu cầu này đang được xử lý, vui lòng chờ");
      }
      return { status: prev.response_code ?? 200, body: prev.response_body as T, replayed: true };
    }

    try {
      const result = await run();
      await pool.query(
        `UPDATE "idempotency_request" SET "status" = 'DONE', "response_code" = $3, "response_body" = $4
         WHERE "actor_id" = $1 AND "key" = $2`,
        [actorId, key, result.status, JSON.stringify(result.body)],
      );
      return { ...result, replayed: false };
    } catch (err) {
      await pool.query(`DELETE FROM "idempotency_request" WHERE "actor_id" = $1 AND "key" = $2`, [actorId, key]);
      throw err;
    }
  }
  throw ApiError.conflict("REQUEST_IN_PROGRESS", "Không nhận được khóa thao tác, vui lòng thử lại");
}
