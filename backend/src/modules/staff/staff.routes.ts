/**
 * Bộ định tuyến khu vực nhân viên. File tích hợp này chỉ gắn router con để
 * Hải Anh, Thành Lê, Sơn và Công Thành không phải cùng sửa một file.
 */
import { Router } from "express";
import { requireStaff } from "../../core/auth.js";
import { bookingsStaffRouter } from "../bookings/bookings.staff.routes.js";
import { moviesStaffRouter } from "../movies/movies.staff.routes.js";
import { menuStaffRouter } from "../menu/menu.staff.routes.js";
import { paymentsStaffRouter } from "../payments/payments.staff.routes.js";

export const staffRouter = Router();
staffRouter.use(requireStaff);
staffRouter.use(bookingsStaffRouter);
staffRouter.use(moviesStaffRouter);
staffRouter.use(menuStaffRouter);
staffRouter.use(paymentsStaffRouter);
