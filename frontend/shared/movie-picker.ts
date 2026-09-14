/**
 * Ô chọn phim dùng chung (Thành Lê – người 4): tìm theo tên, lọc thể loại, phân trang "Xem thêm".
 * Kho phim là phim THẬT nhập từ The Movies Dataset (vài nghìn phim) nên không tải toàn bộ danh sách.
 * Dùng ở: booking.ts (bước 2), booking-view.ts (đổi phim), staff/walk-in.ts (khách tại quầy).
 *
 *   const picker = mountMoviePicker($("#movies"), { maxMinutes: 110, selectedId: null, allowNone: true, onSelect: (m) => ... });
 *
 * `maxMinutes` = gói − 10 phút (MOV03). Mặc định chỉ hiện phim vừa gói; bỏ tick "Chỉ phim vừa gói" thì hiện cả phim quá dài (bị mờ + không chọn được).
 */
import { api, qs } from "./api";
import { escapeHtml } from "./layout";
import type { Movie, Paged, GenreCount } from "./types";

export type MoviePickerOptions = {
  maxMinutes?: number;
  selectedId?: number | null;
  allowNone?: boolean;
  noneLabel?: string;
  limit?: number;
  onSelect: (movie: Movie | null) => void;
};

let uid = 0;

export function mountMoviePicker(host: HTMLElement, opts: MoviePickerOptions) {
  const name = `movie-pick-${++uid}`;
  const limit = opts.limit ?? 24;
  let selected: Movie | null = null;
  let selectedId = opts.selectedId ?? null;
  let page = 1;
  let total = 0;
  let items: Movie[] = [];
  let timer: number | undefined;
  let genresLoaded = false;

  host.innerHTML = `
    <div class="movie-picker">
      <div class="row">
        <div class="field" style="flex:2;min-width:200px"><label for="${name}-q">Tìm phim</label><input id="${name}-q" type="search" placeholder="Nhập tên phim…" autocomplete="off"></div>
        <div class="field"><label for="${name}-genre">Thể loại</label><select id="${name}-genre"><option value="">Tất cả</option></select></div>
        ${opts.maxMinutes ? `<label class="muted" style="padding-bottom:8px"><input type="checkbox" id="${name}-fit" checked> Chỉ phim vừa gói (≤ ${opts.maxMinutes} phút)</label>` : ""}
      </div>
      ${opts.allowNone ? `<label class="card"><input type="radio" name="${name}" value="" ${selectedId === null ? "checked" : ""}> ${escapeHtml(opts.noneLabel ?? "Chọn tại quán (chưa chọn phim)")}</label>` : ""}
      <p class="muted" id="${name}-count" aria-live="polite"></p>
      <div class="grid" id="${name}-grid"></div>
      <div class="row" style="margin-top:8px"><button type="button" class="secondary small hidden" id="${name}-more">Xem thêm</button></div>
    </div>`;
  const $q = host.querySelector<HTMLInputElement>(`#${name}-q`)!;
  const $genre = host.querySelector<HTMLSelectElement>(`#${name}-genre`)!;
  const $fit = host.querySelector<HTMLInputElement>(`#${name}-fit`);
  const $count = host.querySelector<HTMLElement>(`#${name}-count`)!;
  const $grid = host.querySelector<HTMLElement>(`#${name}-grid`)!;
  const $more = host.querySelector<HTMLButtonElement>(`#${name}-more`)!;

  function card(m: Movie): string {
    const tooLong = opts.maxMinutes !== undefined && m.durationMinutes > opts.maxMinutes;
    return `<label class="card movie-card" style="${tooLong ? "opacity:.5" : ""}">
      <input type="radio" name="${name}" value="${m.id}" ${tooLong ? "disabled" : ""} ${selectedId === m.id ? "checked" : ""}>
      ${m.posterUrl ? `<img src="${escapeHtml(m.posterUrl)}" alt="" loading="lazy" width="60" height="90" data-movie-poster style="float:right;margin-left:8px;border-radius:4px;object-fit:cover">` : ""}
      <strong>${escapeHtml(m.title)}</strong><br><span class="muted">${escapeHtml(m.genre)} · ${m.durationMinutes} phút · ${escapeHtml(m.ageLabel)}</span>
      ${tooLong ? `<br><span class="error-text">Quá dài (tối đa ${opts.maxMinutes} phút)</span>` : ""}</label>`;
  }

  function render(append: boolean) {
    const html = items.slice(append ? $grid.children.length : 0).map(card).join("");
    if (append) $grid.insertAdjacentHTML("beforeend", html); else $grid.innerHTML = html;
    $count.textContent = total ? `${total} phim · đang hiện ${items.length}` : "Không có phim phù hợp";
    $more.classList.toggle("hidden", items.length >= total);
    $grid.querySelectorAll<HTMLInputElement>("input[type=radio]").forEach((i) =>
      i.addEventListener("change", () => choose(items.find((m) => m.id === Number(i.value)) ?? null)),
    );
    $grid.querySelectorAll<HTMLImageElement>("img[data-movie-poster]").forEach((img) => img.addEventListener("error", () => img.remove(), { once: true }));
  }

  function choose(m: Movie | null) {
    selected = m;
    selectedId = m?.id ?? null;
    opts.onSelect(m);
  }

  async function load(next = false) {
    page = next ? page + 1 : 1;
    $count.textContent = "Đang tải…";
    try {
      const res = await api.get<Paged<Movie>>(`/api/movies${qs({
        q: $q.value.trim() || undefined, genre: $genre.value || undefined, page, limit,
        maxMinutes: opts.maxMinutes && (!$fit || $fit.checked) ? opts.maxMinutes : undefined,
      })}`);
      total = res.total;
      items = next ? items.concat(res.items) : res.items;
      // Giữ phim đã chọn ở đầu danh sách nếu nó không thuộc trang đang xem
      if (!next && selected && !items.some((m) => m.id === selected!.id)) items = [selected, ...items];
      render(next);
    } catch (e) {
      $count.textContent = `Lỗi tải phim: ${(e as Error).message}`;
    }
  }

  async function loadGenres() {
    if (genresLoaded) return;
    genresLoaded = true;
    try {
      const g = await api.get<GenreCount[]>("/api/movies/genres");
      $genre.insertAdjacentHTML("beforeend", g.map((x) => `<option value="${escapeHtml(x.genre)}">${escapeHtml(x.genre)} (${x.count})</option>`).join(""));
    } catch {
      /* không chặn việc chọn phim */
    }
  }

  $q.addEventListener("input", () => { window.clearTimeout(timer); timer = window.setTimeout(() => void load(), 300); });
  $genre.addEventListener("change", () => void load());
  $fit?.addEventListener("change", () => void load());
  $more.addEventListener("click", () => void load(true));
  host.querySelector<HTMLInputElement>(`input[name=${name}][value=""]`)?.addEventListener("change", () => choose(null));

  // Nạp phim đang chọn (từ booking cũ) để hiện đúng tên dù không nằm trong trang đầu
  const initial = selectedId ? api.get<Movie>(`/api/movies/${selectedId}`).then((m) => (selected = m)).catch(() => null) : Promise.resolve(null);
  void initial.then(() => Promise.all([loadGenres(), load()]));

  return { get selected() { return selected; }, get selectedId() { return selectedId; }, reload: () => load() };
}
