// Trang "hôm nay" của nhân viên – Dương (người 1).
import { mountLayout, $, setState } from "../shared/layout";
import { api } from "../shared/api";
import { requireRole } from "../shared/auth";
import type { Booking } from "../shared/types";

await mountLayout("Staff dashboard");
await requireRole("STAFF");
const box = $("#content");
setState(box, "loading");
try {
  const [today, overdue] = await Promise.all([api.get<Booking[]>("/api/staff/bookings"), api.get<Booking[]>("/api/staff/bookings/overdue")]);
  const count = (s: string) => today.filter((b) => b.status === s).length;
  box.innerHTML = `
    <a class="card" href="./schedule.html"><h2>Today's schedule</h2><p>${today.length} booking · ${count("CONFIRMED")} waiting · ${count("IN_USE")} in use · ${count("COMPLETED")} completed</p></a>
    <a class="card" href="./schedule.html#overdue"><h2>Overdue bookings requiring action</h2><p style="color:${overdue.length ? "var(--err)" : "inherit"}">${overdue.length} bookings</p></a>
    <a class="card" href="./walk-in.html"><h2>Walk-in booking</h2><p>Create a booking for a walk-in customer</p></a>
    <a class="card" href="./movie-preparation.html"><h2>Movie preparation</h2><p>Prepare movies before the session starts</p></a>
    <a class="card" href="./orders.html"><h2>Food orders</h2><p>Prepare and serve food orders</p></a>`;
} catch (e) {
  setState(box, "error", (e as Error).message);
}
