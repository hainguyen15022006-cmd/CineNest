/**
 * Module 2 – Phòng (Chúc). API trang 13:
 *   GET /api/rooms            danh sách phòng đang phục vụ (công khai)
 *   GET /api/rooms/availability?date&startTime&duration&guests   (công khai, PF01)
 *   GET /api/rooms/:id        chi tiết phòng
 *   /api/admin/rooms          CRUD – gắn trong admin.routes.ts
 */
import { Router } from "express";
import { z } from "zod";
import { parse } from "../../core/validate.js";
import { ok } from "../../core/http.js";
import * as svc from "./rooms.service.js";

export const roomsRouter = Router();

const availabilitySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  duration: z.coerce.number().int(),
  guests: z.coerce.number().int().min(1).max(20),
});

roomsRouter.get("/", async (_req, res) => ok(res, await svc.listRooms()));

roomsRouter.get("/availability", async (req, res) => {
  const q = parse(availabilitySchema, req.query);
  ok(res, await svc.findAvailableRooms(q));
});

roomsRouter.get("/:id", async (req, res) => {
  const id = parse(z.coerce.number().int().positive(), req.params.id);
  ok(res, await svc.getRoom(id));
});

// ---- admin ----
export const adminRoomsRouter = Router();

const roomInput = z.object({
  name: z.string().trim().min(1).max(100),
  capacity: z.number().int().min(1).max(20),
  description: z.string().max(2000).optional(),
  amenities: z.array(z.string().max(100)).max(30).optional(),
  hourlyPriceVnd: z.number().int().min(0),
  isActive: z.boolean().optional(),
  images: z.array(z.string().url().max(500)).max(10).optional(),
});

adminRoomsRouter.get("/", async (_req, res) => ok(res, await svc.listRooms(true)));
adminRoomsRouter.post("/", async (req, res) => ok(res, await svc.createRoom(parse(roomInput, req.body)), 201));
adminRoomsRouter.patch("/:id", async (req, res) => {
  const id = parse(z.coerce.number().int().positive(), req.params.id);
  ok(res, await svc.updateRoom(id, parse(roomInput.partial(), req.body)));
});
