/** Route nhân viên thuộc module 6 – Công Thành: hóa đơn, thu tiền và xử lý ngoại lệ. */
import { Router } from "express";
import { z } from "zod";
import { parse } from "../../core/validate.js";
import { ok } from "../../core/http.js";
import { getIdempotencyKey, hashRequest, withIdempotency } from "../../core/idempotency.js";
import * as payments from "./payments.service.js";

export const paymentsStaffRouter = Router();
const idParam = z.coerce.number().int().positive();

paymentsStaffRouter.get("/bookings/:id/invoice", async (req, res) => ok(res, await payments.getInvoice(parse(idParam, req.params.id))));
paymentsStaffRouter.post("/bookings/:id/checkout", async (req, res) => {
  const key = getIdempotencyKey(req);
  const id = parse(idParam, req.params.id);
  const { method } = parse(z.object({ method: z.enum(["CASH", "TRANSFER"]) }), req.body);
  const result = await withIdempotency(req.user!.id, key, hashRequest(req), async () => ({ status: 201, body: await payments.checkout(id, method, key, req.user!) }));
  res.setHeader("Idempotent-Replayed", String(result.replayed));
  ok(res, result.body, result.status);
});
paymentsStaffRouter.post("/bookings/:id/end-early", async (req, res) => {
  const { reason } = parse(z.object({ reason: z.string().min(1).max(300) }), req.body);
  ok(res, await payments.endEarly(parse(idParam, req.params.id), reason, req.user!));
});
paymentsStaffRouter.post("/bookings/:id/adjustments", async (req, res) => {
  const body = parse(z.object({ kind: z.enum(["REDUCE", "WAIVE"]), amountVnd: z.number().int().positive().optional(), reason: z.string().min(1).max(300) }), req.body);
  ok(res, await payments.proposeAdjustment(parse(idParam, req.params.id), body.kind, body.amountVnd, body.reason, req.user!), 201);
});
