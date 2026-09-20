/**
 * Khu vực quản lý /api/admin/* (chỉ MANAGER). Đặc tả trang 13.
 *  Module 1 (Dương):      /admin/staff            danh sách, tạo, khóa/mở nhân viên (khóa => xóa phiên)
 *  Module 2 (Chúc):       /admin/rooms            CRUD phòng, giá
 *  Module 4 (Thành Lê):   /admin/movies           CRUD phim
 *  Module 5 (Sơn):        /admin/menu-items       CRUD menu
 *  Module 6 (Công Thành): /admin/adjustments      hàng đợi duyệt; approve | reject
 *                         /admin/reports/*        bookings, revenue, room-hours, unpaid-waived
 */
import { Router } from "express";
import { z } from "zod";
import { parse } from "../../core/validate.js";
import { ok } from "../../core/http.js";
import { requireManager } from "../../core/auth.js";
import { vnToDate, addMinutes, todayVn, dateToVn } from "../../core/time.js";
import * as auth from "../auth/auth.service.js";
import { adminRoomsRouter } from "../rooms/rooms.routes.js";
import { adminMoviesRouter } from "../movies/movies.routes.js";
import { adminMenuRouter } from "../menu/menu.routes.js";
import * as payments from "../payments/payments.service.js";
import * as reports from "../reports/reports.service.js";

export const adminRouter = Router();
adminRouter.use(requireManager);

const idParam = z.coerce.number().int().positive();

// ---- Module 1 – nhân viên ----
adminRouter.get("/staff", async (_req, res) => ok(res, await auth.listStaff()));
adminRouter.post("/staff", async (req, res) => {
  const body = parse(
    z.object({
      name: z.string().trim().min(2).max(100),
      email: z.string().trim().email(),
      phone: z.string().trim().regex(/^0\d{9,10}$/),
      password: z.string().min(8).max(100),
      role: z.enum(["STAFF", "MANAGER"]).default("STAFF"),
    }),
    req.body,
  );
  ok(res, await auth.createStaff(body), 201);
});
adminRouter.patch("/staff/:id/active", async (req, res) => {
  const { isActive } = parse(z.object({ isActive: z.boolean() }), req.body);
  ok(res, await auth.setActive(parse(idParam, req.params.id), isActive, req.user!.id));
});

// ---- Module 2, 4, 5 – danh mục ----
adminRouter.use("/rooms", adminRoomsRouter);
adminRouter.use("/movies", adminMoviesRouter);
adminRouter.use("/menu-items", adminMenuRouter);

// ---- Module 6 – duyệt điều chỉnh ----
adminRouter.get("/adjustments", async (_req, res) => ok(res, await payments.listPendingAdjustments()));
adminRouter.post("/adjustments/:id/approve", async (req, res) => {
  const { note } = parse(z.object({ note: z.string().max(300).optional() }), req.body ?? {});
  ok(res, await payments.decideAdjustment(parse(idParam, req.params.id), true, req.user!, note));
});
adminRouter.post("/adjustments/:id/reject", async (req, res) => {
  const { note } = parse(z.object({ note: z.string().max(300).optional() }), req.body ?? {});
  ok(res, await payments.decideAdjustment(parse(idParam, req.params.id), false, req.user!, note));
});

// ---- Module 6 – báo cáo ----
const rangeSchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
}).refine((value) => !value.from || !value.to || value.from <= value.to, {
  message: "The start date must not be after the end date",
  path: ["from"],
});
function range(q: { from?: string; to?: string }) {
  const to = q.to ?? todayVn();
  const from = q.from ?? dateToVn(addMinutes(vnToDate(to, "00:00"), -29 * 24 * 60)).date;
  return { from: vnToDate(from, "00:00"), to: addMinutes(vnToDate(to, "00:00"), 24 * 60) };
}
adminRouter.get("/reports/bookings", async (req, res) => ok(res, await reports.bookingsByDay(range(parse(rangeSchema, req.query)))));
adminRouter.get("/reports/revenue", async (req, res) => ok(res, await reports.revenue(range(parse(rangeSchema, req.query)))));
adminRouter.get("/reports/room-hours", async (req, res) => ok(res, await reports.roomHours(range(parse(rangeSchema, req.query)))));
adminRouter.get("/reports/unpaid-waived", async (req, res) => ok(res, await reports.unpaidAndWaived(range(parse(rangeSchema, req.query)))));
