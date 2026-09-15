/** Route nhân viên thuộc module 3 – Hải Anh: lịch, quá hạn, booking tại quầy và check-in. */
import { Router } from "express";
import { z } from "zod";
import { parse } from "../../core/validate.js";
import { ok } from "../../core/http.js";
import { getIdempotencyKey, hashRequest, withIdempotency } from "../../core/idempotency.js";
import { vnToDate, addMinutes, todayVn } from "../../core/time.js";
import { createBookingSchema } from "./bookings.routes.js";
import * as bookings from "./bookings.service.js";

export const bookingsStaffRouter = Router();
const idParam = z.coerce.number().int().positive();
const dateQuery = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() });
const searchQuery = z.object({ q: z.string().trim().min(2).max(50) });

function dayRange(date?: string) {
  const start = vnToDate(date ?? todayVn(), "00:00");
  return { start, end: addMinutes(start, 24 * 60) };
}

bookingsStaffRouter.get("/bookings", async (req, res) => {
  const { date } = parse(dateQuery, req.query);
  const { start, end } = dayRange(date);
  ok(res, await bookings.listSchedule(start, end));
});
bookingsStaffRouter.get("/bookings/search", async (req, res) => {
  const { q } = parse(searchQuery, req.query);
  ok(res, await bookings.searchStaffBookings(q));
});
bookingsStaffRouter.get("/bookings/overdue", async (_req, res) => ok(res, await bookings.listOverdue()));
bookingsStaffRouter.post("/bookings", async (req, res) => {
  const key = getIdempotencyKey(req);
  const body = parse(createBookingSchema, req.body);
  const result = await withIdempotency(req.user!.id, key, hashRequest(req), async () => ({ status: 201, body: await bookings.createCounterBooking(body, req.user!) }));
  res.setHeader("Idempotent-Replayed", String(result.replayed));
  ok(res, result.body, result.status);
});
bookingsStaffRouter.post("/bookings/:id/check-in", async (req, res) => ok(res, await bookings.checkIn(req.user!, parse(idParam, req.params.id))));
bookingsStaffRouter.post("/bookings/:id/no-show", async (req, res) => {
  const { reason } = parse(z.object({ reason: z.string().max(300).optional() }), req.body ?? {});
  ok(res, await bookings.markNoShow(req.user!, parse(idParam, req.params.id), reason ?? null));
});
bookingsStaffRouter.post("/bookings/:id/mark-used", async (req, res) => {
  const { note } = parse(z.object({ note: z.string().trim().min(1).max(300) }), req.body);
  ok(res, await bookings.markUsedWithoutCheckIn(req.user!, parse(idParam, req.params.id), note));
});
