/**
 * Nhập phim THẬT từ file CSV vào bảng movie (Thành Lê – người 4). Tách khỏi seed để kiểm thử vẫn nhanh.
 * Nguồn nhóm đã chốt: "The Movies Dataset" trên Kaggle (rounakbanik/the-movies-dataset) → file movies_metadata.csv (45.466 phim).
 *
 *   npm run db:import-movies -- --file data/movies_metadata.csv                # The Movies Dataset (Kaggle) – nguồn chính
 *   npm run db:import-movies -- --file data/ml-latest-small/movies.csv --assume-runtime   # MovieLens (không có thời lượng) – dự phòng
 *   npm run db:import-movies -- --file data/phim.csv                           # CSV chung: cột title, runtime, genre(s), [overview, poster, year, age]
 *
 * Tùy chọn: --limit 5000 (mặc định) · --min-votes 100 · --min-runtime 60 · --max-runtime 200
 *           --include-adult · --no-filter (bỏ điều kiện poster/mô tả/vote) · --dry-run (chỉ đếm, không ghi)
 *
 * Tự nhận dạng định dạng theo tên cột:
 *   - TMDB "The Movies Dataset": title, runtime, genres (danh sách kiểu Python), overview, poster_path, adult, vote_count, release_date
 *   - MovieLens: movieId, title "Tên (Năm)", genres "A|B|C"  → KHÔNG có thời lượng; chỉ nhập khi có --assume-runtime
 *   - CSV chung: title + runtime bắt buộc; genre/genres, overview/description, poster/poster_url, year/release_date, age/age_label tùy chọn
 *
 * Quy tắc theo đặc tả trang 6: chỉ nhập phim có thời lượng (MOV03 cần số phút); thể loại dịch sang tiếng Việt;
 * nhãn tuổi mặc định NR (chưa phân loại) – quản lý sửa tay; chạy lại không tạo trùng theo ID nguồn.
 */
import { createReadStream } from "node:fs";
import { parse } from "csv-parse";
import { prisma, closeDb } from "../src/core/prisma.js";

type Row = Record<string, string>;
type MovieRow = { source: string; externalId: string | null; title: string; genre: string; durationMinutes: number; ageLabel: string; description: string; posterUrl: string | null; year: number | null; votes: number | null };

// ---------- tham số dòng lệnh ----------
const args = process.argv.slice(2);
const opt = (name: string, def?: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] && !args[i + 1]!.startsWith("--") ? args[i + 1]! : def;
};
const flag = (name: string) => args.includes(`--${name}`);
const FILE = opt("file");
const LIMIT = Number(opt("limit", "5000"));
const MIN_VOTES = Number(opt("min-votes", "100"));
const MIN_RUNTIME = Number(opt("min-runtime", "60"));
const MAX_RUNTIME = Number(opt("max-runtime", "200"));
const NO_FILTER = flag("no-filter");
const INCLUDE_ADULT = flag("include-adult");
const ASSUME_RUNTIME = flag("assume-runtime");
const DRY_RUN = flag("dry-run");
if (!FILE) {
  console.error("Thiếu --file <đường dẫn CSV>");
  process.exit(1);
}
for (const [name, value] of [["limit", LIMIT], ["min-votes", MIN_VOTES], ["min-runtime", MIN_RUNTIME], ["max-runtime", MAX_RUNTIME]] as const) {
  if (!Number.isFinite(value) || value < 0) {
    console.error(`--${name} phải là một số không âm`);
    process.exit(1);
  }
}

// ---------- ánh xạ thể loại sang tiếng Việt ----------
const GENRE_VI: Record<string, string> = {
  Action: "Hành động", Adventure: "Phiêu lưu", Animation: "Hoạt hình", Children: "Thiếu nhi", Comedy: "Hài", Crime: "Hình sự",
  Documentary: "Tài liệu", Drama: "Tâm lý", Family: "Gia đình", Fantasy: "Giả tưởng", "Film-Noir": "Phim noir", History: "Lịch sử",
  Horror: "Kinh dị", Music: "Âm nhạc", Musical: "Nhạc kịch", Mystery: "Bí ẩn", Romance: "Tình cảm", "Science Fiction": "Khoa học viễn tưởng",
  "Sci-Fi": "Khoa học viễn tưởng", "TV Movie": "Phim truyền hình", Thriller: "Giật gân", War: "Chiến tranh", Western: "Miền Tây", IMAX: "IMAX",
};
const toVi = (g: string) => GENRE_VI[g.trim()] ?? g.trim();

