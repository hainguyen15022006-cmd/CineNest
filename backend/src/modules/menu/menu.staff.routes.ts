/** Route nhân viên thuộc module 5 – Sơn: tạo đơn món và cập nhật trạng thái phục vụ. */
import { Router } from "express";
import { z } from "zod";
import { parse } from "../../core/validate.js";
import { ok } from "../../core/http.js";
import * as menu from "./menu.service.js";

export const menuStaffRouter = Router();
const idParam = z.coerce.number().int().positive();

menuStaffRouter.get("/orders", async (req, res) => {
  const { status } = parse(z.object({ status: z.enum(["PENDING", "PREPARING", "SERVED", "CANCELLED"]).optional() }), req.query);
  ok(res, await menu.listOrders(status));
});
menuStaffRouter.post("/bookings/:id/orders", async (req, res) => {
  const { items } = parse(z.object({ items: z.array(z.object({ menuItemId: z.number().int().positive(), quantity: z.number().int().min(1).max(20) })).min(1).max(30) }), req.body);
  ok(res, await menu.addOrder(parse(idParam, req.params.id), items, req.user!.id), 201);
});
menuStaffRouter.patch("/orders/:id/status", async (req, res) => {
  const { status } = parse(z.object({ status: z.enum(["PREPARING", "SERVED", "CANCELLED"]) }), req.body);
  ok(res, await menu.setOrderStatus(parse(idParam, req.params.id), status));
});
