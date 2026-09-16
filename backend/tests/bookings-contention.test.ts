import { afterAll, expect, it } from "vitest";
import request from "supertest";
import { createServer } from "node:http";
import { hash } from "bcryptjs";
import { createApp } from "../src/app.js";
import { closeDb, prisma, pool } from "../src/core/prisma.js";
import { bookingPayload, createTestRoom, key, uid } from "./helpers.js";

afterAll(closeDb);

it("T14: 100 online + 100 counter requests concurrently -> one winner, 199 ROOM_TAKEN, one DB booking", async () => {
  const server = createServer(createApp());
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Test HTTP server did not start");
  const origin = `http://127.0.0.1:${address.port}`;
  const room = await createTestRoom();
  const users: { id: number; email: string }[] = [];
  try {
    const passwordHash = await hash("Password#1", 4);
    // Separate customer sessions avoid the per-account booking quota masking room contention.
    for (let i = 0; i < 101; i++) {
      users.push(await prisma.user.create({ data: {
        name: "T14 fixture", email: `t14-${uid()}@test.local`, phone: "0912345678",
        passwordHash, role: i === 100 ? "STAFF" : "CUSTOMER",
      }, select: { id: true, email: true } }));
    }
    const agents = await Promise.all(users.map(async (user) => {
      const agent = request.agent(origin);
      const login = await agent.post("/api/auth/login").send({ email: user.email, password: "Password#1" });
      expect(login.status).toBe(200);
      return agent;
    }));
    const payload = bookingPayload(room.id);
    // Build all requests before dispatching them together. Both sources use the same room/time.
    const attempts = Array.from({ length: 200 }, (_, i) => ({
      source: i % 2 === 0 ? "ONLINE" : "COUNTER",
      actor: i % 2 === 0 ? users[i / 2]! : users[100]!,
      agent: i % 2 === 0 ? agents[i / 2]! : agents[100]!,
    }));
    const responses = await Promise.all(attempts.map(({ source, agent }) =>
      agent.post(source === "ONLINE" ? "/api/bookings" : "/api/staff/bookings")
        .set("Idempotency-Key", key()).send(payload),
    ));
    const statusCounts = responses.reduce<Record<number, number>>((counts, response) => {
      counts[response.status] = (counts[response.status] ?? 0) + 1;
      return counts;
    }, {});
    expect(statusCounts).toEqual({ 201: 1, 409: 199 });
    for (const response of responses.filter((r) => r.status === 409)) {
      expect(response.body.error.code).toBe("ROOM_TAKEN");
    }
    const winnerIndex = responses.findIndex((r) => r.status === 201);
    const winner = attempts[winnerIndex]!;
    const saved = await prisma.booking.findMany({ where: { roomId: room.id } });
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({
      id: responses[winnerIndex]!.body.data.id, source: winner.source,
      customerId: winner.source === "ONLINE" ? winner.actor.id : null,
      createdById: winner.source === "COUNTER" ? winner.actor.id : null,
      status: "CONFIRMED", roomTotal: 200_000,
    });
    console.info("T14 mixed contention:", JSON.stringify(statusCounts), "DB bookings:", saved.length);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await prisma.bookingStatusHistory.deleteMany({ where: { booking: { roomId: room.id } } });
    await prisma.booking.deleteMany({ where: { roomId: room.id } });
    const ids = users.map((u) => u.id);
    await prisma.idempotencyRequest.deleteMany({ where: { actorId: { in: ids } } });
    await pool.query("DELETE FROM session WHERE user_id = ANY($1::int[])", [ids]);
    await prisma.loginAttempt.deleteMany({ where: { email: { in: users.map((u) => u.email) } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    await prisma.room.delete({ where: { id: room.id } });
  }
}, 60_000);
