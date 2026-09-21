// Trang quản trị – Dương (người 1).
import { mountLayout, $, setState } from "../shared/layout";
import { api } from "../shared/api";
import { requireRole } from "../shared/auth";

await mountLayout("Management");
await requireRole("MANAGER");
const box = $("#content");
setState(box, "loading");
try {
  const pending = await api.get<unknown[]>("/api/admin/adjustments");
  box.innerHTML = `
    <a class="card" href="./adjustments.html"><h2>Adjustment approvals</h2><p class="stat-number${pending.length ? " error-text" : ""}">${pending.length}</p><p class="muted">requests awaiting approval</p></a>
    <a class="card" href="./reports.html"><h2>Reports</h2><p>Bookings, revenue, room hours, unpaid and waived bookings</p></a>
    <a class="card" href="./rooms.html"><h2>Rooms and pricing</h2></a>
    <a class="card" href="./movies.html"><h2>Movies</h2></a>
    <a class="card" href="./menu.html"><h2>Menu</h2></a>
    <a class="card" href="./employees.html"><h2>Staff</h2></a>
    <a class="card" href="../staff/schedule.html"><h2>Room schedule (staff view)</h2></a>`;
} catch (e) {
  setState(box, "error", (e as Error).message);
}