/** genres của TMDB metadata là chuỗi kiểu Python: "[{'id': 18, 'name': 'Drama'}, ...]" – không phải JSON hợp lệ */
function parseGenres(raw: string | undefined): string[] {
  if (!raw) return [];
  const names = [...raw.matchAll(/'name':\s*'([^']+)'/g)].map((m) => m[1]!);
  if (names.length) return names;
  try {
    const j = JSON.parse(raw);
    if (Array.isArray(j)) return j.map((x) => (typeof x === "string" ? x : x?.name)).filter(Boolean);
  } catch {
    /* không phải JSON */
  }
  return raw.split(/[|,/]/).map((x) => x.trim()).filter((x) => x && x !== "(no genres listed)");
}

/** Thời lượng giả định theo thể loại (chỉ dùng cho MovieLens với --assume-runtime), tất định theo tên để chạy lại ra cùng số */
function assumedRuntime(title: string, genres: string[]): number {
  const bands: Record<string, [number, number]> = { Animation: [82, 105], Children: [85, 105], Comedy: [90, 115], Horror: [88, 115], Documentary: [75, 110], Drama: [100, 135], Action: [105, 140], Adventure: [105, 140], "Sci-Fi": [105, 145], War: [110, 150], Romance: [95, 125] };
  const [lo, hi] = bands[genres[0] ?? ""] ?? [95, 125];
  let h = 0;
  for (const c of title) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return lo + (h % (hi - lo + 1));
}

function detectFormat(header: string[]): "tmdb" | "movielens" | "generic" {
  const h = new Set(header.map((x) => x.toLowerCase()));
  if (h.has("runtime") && h.has("overview") && h.has("poster_path")) return "tmdb";
  if (h.has("movieid") && h.has("title") && h.has("genres") && !h.has("runtime")) return "movielens";
  return "generic";
}

function pick(row: Row, ...names: string[]): string | undefined {
  for (const n of names) {
    const k = Object.keys(row).find((key) => key.toLowerCase() === n.toLowerCase());
    if (k && row[k] !== undefined && row[k] !== "") return row[k];
  }
  return undefined;
}

function toMovie(row: Row, format: "tmdb" | "movielens" | "generic"): MovieRow | null {
  let title = pick(row, "title", "original_title", "name")?.trim();
  if (!title) return null;
  let year: number | null = null;
  const m = title.match(/^(.*)\((\d{4})\)\s*$/);
  if (m) {
    title = m[1]!.trim();
    year = Number(m[2]);
  }
  const dateStr = pick(row, "release_date", "year", "release_year");
  if (!year && dateStr) {
    const y = Number(String(dateStr).slice(0, 4));
    if (y > 1800) year = y;
  }
  const genres = parseGenres(pick(row, "genres", "genre"));
  let runtime = Number(pick(row, "runtime", "duration", "duration_minutes", "runtime_minutes") ?? 0);
  if (!runtime && format === "movielens" && ASSUME_RUNTIME) runtime = assumedRuntime(title, genres);
  if (!Number.isFinite(runtime) || runtime <= 0) return null;

  const adult = String(pick(row, "adult") ?? "false").toLowerCase() === "true";
  const posterPath = pick(row, "poster_path");
  const posterUrl = pick(row, "poster_url", "poster") ?? (posterPath ? `https://image.tmdb.org/t/p/w342${posterPath}` : null);
  const overview = pick(row, "overview", "description")?.trim();
  const votesRaw = pick(row, "vote_count", "votes");
  const genreVi = genres.length ? toVi(genres[0]!) : "Khác";
  const description = overview ?? [genreVi, year, format === "movielens" && ASSUME_RUNTIME ? "thời lượng giả định (MovieLens không cung cấp)" : null].filter(Boolean).join(" · ");

  return {
    source: format === "tmdb" ? "TMDB" : format === "movielens" ? "MOVIELENS" : "CSV",
    externalId: pick(row, format === "tmdb" ? "id" : "movieId", "external_id", "source_id") ?? null,
    title,
    genre: genreVi,
    durationMinutes: Math.round(runtime),
    ageLabel: pick(row, "age_label", "age", "certification") ?? (adult ? "T18" : "NR"),
    description: description.slice(0, 2000),
    posterUrl,
    year,
    votes: votesRaw ? Number(votesRaw) : null,
  };
}

