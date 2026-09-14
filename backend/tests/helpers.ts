/**
 * Tiện ích kiểm thử dùng chung. Test chạy trên CSDL thật (DATABASE_URL) và tự tạo dữ liệu riêng
 * (email ngẫu nhiên, phòng riêng) nên không phụ thuộc và không phá dữ liệu seed.
 */
import request from "supertest";
import type { Express } from "express";
import { randomUUID } from "node:crypto";
import { prisma } from "../src/core/prisma.js";
import { dateToVn, addMinutes } from "../src/core/time.js";

export type Agent = ReturnType<typeof request.agent>;

export function uid(): string {
  return randomUUID().slice(0, 8);
}

export async function registerAndLogin(app: Express, overrides: Partial<{ name: string; password: string }> = {}): Promise<{ agent: Agent; id: number; email: string }> {
  const agent = request.agent(app);
  const email = `t-${uid()}@test.local`;
  const password = overrides.password ?? "Password#1";
  const res = await agent.post("/api/auth/register").send({ name: overrides.name ?? "Test User", email, phone: "0912345678", password });
  if (res.status !== 201) throw new Error(`register failed: ${res.status} ${JSON.stringify(res.body)}`);
  return { agent, id: res.body.data.id, email };
}

/** Tạo nhân viên/quản lý trực tiếp trong DB rồi đăng nhập */
export async function loginAs(app: Express, role: "STAFF" | "MANAGER"): Promise<{ agent: Agent; id: number }> {
  const bcrypt = await import("bcryptjs");
  const email = `${role.toLowerCase()}-${uid()}@test.local`;
  const user = await prisma.user.create({ data: { name: role, email, phone: "0900000000", role, passwordHash: await bcrypt.hash("Password#1", 4) } });
  const agent = request.agent(app);
  const res = await agent.post("/api/auth/login").send({ email, password: "Password#1" });
  if (res.status !== 200) throw new Error(`login failed: ${res.status}`);
  return { agent, id: user.id };
}

export async function createTestRoom(capacity = 4, price = 100_000) {
  return prisma.room.create({ data: { name: `Test room ${uid()}`, capacity, hourlyPriceVnd: price } });
}

/** Một ngày trong tương lai (cách 5 ngày) để tránh giới hạn 30 phút và 14 ngày */
export function futureDate(daysAhead = 5): string {
  return dateToVn(addMinutes(new Date(), daysAhead * 24 * 60)).date;
}

export function bookingPayload(roomId: number, extra: Record<string, unknown> = {}) {
  return { roomId, date: futureDate(), startTime: "19:00", duration: 120, guests: 2, contactName: "Khách test", contactPhone: "0912345678", ...extra };
}

export const key = () => randomUUID();
