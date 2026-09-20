/**
 * Khung Express dùng chung (Dương – module 1). Mọi module gắn router ở đây.
 * Thứ tự middleware: bảo mật -> CORS -> body -> phiên -> log -> API -> static -> 404 -> lỗi.
 */
import express from "express";
import helmet from "helmet";
import cors from "cors";
import path from "node:path";
import { existsSync } from "node:fs";
import { pinoHttp } from "pino-http";
import { env, isProd, isTest } from "./config/env.js";
import { logger } from "./core/logger.js";
import { sessionMiddleware } from "./core/session.js";
import { errorHandler, notFoundHandler, ok } from "./core/http.js";
import { authRouter, meRouter } from "./modules/auth/auth.routes.js";
import { roomsRouter } from "./modules/rooms/rooms.routes.js";
import { moviesRouter } from "./modules/movies/movies.routes.js";
import { menuRouter } from "./modules/menu/menu.routes.js";
import { bookingsRouter, myBookingsRouter } from "./modules/bookings/bookings.routes.js";
import { staffRouter } from "./modules/staff/staff.routes.js";
import { adminRouter } from "./modules/admin/admin.routes.js";
import { paymentsStaffRouter } from "./modules/payments/payments.staff.routes.js";
import { paymentsManagerRouter } from "./modules/payments/payments.manager.routes.js";

export function createApp() {
  const app = express();
  app.set("trust proxy", 1);
  app.disable("x-powered-by");

  // CSP chỉ bật ở production (dev do Vite phục vụ); cho phép poster TMDB và ảnh phòng mẫu Picsum.
  app.use(helmet({
    contentSecurityPolicy: isProd
      ? {
          directives: {
            ...helmet.contentSecurityPolicy.getDefaultDirectives(),
            "img-src": ["'self'", "data:", "https://image.tmdb.org", "https://picsum.photos", "https://fastly.picsum.photos"],
          },
        }
      : false,
  }));
  app.use(cors({ origin: env.WEB_ORIGIN, credentials: true }));
  app.use(express.json({ limit: "200kb" }));
  app.use(sessionMiddleware);
  if (!isTest) app.use(pinoHttp({ logger, autoLogging: { ignore: (req) => req.url === "/api/health" } }));

  // ---- API (đặc tả trang 13) ----
  const api = express.Router();
  api.get("/health", (_req, res) => ok(res, { status: "ok", time: new Date().toISOString() }));
  api.use("/auth", authRouter);
  api.use("/me/bookings", myBookingsRouter);
  api.use("/me", meRouter);
  api.use("/rooms", roomsRouter);
  api.use("/movies", moviesRouter);
  api.use("/menu-items", menuRouter);
  api.use("/bookings", bookingsRouter);
  api.use("/staff", staffRouter);
  api.use("/admin", adminRouter);
  api.use("/staff", paymentsStaffRouter);
  api.use("/manager", paymentsManagerRouter);
  app.use("/api", api);

  // ---- Bản build của frontend (production): backend phục vụ thư mục frontend/dist ----
  const dist = path.resolve(process.cwd(), "../frontend/dist");
  if (isProd && existsSync(dist)) {
    app.use(express.static(dist, { extensions: ["html"] }));
  }

  app.use("/api", notFoundHandler);
  app.use(errorHandler);
  return app;
}
