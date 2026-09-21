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
  let requestSeq = 0;
  let pinnedSelection = false;
  let selectionHiddenByFilter = false;

  host.innerHTML = `
    <div class="movie-picker">
      <div class="row">
        <div class="field movie-search"><label for="${name}-q">Search movies</label><input id="${name}-q" type="search" placeholder="Enter a movie title…" autocomplete="off"></div>
        <div class="field"><label for="${name}-genre">Genre</label><select id="${name}-genre"><option value="">All</option></select></div>
        ${opts.maxMinutes ? `<label class="muted fit-filter"><input type="checkbox" id="${name}-fit" checked> Only movies that fit this session (≤ ${opts.maxMinutes} min)</label>` : ""}
      </div>
      ${opts.allowNone ? `<label class="card"><input type="radio" name="${name}" value="" ${selectedId === null ? "checked" : ""}> ${escapeHtml(opts.noneLabel ?? "Choose at the café (no movie selected)")}</label>` : ""}
      <p class="muted" id="${name}-count" aria-live="polite"></p>
      <div class="grid" id="${name}-grid"></div>
      <div class="row action-row"><button type="button" class="secondary small hidden" id="${name}-more">Show more</button></div>
    </div>`;
  const $q = host.querySelector<HTMLInputElement>(`#${name}-q`)!;
  const $genre = host.querySelector<HTMLSelectElement>(`#${name}-genre`)!;
  const $fit = host.querySelector<HTMLInputElement>(`#${name}-fit`);
  const $count = host.querySelector<HTMLElement>(`#${name}-count`)!;
  const $grid = host.querySelector<HTMLElement>(`#${name}-grid`)!;
  const $more = host.querySelector<HTMLButtonElement>(`#${name}-more`)!;

  function card(m: Movie): string {
    const tooLong = opts.maxMinutes !== undefined && m.durationMinutes > opts.maxMinutes;
    const unavailable = !m.isActive;
    const disabled = tooLong || unavailable;
    const description = m.description.trim();
    const summary = description.length > 160 ? `${description.slice(0, 157)}…` : description;
    return `<label class="card movie-card${disabled ? " is-disabled" : ""}">
      <input type="radio" name="${name}" value="${m.id}" ${disabled ? "disabled" : ""} ${selectedId === m.id ? "checked" : ""}>
      ${m.posterUrl ? `<img class="movie-poster" src="${escapeHtml(m.posterUrl)}" alt="Poster for ${escapeHtml(m.title)}" loading="lazy" width="60" height="90" data-movie-poster>` : ""}
      <strong>${escapeHtml(m.title)}</strong><br><span class="muted">${escapeHtml(m.genre)} · ${m.durationMinutes} min · ${escapeHtml(m.ageLabel)}</span>
      ${summary ? `<p class="muted movie-summary">${escapeHtml(summary)}</p>` : ""}
      ${tooLong ? `<span class="error-text">Too long (maximum ${opts.maxMinutes} min)</span>` : ""}
      ${unavailable ? '<span class="error-text">No longer available</span>' : ""}</label>`;
  }

  function render(append: boolean) {
    const html = items.slice(append ? $grid.children.length : 0).map(card).join("");
    if (append) $grid.insertAdjacentHTML("beforeend", html); else $grid.innerHTML = html;
    const matchingShown = items.length - (pinnedSelection ? 1 : 0);
    $count.textContent = total
      ? `${total} matching movies · showing ${matchingShown}${pinnedSelection ? " + current selection" : ""}${selectionHiddenByFilter && selected ? ` · current selection: ${selected.title} (hidden by filters)` : ""}`
      : selectionHiddenByFilter && selected
        ? `No matching movies · current selection: ${selected.title} (hidden by filters)`
        : "No matching movies";
    $more.classList.toggle("hidden", matchingShown >= total);
    $grid.querySelectorAll<HTMLInputElement>("input[type=radio]").forEach((i) =>
      i.addEventListener("change", () => choose(items.find((m) => m.id === Number(i.value)) ?? null)),
    );
    $grid.querySelectorAll<HTMLImageElement>("img[data-movie-poster]").forEach((img) => img.addEventListener("error", () => img.remove(), { once: true }));
  }

  function choose(m: Movie | null) {
    const pinnedId = pinnedSelection ? items[0]?.id : null;
    selected = m;
    selectedId = m?.id ?? null;
    selectionHiddenByFilter = Boolean(m && !items.some((item) => item.id === m.id));
    if (pinnedId && pinnedId !== m?.id) {
      items = items.filter((item) => item.id !== pinnedId);
      pinnedSelection = false;
    }
    render(false);
    opts.onSelect(m);
  }

  async function load(next = false) {
    const requestedPage = next ? page + 1 : 1;
    const requestId = ++requestSeq;
    $more.disabled = true;
    $count.textContent = "Loading…";
    try {
      const res = await api.get<Paged<Movie>>(`/api/movies${qs({
        q: $q.value.trim() || undefined, genre: $genre.value || undefined, page: requestedPage, limit,
        maxMinutes: opts.maxMinutes && (!$fit || $fit.checked) ? opts.maxMinutes : undefined,
      })}`);
      if (requestId !== requestSeq) return;
      page = requestedPage;
      total = res.total;
      if (next) {
        const existingIds = new Set(items.map((m) => m.id));
        items = items.concat(res.items.filter((m) => !existingIds.has(m.id)));
        if (selectionHiddenByFilter && selected && items.some((m) => m.id === selected!.id)) selectionHiddenByFilter = false;
      } else {
        items = res.items;
        pinnedSelection = false;
        selectionHiddenByFilter = false;
        const explicitFilter = Boolean($q.value.trim() || $genre.value);
        if (selected && !items.some((m) => m.id === selected!.id)) {
          if (explicitFilter) selectionHiddenByFilter = true;
          else { items = [selected, ...items]; pinnedSelection = true; }
        }
      }
      render(next);
    } catch (e) {
      if (requestId !== requestSeq) return;
      $count.innerHTML = `Could not load movies: ${escapeHtml((e as Error).message)} <button type="button" class="small secondary" data-movie-retry>Retry</button>`;
      $count.querySelector<HTMLButtonElement>("[data-movie-retry]")?.addEventListener("click", () => void load(next));
    } finally {
      if (requestId === requestSeq) $more.disabled = false;
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
