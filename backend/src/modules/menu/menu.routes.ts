/**
 * Module 5 – Menu và đơn món (Sơn). API trang 13:
 *   GET /api/menu-items (công khai, chỉ món đang bán)
 *   /api/staff/bookings/:id/orders, /api/staff/orders/:id/status -> staff.routes.ts
 *   /api/admin/menu-items -> admin.routes.ts
 */
import { Router } from "express";
import { z } from "zod";
import { parse } from "../../core/validate.js";
import { ok } from "../../core/http.js";
import * as svc from "./menu.service.js";

export const menuRouter = Router();
menuRouter.get("/", async (_req, res) => ok(res, await svc.listMenu()));

export const adminMenuRouter = Router();
const menuInput = z.object({
  name: z.string().trim().min(1).max(100),
  category: z.enum(["DRINK", "SNACK", "FOOD"]),
  imageUrl: z.string().url().max(500).nullable().optional(),
  priceVnd: z.number().int().min(0),
  isActive: z.boolean().optional(),
});
adminMenuRouter.get("/", async (_req, res) => ok(res, await svc.listMenu(true)));
adminMenuRouter.post("/", async (req, res) => ok(res, await svc.createMenuItem(parse(menuInput, req.body)), 201));
adminMenuRouter.patch("/:id", async (req, res) => {
  const id = parse(z.coerce.number().int().positive(), req.params.id);
  ok(res, await svc.updateMenuItem(id, parse(menuInput.partial(), req.body)));
});
