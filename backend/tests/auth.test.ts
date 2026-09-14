import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { closeDb, prisma } from "../src/core/prisma.js";
import { registerAndLogin, loginAs, uid } from "./helpers.js";

const app = createApp();

describe("Module 1 – tài khoản, phiên, giới hạn thử (T05, T17, T18)", () => {
  afterAll(closeDb);

  it("đăng ký -> luôn là CUSTOMER, có phiên; /me trả đúng người", async () => {
    const { agent } = await registerAndLogin(app);
    const me = await agent.get("/api/me");
    expect(me.status).toBe(200);
    expect(me.body.data.role).toBe("CUSTOMER");
  });

  it("không đăng nhập -> 401; khách gọi API nội bộ -> 403 (T05)", async () => {
    expect((await request(app).get("/api/me")).status).toBe(401);
    const { agent } = await registerAndLogin(app);
    expect((await agent.get("/api/staff/bookings")).status).toBe(403);
    expect((await agent.get("/api/admin/staff")).status).toBe(403);
  });

  it("T18: sai 5 lần trong 10 phút -> lần thứ 6 bị 429", async () => {
    const { email } = await registerAndLogin(app);
    for (let i = 0; i < 5; i++) {
      const r = await request(app).post("/api/auth/login").send({ email, password: "sai-mat-khau" });
      expect(r.status).toBe(401);
    }
    const blocked = await request(app).post("/api/auth/login").send({ email, password: "Password#1" });
    expect(blocked.status).toBe(429);
    // dọn để các test sau (cùng IP 127.0.0.1) không bị chặn theo IP
    await prisma.loginAttempt.deleteMany({ where: { email } });
  });

  it("T17: khóa tài khoản nhân viên đang đăng nhập -> yêu cầu kế tiếp 401 ngay", async () => {
    const manager = await loginAs(app, "MANAGER");
    const email = `s-${uid()}@test.local`;
    const created = await manager.agent.post("/api/admin/staff").send({ name: "NV", email, phone: "0911111111", password: "Password#1", role: "STAFF" });
    expect(created.status).toBe(201);

    const staff = request.agent(app);
    expect((await staff.post("/api/auth/login").send({ email, password: "Password#1" })).status).toBe(200);
    expect((await staff.get("/api/staff/bookings")).status).toBe(200);

    const lock = await manager.agent.patch(`/api/admin/staff/${created.body.data.id}/active`).send({ isActive: false });
    expect(lock.status).toBe(200);
    expect((await staff.get("/api/staff/bookings")).status).toBe(401);
    const sessions = await prisma.session.count({ where: { userId: created.body.data.id } });
    expect(sessions).toBe(0);
  });
});
