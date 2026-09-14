// Khách tại quầy (UC04) – Hải Anh (người 3). POST /api/staff/bookings với Idempotency-Key.
import { mountLayout, $, formData, run, toast } from "../shared/layout";
import { api, newIdempotencyKey } from "../shared/api";
import { requireRole } from "../shared/auth";
import { todayVn, startTimeOptions } from "../shared/format";
import type { Room, Booking } from "../shared/types";
import { mountMoviePicker } from "../shared/movie-picker";

await mountLayout("Khách tại quầy");
await requireRole("STAFF");
const form = $<HTMLFormElement>("#walkin-form");
const rooms = await api.get<Room[]>("/api/rooms");
$("#roomId").innerHTML = rooms.map((r) => `<option value="${r.id}">${r.name} (tối đa ${r.capacity})</option>`).join("");
const date = $<HTMLInputElement>("#date"); date.value = todayVn(); date.min = todayVn();
const duration = $<HTMLSelectElement>("#duration");
const startTime = $<HTMLSelectElement>("#startTime");
const fill = () => (startTime.innerHTML = startTimeOptions(Number(duration.value)).map((t) => `<option value="${t}">${t}</option>`).join(""));
duration.addEventListener("change", fill); fill();
// Phim tùy chọn: kho phim thật vài nghìn phim → ô tìm kiếm (shared/movie-picker.ts). Khách tại quầy thường "chọn tại quán".
let movieId: number | null = null;
$("#btn-pick-movie").addEventListener("click", () => {
  $("#movie-picker").classList.remove("hidden");
  $("#btn-pick-movie").classList.add("hidden");
  mountMoviePicker($("#movie-picker"), { maxMinutes: Number(duration.value) - 10, selectedId: null, allowNone: true, onSelect: (m) => (movieId = m?.id ?? null) });
});

let key = newIdempotencyKey();
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = formData(form);
  await run(async () => {
    const b = await api.post<Booking>("/api/staff/bookings", { roomId: Number(f.roomId), date: f.date, startTime: f.startTime, duration: Number(f.duration), guests: Number(f.guests),
      contactName: f.contactName, contactPhone: f.contactPhone, movieId }, { idempotencyKey: key });
    key = newIdempotencyKey();
    movieId = null;
    toast(`Đã tạo booking ${b.code}`, "success");
    $("#result").innerHTML = `<p class="card">Booking <strong>${b.code}</strong> – <a href="./booking-detail.html?id=${b.id}">mở chi tiết để check-in</a></p>`;
  }, form.querySelector("button"));
});
