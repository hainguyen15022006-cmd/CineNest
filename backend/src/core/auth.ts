/**
 * Kiểm soát truy cập (đặc tả trang 3):
 *  - requireAuth: phiên còn hiệu lực VÀ tài khoản còn hoạt động; nếu bị khóa -> hủy phiên, 401.
 *  - requireRole(...roles): 403 nếu vai trò không thuộc danh sách. MANAGER có mọi quyền STAFF.
 * Người dùng hiện tại gắn vào req.user (không lộ password_hash).
 */
import type { NextFunction, Request, Response } from "express";
import { prisma } from "./prisma.js";
import { ApiError } from "./http.js";
import type { Role } from "../generated/prisma/enums.js";

export type CurrentUser = {
  id: number;
  name: string;
  email: string;
  phone: string;
  role: Role;
};

declare global {
  namespace Express {
    interface Request {
      user?: CurrentUser;
    }
  }
}

export async function requireAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const userId = req.session?.userId;
  if (!userId) return next(ApiError.unauthorized());

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, email: true, phone: true, role: true, isActive: true },
  });
  if (!user || !user.isActive) {
    // Tài khoản bị khóa/xóa: hủy phiên hiện tại và từ chối ngay
    await new Promise<void>((resolve) => req.session.destroy(() => resolve()));
    return next(ApiError.unauthorized("Tài khoản không còn hiệu lực"));
  }
  req.user = { id: user.id, name: user.name, email: user.email, phone: user.phone, role: user.role };
  next();
}

/** Vai trò được phép. MANAGER luôn được coi là có quyền STAFF (trang 3: quản lý dùng lại màn hình nhân viên). */
export function requireRole(...roles: Role[]) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) {
      await requireAuth(req, res, (err?: unknown) => {
        if (err) return next(err);
        check();
      });
      return;
    }
    check();

    function check() {
      const role = req.user!.role;
      const allowed = roles.includes(role) || (role === "MANAGER" && roles.includes("STAFF"));
      if (!allowed) return next(ApiError.forbidden());
      next();
    }
  };
}

export const requireStaff = requireRole("STAFF", "MANAGER");
export const requireManager = requireRole("MANAGER");
