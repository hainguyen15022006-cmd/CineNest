import { Router } from "express";
import { z } from "zod";
import { parse } from "../../core/validate.js";
import { ok } from "../../core/http.js";
import { requireManager } from "../../core/auth.js";
import * as payments from "./payments.service.js";
import * as reportsService from "./reports.service.js";

export const paymentsManagerRouter = Router();

// Enforce strict MANAGER role access
paymentsManagerRouter.use(requireManager);

const idParam = z.coerce.number().int().positive();

/** Fetch pending adjustment proposals */
paymentsManagerRouter.get("/adjustments/pending", async (_req, res) => {
  ok(res, await payments.listPendingAdjustments());
});

/** Approve (approve = true) or Reject (approve = false) an adjustment proposal */
paymentsManagerRouter.post("/adjustments/:id/decide", async (req, res) => {
  const adjustmentId = parse(idParam, req.params.id);
  const { approve, note } = parse(
    z.object({
      approve: z.boolean(),
      note: z.string().max(300).optional(),
    }),
    req.body
  );

  const result = await payments.decideAdjustment(adjustmentId, approve, req.user!, note);
  ok(res, result);
});

/** Fetch DB-reconciled operational and financial reports */
paymentsManagerRouter.get("/reports", async (req, res) => {
  const query = parse(
    z.object({
      from: z.string().optional(),
      to: z.string().optional(),
    }),
    req.query
  );

  const reports = await reportsService.getReports(query.from, query.to);
  ok(res, reports);
});