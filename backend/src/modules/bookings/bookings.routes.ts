/**
 * Module 3 – Booking (Hải Anh). API trang 13 (phía khách):
 *   POST /api/bookings                (đăng nhập; header Idempotency-Key bắt buộc; 409 trùng, 422 quy tắc)
 *   GET  /api/me/bookings?scope=upcoming|past
 *   GET  /api/bookings/:idOrCode      (chủ sở hữu hoặc nhân viên)
 *   POST /api/bookings/:id/cancel
 *   PATCH /api/bookings/:id/movie     (module 4 – Thành Lê; route gắn ở đây để đúng đường dẫn đặc tả)
 */
import { Router } from "express";
import { z } from "zod";
import { parse } from "../../core/validate.js";
import { ok } from "../../core/http.js";
import { requireAuth } from "../../core/auth.js";
import { getIdempotencyKey, hashRequest, withIdempotency } from "../../core/idempotency.js";
import * as svc from "./bookings.service.js";
import { changeMovie } from "../movies/movies.service.js";

export const bookingsRouter = Router();
export const myBookingsRouter = Router();

export const createBookingSchema = z.object({
  roomId: z.number().int().positive(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  duration: z.number().int(),
  guests: z.number().int().min(1).max(20),
  contactName: z.string().trim().min(2).max(100),
  contactPhone: z.string().trim().regex(/^0\d{9,10}$/),
  movieId: z.number().int().positive().nullable().optional(),
  items: z.array(z.object({ menuItemId: z.number().int().positive(), quantity: z.number().int().min(1).max(20) })).max(30).optional(),
  note: z.string().max(500).optional(),
  expectedTotalVnd: z.number().int().min(0).optional(),
});

const idParam = z.coerce.number().int().positive();

bookingsRouter.use(requireAuth);

bookingsRouter.post("/", async (req, res) => {
  const key = getIdempotencyKey(req);
  const body = parse(createBookingSchema, req.body);
  const result = await withIdempotency(req.user!.id, key, hashRequest(req), async () => {
    const booking = await svc.createBooking(body, { source: "ONLINE", customerId: req.user!.id, createdById: null });
    return { status: 201, body: booking };
  });
  res.setHeader("Idempotent-Replayed", String(result.replayed));
  ok(res, result.body, result.status);
});

bookingsRouter.get("/:idOrCode", async (req, res) => {
  ok(res, await svc.getBookingFor(req.user!, String(req.params.idOrCode)));
});

bookingsRouter.post("/:id/cancel", async (req, res) => {
  const id = parse(idParam, req.params.id);
  const { reason } = parse(z.object({ reason: z.string().max(300).optional() }), req.body ?? {});
  ok(res, await svc.cancelBooking(req.user!, id, reason ?? null));
});

bookingsRouter.patch("/:id/movie", async (req, res) => {
  const id = parse(idParam, req.params.id);
  const { movieId } = parse(z.object({ movieId: z.number().int().positive().nullable() }), req.body);
  const isStaff = req.user!.role !== "CUSTOMER";
  ok(res, await changeMovie(id, movieId, req.user!.id, isStaff));
});

myBookingsRouter.get("/", requireAuth, async (req, res) => {
  const { scope } = parse(z.object({ scope: z.enum(["upcoming", "past"]).default("upcoming") }), req.query);
  ok(res, await svc.listMyBookings(req.user!.id, scope));
});
