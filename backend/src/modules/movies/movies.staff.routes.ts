/** Route nhân viên thuộc module 4 – Thành Lê: danh sách và trạng thái chuẩn bị phim. */
import { Router } from "express";
import { z } from "zod";
import { parse } from "../../core/validate.js";
import { ok } from "../../core/http.js";
import { vnToDate, addMinutes, todayVn } from "../../core/time.js";
import * as movies from "./movies.service.js";

export const moviesStaffRouter = Router();
const idParam = z.coerce.number().int().positive();
const dateQuery = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() });

moviesStaffRouter.get("/preparation", async (req, res) => {
  const { date } = parse(dateQuery, req.query);
  const start = vnToDate(date ?? todayVn(), "00:00");
  ok(res, await movies.listPreparation(start, addMinutes(start, 24 * 60)));
});
moviesStaffRouter.patch("/bookings/:id/preparation", async (req, res) => {
  const body = parse(z.object({ status: z.enum(["READY", "UNAVAILABLE", "PENDING"]), expectedVersion: z.number().int().min(0) }), req.body);
  ok(res, await movies.setPreparation(parse(idParam, req.params.id), body.status, body.expectedVersion, req.user!.id));
});
