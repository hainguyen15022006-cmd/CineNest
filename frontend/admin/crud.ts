/**
 * Khung CRUD dùng chung cho admin/rooms, movies, menu: một form thêm/sửa + một bảng.
 * Chấp nhận API trả mảng (phòng, món) hoặc trang { items, total, page, limit } (phim – kho vài nghìn phim);
 * `searchSel` (tùy chọn) trỏ tới ô tìm kiếm → gửi ?q= và phân trang bằng nút Trước/Sau.
 */
import { $, setState, escapeHtml, run, toast, formData } from "../shared/layout";
import { api, qs } from "../shared/api";
import type { Paged } from "../shared/types";

type Col<T> = { title: string; render: (row: T) => string };
export function mountCrud<T extends { id: number }>(opts: {
  listUrl: string; createUrl: string; updateUrl: (id: number) => string; formSel: string; listSel: string;
  columns: Col<T>[]; toBody: (f: Record<string, string | number>) => Record<string, unknown>; fillForm: (form: HTMLFormElement, row: T) => void;
  searchSel?: string; pageSize?: number;
}) {
  const form = $<HTMLFormElement>(opts.formSel);
  const list = $(opts.listSel);
  const search = opts.searchSel ? $<HTMLInputElement>(opts.searchSel) : null;
  const limit = opts.pageSize ?? 50;
  let page = 1;
  let timer: number | undefined;
  async function load() {
    setState(list, "loading");
    try {
      const res = await api.get<T[] | Paged<T>>(`${opts.listUrl}${qs({ q: search?.value.trim() || undefined, page, limit })}`);
      const paged = !Array.isArray(res);
      const rows = paged ? res.items : res;
      const total = paged ? res.total : rows.length;
      if (!rows.length) return setState(list, "empty");
      const pages = Math.max(1, Math.ceil(total / limit));
      const pager = paged && pages > 1
        ? `<div class="row" style="justify-content:space-between;margin-top:8px"><span class="muted">${total} bản ghi · trang ${page}/${pages}</span>
             <span><button type="button" class="small secondary" data-page="${page - 1}" ${page <= 1 ? "disabled" : ""}>‹ Trước</button>
             <button type="button" class="small secondary" data-page="${page + 1}" ${page >= pages ? "disabled" : ""}>Sau ›</button></span></div>`
        : paged ? `<p class="muted">${total} bản ghi</p>` : "";
      list.innerHTML = `<table><thead><tr>${opts.columns.map((c) => `<th>${c.title}</th>`).join("")}<th></th></tr></thead><tbody>${rows
        .map((r) => `<tr>${opts.columns.map((c) => `<td>${c.render(r)}</td>`).join("")}<td><button type="button" class="small secondary" data-edit="${r.id}">Sửa</button></td></tr>`).join("")}</tbody></table>${pager}`;
      list.querySelectorAll<HTMLButtonElement>("button[data-page]").forEach((b) => b.addEventListener("click", () => { page = Number(b.dataset.page); void load(); }));
      list.querySelectorAll<HTMLButtonElement>("button[data-edit]").forEach((b) =>
        b.addEventListener("click", () => { const row = rows.find((x) => x.id === Number(b.dataset.edit))!; opts.fillForm(form, row); (form.elements.namedItem("id") as HTMLInputElement).value = String(row.id); form.scrollIntoView(); }),
      );
    } catch (e) {
      setState(list, "error", (e as Error).message);
    }
  }
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = formData(form);
    const id = Number((form.elements.namedItem("id") as HTMLInputElement).value);
    await run(async () => {
      if (id) await api.patch(opts.updateUrl(id), opts.toBody(f)); else await api.post(opts.createUrl, opts.toBody(f));
      toast("Đã lưu", "success"); form.reset(); (form.elements.namedItem("id") as HTMLInputElement).value = ""; await load();
    }, form.querySelector<HTMLButtonElement>("button[type=submit]"));
  });
  document.getElementById("btn-reset")?.addEventListener("click", () => { form.reset(); (form.elements.namedItem("id") as HTMLInputElement).value = ""; });
  search?.addEventListener("input", () => { window.clearTimeout(timer); timer = window.setTimeout(() => { page = 1; void load(); }, 300); });
  void load();
  return { load, escapeHtml };
}
