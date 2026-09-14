/**
 * Kiểm tra dữ liệu vào bằng zod. Dùng: const body = parse(schema, req.body)
 * ZodError được errorHandler đổi thành 422 VALIDATION_ERROR.
 */
import type { ZodType } from "zod";

export function parse<T>(schema: ZodType<T>, input: unknown): T {
  return schema.parse(input);
}
