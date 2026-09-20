// Đặt phòng 4 bước trong MỘT trang – Hải Anh (người 3).
// Bước 2 dùng movie-picker của Thành Lê; bước 3 dùng menu-picker của Sơn.
// File này chỉ điều phối bốn bước để hai module có thể phát triển độc lập.
import { mountLayout, $, escapeHtml, run, toast, formData } from "./shared/layout";
import { api, ApiError, newIdempotencyKey } from "./shared/api";
import { requireRole } from "./shared/auth";
import { money } from "./shared/format";
import type { Room, Movie, Booking } from "./shared/types";
import { mountMoviePicker } from "./shared/movie-picker";
import { mountMenuPicker } from "./shared/menu-picker";

await mountLayout("Book a room");
const me = await requireRole("CUSTOMER"); // nhân viên đặt hộ dùng staff/walk-in.html

const p = new URLSearchParams(location.search);
const sel = {
  roomId: Number(p.get("roomId")), date: p.get("date") ?? "", startTime: p.get("startTime") ?? "", duration: Number(p.get("duration") ?? 120), guests: Number(p.get("guests") ?? 2),
  movieId: null as number | null,
};
if (!sel.roomId || !sel.date || !sel.startTime) location.replace("./index.html");

const room = await api.get<Room>(`/api/rooms/${sel.roomId}`);
let roomTotal = Math.round((room.hourlyPriceVnd * sel.duration) / 60);
let movie: Movie | null = null;
let menuPicker: Awaited<ReturnType<typeof mountMenuPicker>> | null = null;
let step = 1;

$("#summary").innerHTML = `<strong>${escapeHtml(room.name)}</strong> · ${sel.date} ${sel.startTime} · ${sel.duration / 60}-hour session · ${sel.guests} guests · Room charge <strong>${money(roomTotal)}</strong>`;

// ---- Bước 2: phim (Thành Lê) – chỉ phim ACTIVE và dài <= gói - 10 phút (MOV02, MOV03); tìm kiếm + phân trang trong shared/movie-picker.ts ----
let pickerMounted = false;
function renderMovieStep() {
  if (pickerMounted) return;
  pickerMounted = true;
  mountMoviePicker($("#movies"), {
    maxMinutes: sel.duration - 10, selectedId: sel.movieId, allowNone: true,
    onSelect: (m) => { movie = m; sel.movieId = m?.id ?? null; },
  });
}

// ---- Bước 3: món (Sơn) ----
async function renderMenuStep() {
  menuPicker ??= await mountMenuPicker($("#menu"));
}

function renderReview() {
  $("#review").innerHTML = `<table><tbody>
    <tr><td>Room ${escapeHtml(room.name)} · ${sel.date} ${sel.startTime} · ${sel.duration / 60}-hour session</td><td class="right">${money(roomTotal)}</td></tr>
    <tr><td>Movie: ${movie ? escapeHtml(movie.title) : "Choose at the café"}</td><td class="right">${money(0)}</td></tr>
    ${(menuPicker?.lines ?? []).map(({ item, quantity }) => `<tr><td>${escapeHtml(item.name)} × ${quantity}</td><td class="right">${money(item.priceVnd * quantity)}</td></tr>`).join("")}
    <tr><th>Estimated total</th><th class="right">${money(roomTotal + (menuPicker?.totalVnd ?? 0))}</th></tr></tbody></table>`;
  ($("#contactName") as HTMLInputElement).value ||= me.name;
  ($("#contactPhone") as HTMLInputElement).value ||= me.phone;
}

async function show(n: number) {
  step = Math.min(4, Math.max(1, n));
  document.querySelectorAll<HTMLElement>(".steps span").forEach((s) => s.classList.toggle("active", Number(s.dataset.step) === step));
  [2, 3, 4].forEach((i) => $(`#step-${i}`).classList.toggle("hidden", i !== step));
  $("#btn-next").classList.toggle("hidden", step === 4);
  $("#btn-prev").classList.toggle("hidden", step === 1);
  if (step === 2) renderMovieStep();
  if (step === 3) await renderMenuStep();
  if (step === 4) renderReview();
}
$("#btn-next").addEventListener("click", () => void show(step + 1));
$("#btn-prev").addEventListener("click", () => void show(step - 1));
await show(2);

// ---- Bước 4: xác nhận với Idempotency-Key; 409 trùng -> gợi ý; 409 giá đổi -> xác nhận lại ----
let idemKey = newIdempotencyKey(); // giữ nguyên khi thử lại sau lỗi mạng (T10)
$<HTMLFormElement>("#confirm-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = formData($<HTMLFormElement>("#confirm-form"));
  const body = { roomId: sel.roomId, date: sel.date, startTime: sel.startTime, duration: sel.duration, guests: sel.guests, contactName: f.contactName, contactPhone: f.contactPhone,
    note: f.note || undefined, movieId: sel.movieId, items: menuPicker?.items ?? [], expectedTotalVnd: roomTotal + (menuPicker?.totalVnd ?? 0) };
  const btn = $<HTMLButtonElement>("#btn-confirm");
  btn.disabled = true;
  try {
    const b = await api.post<Booking>("/api/bookings", body, { idempotencyKey: idemKey });
    toast(`Booking ${b.code} created successfully`, "success");
    location.href = `./booking-view.html?code=${encodeURIComponent(b.code)}`;
  } catch (err) {
    if (err instanceof ApiError && err.code === "ROOM_TAKEN") {
      const suggest = (err.details as { suggest?: string } | undefined)?.suggest;
      toast(`This time slot was just booked.${suggest ? ` Nearest available time: ${new Date(suggest).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Ho_Chi_Minh" })}` : ""}`, "error");
      idemKey = newIdempotencyKey();
    } else if (err instanceof ApiError && err.code === "PRICE_CHANGED") {
      const details = err.details as
        | { roomTotalVnd?: number; itemsTotalVnd?: number; totalVnd?: number }
        | undefined;
      const selectedItems = menuPicker?.items ?? [];
      if (typeof details?.roomTotalVnd === "number") roomTotal = details.roomTotalVnd;
      // Reload active menu items and their current prices, while preserving quantities.
      menuPicker = await mountMenuPicker($("#menu"), selectedItems);
      renderReview();
      toast("The price has changed. The latest prices are now displayed. Please review and confirm again.", "error");
      idemKey = newIdempotencyKey();
    } else if (err instanceof ApiError && err.code === "MENU_ITEM_UNAVAILABLE") {
      menuPicker = await mountMenuPicker($("#menu"), menuPicker?.items ?? []);
      renderReview();
      toast("An item is no longer available and was removed. Please review your order.", "error");
      idemKey = newIdempotencyKey();
    } else if (err instanceof ApiError && err.code === "MOVIE_UNAVAILABLE") {
      movie = null;
      sel.movieId = null;
      pickerMounted = false;
      $("#movies").innerHTML = "";
      await show(2);
      toast("The selected movie is no longer available. Please choose another movie or choose at the café.", "error");
      idemKey = newIdempotencyKey();
    } else if (err instanceof Error && err.message !== "redirecting") {
      toast(err.message, "error"); // lỗi mạng: giữ idemKey để thử lại nhận đúng kết quả cũ
    }
  } finally {
    btn.disabled = false;
  }
});
