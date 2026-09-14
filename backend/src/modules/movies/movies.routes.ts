/**
 * Module 4 – Phim (Thành Lê). API trang 13:
 *   GET /api/movies?q&genre&maxMinutes&page&limit -> { items, total, page, limit }   (công khai, chỉ phim ACTIVE)
 *   GET /api/movies/genres -> [{ genre, count }]      GET /api/movies/:id
 *   PATCH /api/bookings/:id/movie -> bookings.routes.ts (gọi changeMovie của module này)
 *   /api/staff/bookings/:id/preparation -> staff.routes.ts ; /api/admin/movies -> admin.routes.ts
 */
import { Router } from "express";
import { z } from "zod";
import { parse } from "../../core/validate.js";
import { ok } from "../../core/http.js";
import * as svc from "./movies.service.js";

export const moviesRouter = Router();

const listQuery = z.object({
  q: z.string().max(100).optional(),
  genre: z.string().max(50).optional(),
  maxMinutes: z.coerce.number().int().positive().optional(),
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});
moviesRouter.get("/", async (req, res) => ok(res, await svc.listMovies(parse(listQuery, req.query))));
moviesRouter.get("/genres", async (_req, res) => ok(res, await svc.listGenres()));
moviesRouter.get("/:id", async (req, res) => ok(res, await svc.getMovie(parse(z.coerce.number().int().positive(), req.params.id))));

export const adminMoviesRouter = Router();
const movieInput = z.object({
  title: z.string().trim().min(1).max(200),
  genre: z.string().trim().min(1).max(50),
  durationMinutes: z.number().int().min(1).max(600),
  ageLabel: z.string().trim().min(1).max(10),
  description: z.string().max(2000).optional(),
  posterUrl: z.string().url().max(500).nullable().optional(),
  isActive: z.boolean().optional(),
});
adminMoviesRouter.get("/", async (req, res) => ok(res, await svc.listMovies({ ...parse(listQuery, req.query), includeInactive: true })));
adminMoviesRouter.post("/", async (req, res) => ok(res, await svc.createMovie(parse(movieInput, req.body)), 201));
adminMoviesRouter.patch("/:id", async (req, res) => {
  const id = parse(z.coerce.number().int().positive(), req.params.id);
  ok(res, await svc.updateMovie(id, parse(movieInput.partial(), req.body)));
});
