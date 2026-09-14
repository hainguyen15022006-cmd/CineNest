// Hàng đợi duyệt điều chỉnh – Công Thành (người 6). Dùng được trên điện thoại (quản lý duyệt từ xa).
import { mountLayout, $, setState, escapeHtml, badge, run, toast } from "../shared/layout";
import { api } from "../shared/api";
import { requireRole } from "../shared/auth";
import { money, dateTimeVn } from "../shared/format";
import type { Adjustment } from "../shared/types";

await mountLayout("Duyệt điều chỉnh");
await requireRole("MANAGER");
const list = $("#list");

async function load() {
  setState(list, "loading");
  try {
    const rows = await api.get<Adjustment[]>("/api/admin/adjustments");
    if (!rows.length) return setState(list, "empty", "Không có đề nghị nào chờ duyệt");
    list.innerHTML = `<table><thead><tr><th>Lúc</th><th>Booking</th><th>Loại</th><th>Số tiền</th><th>Lý do</th><th>Người đề nghị</th><th></th></tr></thead><tbody>${rows.map((a) => `
      <tr><td>${dateTimeVn(a.createdAt ?? "")}</td><td>${escapeHtml(a.booking?.code ?? "")}<br><span class="muted">${escapeHtml(a.booking?.room.name ?? "")}</span></td><td>${badge(a.kind)}</td><td>${money(a.amountVnd)}</td>
      <td>${escapeHtml(a.reason)}</td><td>${escapeHtml(a.createdBy?.name ?? "")}</td>
      <td><button type="button" class="small" data-id="${a.id}" data-act="approve">Duyệt</button> <button type="button" class="small danger" data-id="${a.id}" data-act="reject">Từ chối</button></td></tr>`).join("")}</tbody></table>`;
    list.querySelectorAll<HTMLButtonElement>("button[data-id]").forEach((b) =>
      b.addEventListener("click", () => run(async () => {
        const note = b.dataset.act === "reject" ? prompt("Lý do từ chối (tùy chọn)") ?? undefined : undefined;
        await api.post(`/api/admin/adjustments/${b.dataset.id}/${b.dataset.act}`, note ? { note } : {});
        toast(b.dataset.act === "approve" ? "Đã duyệt" : "Đã từ chối", "success"); await load();
      }, b)),
    );
  } catch (e) {
    setState(list, "error", (e as Error).message);
  }
}
await load();
