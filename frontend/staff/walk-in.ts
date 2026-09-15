// Khách tại quầy (UC04) – Hải Anh (người 3). POST /api/staff/bookings với Idempotency-Key.
import { mountLayout, $, escapeHtml, formData, toast } from "../shared/layout";
import { api, ApiError, newIdempotencyKey } from "../shared/api";
import { requireRole } from "../shared/auth";
import { money, todayVn, startTimeOptions } from "../shared/format";
import type { Room, Booking } from "../shared/types";
import { mountMoviePicker } from "../shared/movie-picker";
import { mountMenuPicker } from "../shared/menu-picker";

await mountLayout("Walk-in booking");
await requireRole("STAFF");

const form = $<HTMLFormElement>("#walkin-form");
const rooms = await api.get<Room[]>("/api/rooms");
const roomSelect = $<HTMLSelectElement>("#roomId");
const guestInput = $<HTMLInputElement>("#guests");
const date = $<HTMLInputElement>("#date");
const duration = $<HTMLSelectElement>("#duration");
const startTime = $<HTMLSelectElement>("#startTime");
const createButton = $<HTMLButtonElement>("#btn-create");

roomSelect.innerHTML = rooms
  .map(
    (room) =>
      `<option value="${room.id}">${escapeHtml(room.name)} (up to ${room.capacity})</option>`,
  )
  .join("");
date.value = todayVn();
date.min = todayVn();

function selectedRoom(): Room | undefined {
  return rooms.find((room) => room.id === Number(roomSelect.value));
}

function updateCapacity() {
  const capacity = selectedRoom()?.capacity ?? 1;
  guestInput.max = String(capacity);
  if (Number(guestInput.value) > capacity) guestInput.value = String(capacity);
  $("#capacity-hint").textContent = `Maximum ${capacity} guests for this room`;
  updateEstimate();
}

function fillStartTimes() {
  const options = startTimeOptions(Number(duration.value)).filter((time) => {
    if (date.value !== todayVn()) return true;
    return new Date(`${date.value}T${time}:00+07:00`).getTime() >= Date.now();
  });
  startTime.innerHTML = options.length
    ? options.map((time) => `<option value="${time}">${time}</option>`).join("")
    : '<option value="">No valid start times remaining today</option>';
  startTime.disabled = !options.length;
  createButton.disabled = !options.length;
}

let movieId: number | null = null;
let moviePickerMounted = false;

function resetMoviePicker() {
  movieId = null;
  moviePickerMounted = false;
  $("#movie-picker").innerHTML = "";
  $("#movie-picker").classList.add("hidden");
  $("#btn-pick-movie").classList.remove("hidden");
}

$("#btn-pick-movie").addEventListener("click", () => {
  if (moviePickerMounted) return;
  moviePickerMounted = true;
  $("#movie-picker").classList.remove("hidden");
  $("#btn-pick-movie").classList.add("hidden");
  mountMoviePicker($("#movie-picker"), {
    maxMinutes: Number(duration.value) - 10,
    selectedId: movieId,
    allowNone: true,
    onSelect: (movie) => (movieId = movie?.id ?? null),
  });
});

const menuPicker = await mountMenuPicker($("#menu-picker"));

function updateEstimate() {
  const room = selectedRoom();
  const roomTotal = room
    ? Math.round((room.hourlyPriceVnd * Number(duration.value)) / 60)
    : 0;
  $("#estimate").innerHTML =
    `<strong>Estimated total: ${money(roomTotal + menuPicker.totalVnd)}</strong><br><span class="muted">Room ${money(roomTotal)} · Food ${money(menuPicker.totalVnd)}</span>`;
}

roomSelect.addEventListener("change", updateCapacity);
date.addEventListener("change", fillStartTimes);
duration.addEventListener("change", () => {
  fillStartTimes();
  resetMoviePicker();
  updateEstimate();
});
$("#menu-picker").addEventListener("input", updateEstimate);
updateCapacity();
fillStartTimes();
updateEstimate();

let key = newIdempotencyKey();
form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const values = formData(form);
  const room = selectedRoom();
  if (!room || !startTime.value) return;

  const roomTotal = Math.round(
    (room.hourlyPriceVnd * Number(values.duration)) / 60,
  );
  createButton.disabled = true;
  try {
    const booking = await api.post<Booking>(
      "/api/staff/bookings",
      {
        roomId: Number(values.roomId),
        date: values.date,
        startTime: values.startTime,
        duration: Number(values.duration),
        guests: Number(values.guests),
        contactName: values.contactName,
        contactPhone: values.contactPhone,
        note: values.note || undefined,
        movieId,
        items: menuPicker.items,
        expectedTotalVnd: roomTotal + menuPicker.totalVnd,
      },
      { idempotencyKey: key },
    );
    key = newIdempotencyKey();
    toast(`Booking ${booking.code} created`, "success");
    $("#result").innerHTML =
      `<p class="card">Booking <strong>${escapeHtml(booking.code)}</strong> – <a href="./booking-detail.html?id=${booking.id}">open details to check in</a></p>`;
  } catch (error) {
    if (error instanceof ApiError && error.code === "ROOM_TAKEN") {
      const suggest = (error.details as { suggest?: string | null } | undefined)
        ?.suggest;
      const suffix = suggest
        ? ` Nearest available time: ${new Date(suggest).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Ho_Chi_Minh" })}.`
        : " No later slot is available today.";
      toast(`${error.message}${suffix}`, "error");
      key = newIdempotencyKey();
    } else if (
      error instanceof ApiError &&
      error.code === "IDEMPOTENCY_KEY_REUSED"
    ) {
      key = newIdempotencyKey();
      toast(error.message, "error");
    } else if (error instanceof Error && error.message !== "redirecting") {
      toast(error.message, "error");
    }
  } finally {
    createButton.disabled = !startTime.value;
  }
});
