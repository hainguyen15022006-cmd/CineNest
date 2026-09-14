/**
 * Module 1 – Tài khoản (Dương). Đặc tả trang 3; kiểm thử T05, T17, T18.
 */
import bcrypt from "bcryptjs";
import { prisma } from "../../core/prisma.js";
import { ApiError } from "../../core/http.js";
import { deleteSessionsOfUser } from "../../core/session.js";
import type { Role } from "../../generated/prisma/enums.js";

export const MAX_FAILED_ATTEMPTS = 5;
export const ATTEMPT_WINDOW_MINUTES = 10;

const publicUser = { id: true, name: true, email: true, phone: true, role: true, isActive: true, createdAt: true } as const;

export async function register(input: { name: string; email: string; phone: string; password: string }) {
  const email = input.email.trim().toLowerCase();
  const exists = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (exists) throw ApiError.conflict("EMAIL_TAKEN", "Email đã được đăng ký");
  const passwordHash = await bcrypt.hash(input.password, 10);
  // Hệ thống LUÔN gán CUSTOMER, không nhận vai trò từ trình duyệt (trang 3)
  return prisma.user.create({
    data: { name: input.name.trim(), email, phone: input.phone.trim(), passwordHash, role: "CUSTOMER" },
    select: publicUser,
  });
}

/** Giới hạn thử đăng nhập: >= 5 lần sai trong 10 phút theo email HOẶC IP -> 429 (T18) */
async function assertNotRateLimited(email: string, ip: string): Promise<void> {
  const since = new Date(Date.now() - ATTEMPT_WINDOW_MINUTES * 60_000);
  const failed = await prisma.loginAttempt.count({
    where: { succeeded: false, attemptedAt: { gte: since }, OR: [{ email }, { ip }] },
  });
  if (failed >= MAX_FAILED_ATTEMPTS) {
    throw new ApiError(429, "TOO_MANY_ATTEMPTS", `Bạn đã thử sai quá ${MAX_FAILED_ATTEMPTS} lần, hãy đợi ${ATTEMPT_WINDOW_MINUTES} phút`);
  }
}

export async function login(input: { email: string; password: string }, ip: string) {
  const email = input.email.trim().toLowerCase();
  await assertNotRateLimited(email, ip);

  const user = await prisma.user.findUnique({ where: { email } });
  const valid = user ? await bcrypt.compare(input.password, user.passwordHash) : false;
  await prisma.loginAttempt.create({ data: { email, ip, succeeded: Boolean(valid && user?.isActive) } });

  if (!user || !valid) throw ApiError.unauthorized("Email hoặc mật khẩu không đúng");
  if (!user.isActive) throw ApiError.unauthorized("Tài khoản đã bị khóa");

  const { passwordHash: _ph, ...safe } = user;
  return safe;
}

// ---- Quản lý nhân viên (chỉ MANAGER) ----

export function listStaff() {
  return prisma.user.findMany({ where: { role: { in: ["STAFF", "MANAGER"] } }, select: publicUser, orderBy: { id: "asc" } });
}

export async function createStaff(input: { name: string; email: string; phone: string; password: string; role: Role }) {
  const email = input.email.trim().toLowerCase();
  const exists = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (exists) throw ApiError.conflict("EMAIL_TAKEN", "Email đã được đăng ký");
  const passwordHash = await bcrypt.hash(input.password, 10);
  return prisma.user.create({
    data: { name: input.name.trim(), email, phone: input.phone.trim(), passwordHash, role: input.role },
    select: publicUser,
  });
}

/** Khóa/mở tài khoản. Khóa => xóa toàn bộ phiên để thu hồi quyền ngay (T17). */
export async function setActive(userId: number, isActive: boolean, actorId: number) {
  if (userId === actorId && !isActive) throw ApiError.unprocessable("CANNOT_LOCK_SELF", "Không thể tự khóa tài khoản của mình");
  const user = await prisma.user.update({ where: { id: userId }, data: { isActive }, select: publicUser });
  if (!isActive) await deleteSessionsOfUser(userId);
  return user;
}
