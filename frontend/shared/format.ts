/** Shared display formatting: VND, dd/mm/yyyy dates, and 24-hour times in the Vietnam time zone. */
const VN_TZ = "Asia/Ho_Chi_Minh";

export function money(vnd: number): string {
  return `${Math.round(vnd).toLocaleString("en-US")} VND`;
}

export function dateVn(iso: string | Date): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: VN_TZ, day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(iso));
}

export function timeVn(iso: string | Date): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: VN_TZ, hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));
}

export function dateTimeVn(iso: string | Date): string {
  return `${dateVn(iso)} ${timeVn(iso)}`;
}

/** Today's YYYY-MM-DD value in the Vietnam time zone, for date inputs. */
export function todayVn(offsetDays = 0): string {
  const d = new Date(Date.now() + offsetDays * 86_400_000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: VN_TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

export const STATUS_LABEL: Record<string, string> = {
  CONFIRMED: "Confirmed", IN_USE: "In use", COMPLETED: "Completed", CANCELLED: "Cancelled", NO_SHOW: "No-show",
  UNPAID: "Unpaid", PAID: "Paid", WAIVED: "Waived",
  NOT_SELECTED: "Not selected", PENDING: "Pending", READY: "Ready", UNAVAILABLE: "Unavailable",
  PREPARING: "Preparing", SERVED: "Served",
  PENDING_APPROVAL: "Pending approval", APPROVED: "Approved", REJECTED: "Rejected", REDUCE: "Partial discount", WAIVE: "Full waiver",
  DRINK: "Drink", SNACK: "Snack", FOOD: "Food",
  CUSTOMER: "Customer", STAFF: "Staff", MANAGER: "Manager",
  ONLINE: "Online", COUNTER: "Walk-in", CASH: "Cash", TRANSFER: "Bank transfer",
};

export function label(status: string): string {
  return STATUS_LABEL[status] ?? status;
}

/** Valid start times at :00/:30 that keep the session and cleaning buffer within opening hours. */
export function startTimeOptions(durationMinutes: number): string[] {
  const out: string[] = [];
  for (let m = 9 * 60; m + durationMinutes + 30 <= 23 * 60; m += 30) {
    out.push(`${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`);
  }
  return out;
}
