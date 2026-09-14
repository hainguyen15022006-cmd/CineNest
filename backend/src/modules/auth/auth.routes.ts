/**
 * Module 1 – Tài khoản (Dương). API trang 13:
 *   POST /api/auth/register, /api/auth/login, /api/auth/logout ; GET /api/me
 *   /api/admin/staff (quản lý nhân viên) nằm trong admin.routes.ts và gọi service ở đây.
 */
import { Router } from "express";
import { z } from "zod";
import { parse } from "../../core/validate.js";
import { ok } from "../../core/http.js";
import { requireAuth } from "../../core/auth.js";
import * as svc from "./auth.service.js";

export const authRouter = Router();
export const meRouter = Router();

const registerSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().email().max(200),
  phone: z.string().trim().regex(/^0\d{9,10}$/, "Số điện thoại 10–11 số, bắt đầu bằng 0"),
  password: z.string().min(8).max(100),
});

const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1),
});

function regenerate(req: import("express").Request): Promise<void> {
  return new Promise((resolve, reject) => req.session.regenerate((err) => (err ? reject(err) : resolve())));
}

authRouter.post("/register", async (req, res) => {
  const body = parse(registerSchema, req.body);
  const user = await svc.register(body);
  await regenerate(req);
  req.session.userId = user.id;
  ok(res, user, 201);
});

authRouter.post("/login", async (req, res) => {
  const body = parse(loginSchema, req.body);
  const user = await svc.login(body, req.ip ?? "unknown");
  await regenerate(req); // chống cố định phiên
  req.session.userId = user.id;
  ok(res, { id: user.id, name: user.name, email: user.email, phone: user.phone, role: user.role });
});

authRouter.post("/logout", (req, res) => {
  req.session.destroy(() => {
    res.clearCookie("mc.sid");
    ok(res, { loggedOut: true });
  });
});

/** GET /api/me – 401 nếu phiên không còn hoặc tài khoản bị khóa */
meRouter.get("/", requireAuth, (req, res) => {
  ok(res, req.user);
});
