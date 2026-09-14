/**
 * Chuẩn phản hồi và lỗi dùng chung (đặc tả trang 13):
 *   thành công: { ok: true, data }
 *   lỗi:        { ok: false, error: { code, message, details? } }
 * Mã HTTP: 400/422 dữ liệu sai hoặc vi phạm quy tắc, 401 chưa đăng nhập,
 * 403 không có quyền, 404 không tìm thấy, 409 xung đột, 429 quá giới hạn.
 */
import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { mapDbError } from "./dbErrors.js";
import { logger } from "./logger.js";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message?: string,
    public readonly details?: unknown,
  ) {
    super(message ?? code);
    this.name = "ApiError";
  }

  static badRequest(code: string, message?: string, details?: unknown) {
    return new ApiError(400, code, message, details);
  }
  static unauthorized(message = "Bạn cần đăng nhập") {
    return new ApiError(401, "UNAUTHORIZED", message);
  }
  static forbidden(message = "Bạn không có quyền thực hiện thao tác này") {
    return new ApiError(403, "FORBIDDEN", message);
  }
  static notFound(code = "NOT_FOUND", message = "Không tìm thấy") {
    return new ApiError(404, code, message);
  }
  static conflict(code: string, message?: string, details?: unknown) {
    return new ApiError(409, code, message, details);
  }
  static unprocessable(code: string, message?: string, details?: unknown) {
    return new ApiError(422, code, message, details);
  }
}

export function ok<T>(res: Response, data: T, status = 200): void {
  res.status(status).json({ ok: true, data });
}

export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json({ ok: false, error: { code: "NOT_FOUND", message: "Không tìm thấy đường dẫn" } });
}

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof ZodError) {
    res.status(422).json({
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Dữ liệu không hợp lệ",
        details: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      },
    });
    return;
  }

  const mapped = err instanceof ApiError ? err : mapDbError(err);
  if (mapped) {
    res.status(mapped.status).json({
      ok: false,
      error: { code: mapped.code, message: mapped.message, details: mapped.details },
    });
    return;
  }

  // Lỗi hệ thống: mã tra cứu để đối chiếu log, không lộ thông tin nội bộ (trang 9)
  const ref = Math.random().toString(36).slice(2, 10).toUpperCase();
  logger.error({ err, ref, url: req.originalUrl }, "Unhandled error");
  res.status(500).json({
    ok: false,
    error: { code: "INTERNAL_ERROR", message: `Lỗi hệ thống. Mã tra cứu: ${ref}` },
  });
}
