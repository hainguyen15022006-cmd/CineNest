/**
 * Ánh xạ lỗi PostgreSQL / Prisma thành ApiError (đặc tả trang 12, Phụ lục A):
 *   23P01 exclusion_violation  -> 409 ROOM_TAKEN   (lớp 2 chống trùng phòng)
 *   23505 unique_violation     -> 409 DUPLICATE    (idempotency, payment.booking_id, ...)
 *   23514 check_violation      -> 422 RULE_VIOLATION
 *   23503 foreign_key_violation-> 422 INVALID_REFERENCE
 *   25P02 in_failed_sql_transaction -> 500 (lỗi lập trình: dùng tiếp giao dịch đã hỏng)
 *   57014 query_canceled (statement_timeout) -> 409 BUSY
 *   P2002/P2003/P2025 Prisma errors -> 409/422/404
 */
import { ApiError } from "./http.js";

type PgLike = { code?: string; constraint?: string; meta?: Record<string, unknown>; cause?: unknown };

function extractPgCode(err: unknown): { code?: string; constraint?: string } {
  const e = err as PgLike;
  if (!e || typeof e !== "object") return {};
  if (typeof e.code === "string" && /^[0-9A-Z]{5}$/.test(e.code)) {
    return { code: e.code, constraint: e.constraint };
  }
  // Prisma bọc lỗi driver trong meta hoặc cause
  const meta = e.meta as { code?: string; constraint?: string; driverAdapterError?: PgLike } | undefined;
  if (meta?.driverAdapterError) return extractPgCode(meta.driverAdapterError);
  if (typeof meta?.code === "string") return { code: meta.code, constraint: meta.constraint };
  if (e.cause) return extractPgCode(e.cause);
  return {};
}

export function mapDbError(err: unknown): ApiError | null {
  const { code, constraint } = extractPgCode(err);
  switch (code) {
    case "23P01":
      return ApiError.conflict("ROOM_TAKEN", "Khung giờ vừa được đặt, vui lòng chọn phòng hoặc giờ khác", { constraint });
    case "23505":
      return ApiError.conflict("DUPLICATE", "Dữ liệu đã tồn tại hoặc thao tác đã được thực hiện", { constraint });
    case "23514":
      return ApiError.unprocessable("RULE_VIOLATION", "Dữ liệu vi phạm quy tắc nghiệp vụ", { constraint });
    case "23503":
      return ApiError.unprocessable("INVALID_REFERENCE", "Tham chiếu không hợp lệ", { constraint });
    case "57014":
    case "P2034":
      return ApiError.conflict("BUSY", "Hệ thống đang bận, vui lòng thử lại");
    case "P2002":
      return ApiError.conflict("DUPLICATE", "Dữ liệu đã tồn tại hoặc thao tác đã được thực hiện", { constraint });
    case "P2003":
      return ApiError.unprocessable("INVALID_REFERENCE", "Tham chiếu không hợp lệ", { constraint });
    case "P2025":
      return ApiError.notFound("NOT_FOUND", "Không tìm thấy dữ liệu cần cập nhật");
    default:
      return null;
  }
}