async function main() {
  const rows: MovieRow[] = [];
  let format: "tmdb" | "movielens" | "generic" | null = null;
  let seen = 0, skipped = 0;

  const parser = createReadStream(FILE!).pipe(parse({ columns: (header: string[]) => { format = detectFormat(header); return header; }, relax_quotes: true, relax_column_count: true, skip_empty_lines: true, bom: true }));
  for await (const raw of parser as AsyncIterable<Row>) {
    seen++;
    const mv = toMovie(raw, format!);
    if (!mv) { skipped++; continue; }
    if (mv.durationMinutes < MIN_RUNTIME || mv.durationMinutes > MAX_RUNTIME) { skipped++; continue; }
    if (!INCLUDE_ADULT && mv.ageLabel === "T18" && String(pick(raw, "adult") ?? "").toLowerCase() === "true") { skipped++; continue; }
    if (!NO_FILTER && format === "tmdb") {
      if (!mv.posterUrl || !mv.description || (mv.votes ?? 0) < MIN_VOTES) { skipped++; continue; }
    }
    rows.push(mv);
  }
  if (format === "movielens" && !ASSUME_RUNTIME) {
    console.error("File MovieLens không có thời lượng; MOV03 cần số phút. Thêm --assume-runtime để gán thời lượng giả định, hoặc dùng The Movies Dataset.");
    process.exit(1);
  }

  // Ưu tiên phim nhiều lượt đánh giá; ID nguồn là khóa chính, tên + thời lượng là khóa dự phòng cho CSV không có ID.
  rows.sort((a, b) => (b.votes ?? 0) - (a.votes ?? 0));
  const fallbackKey = (t: string, d: number) => `${t.toLowerCase().replace(/\s+/g, " ").trim()}|${d}`;
  const fileKnown = new Set<string>();
  const fileUnique: MovieRow[] = [];
  for (const row of rows) {
    const key = row.externalId ? `${row.source}:${row.externalId}` : fallbackKey(row.title, row.durationMinutes);
    if (fileKnown.has(key)) { skipped++; continue; }
    fileKnown.add(key);
    fileUnique.push(row);
  }
  if (DRY_RUN) {
    console.log(`Định dạng: ${format} · đọc ${seen} dòng · bỏ ${skipped} · hợp lệ ${Math.min(fileUnique.length, LIMIT)} (dry-run, không kết nối DB)`);
    console.log(fileUnique.slice(0, 5));
    return;
  }

  const existing = await prisma.movie.findMany({ select: { source: true, externalId: true, title: true, durationMinutes: true } });
  const known = new Set(existing.map((e) => e.externalId && e.source ? `${e.source}:${e.externalId}` : fallbackKey(e.title, e.durationMinutes)));
  const unique: MovieRow[] = [];
  for (const r of fileUnique) {
    const k = r.externalId ? `${r.source}:${r.externalId}` : fallbackKey(r.title, r.durationMinutes);
    if (known.has(k)) { skipped++; continue; }
    known.add(k);
    unique.push(r);
    if (unique.length >= LIMIT) break;
  }

  console.log(`Định dạng: ${format} · đọc ${seen} dòng · bỏ ${skipped} · sẽ nhập ${unique.length}`);

  for (let i = 0; i < unique.length; i += 500) {
    await prisma.movie.createMany({
      data: unique.slice(i, i + 500).map(({ year: _y, votes: _v, ...m }) => m),
      skipDuplicates: true,
    });
    console.log(`  đã ghi ${Math.min(i + 500, unique.length)}/${unique.length}`);
  }
  console.log(`Xong. Nhãn tuổi mặc định NR/T18 – quản lý sửa tay ở admin/movies.html nếu cần.${format === "tmdb" ? " Ghi công: dữ liệu phim từ TMDB (themoviedb.org)." : ""}`);
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => closeDb());
