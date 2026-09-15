// Hàng đợi duyệt điều chỉnh – Công Thành (người 6). Dùng được trên điện thoại (quản lý duyệt từ xa).
import { mountLayout, $, setState, escapeHtml, badge, run, toast } from "../shared/layout";
import { api } from "../shared/api";
import { requireRole } from "../shared/auth";
import { money, dateTimeVn } from "../shared/format";
import type { Adjustment } from "../shared/types";

await mountLayout("Adjustment approvals");
await requireRole("MANAGER");
const list = $("#list");

async function load() {
  setState(list, "loading");
  try {
    const rows = await api.get<Adjustment[]>("/api/admin/adjustments");
    if (!rows.length) return setState(list, "empty", "No adjustment requests are awaiting approval");
    list.innerHTML = `<table><thead><tr><th>Time</th><th>Booking</th><th>Type</th><th>Amount</th><th>Reason</th><th>Requested by</th><th></th></tr></thead><tbody>${rows.map((a) => `
      <tr><td>${dateTimeVn(a.createdAt ?? "")}</td><td>${escapeHtml(a.booking?.code ?? "")}<br><span class="muted">${escapeHtml(a.booking?.room.name ?? "")}</span></td><td>${badge(a.kind)}</td><td>${money(a.amountVnd)}</td>
      <td>${escapeHtml(a.reason)}</td><td>${escapeHtml(a.createdBy?.name ?? "")}</td>
      <td><button type="button" class="small" data-id="${a.id}" data-act="approve">Approve</button> <button type="button" class="small danger" data-id="${a.id}" data-act="reject">Reject</button></td></tr>`).join("")}</tbody></table>`;
    list.querySelectorAll<HTMLButtonElement>("button[data-id]").forEach((b) =>
      b.addEventListener("click", () => run(async () => {
        const note = b.dataset.act === "reject" ? prompt("Rejection reason (optional)") ?? undefined : undefined;
        await api.post(`/api/admin/adjustments/${b.dataset.id}/${b.dataset.act}`, note ? { note } : {});
        toast(b.dataset.act === "approve" ? "Approved" : "Rejected", "success"); await load();
      }, b)),
    );
  } catch (e) {
    setState(list, "error", (e as Error).message);
  }
}
await load();
