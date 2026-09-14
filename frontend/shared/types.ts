/** Kiểu dữ liệu trả về từ API (khớp backend). Bổ sung khi module của bạn mở rộng API. */
export type Room = { id: number; name: string; capacity: number; description: string; amenities: string[]; hourlyPriceVnd: number; isActive?: boolean; images?: { url: string; sortOrder: number }[]; cover?: string | null; roomTotalVnd?: number };
export type Paged<T> = { items: T[]; total: number; page: number; limit: number };
export type GenreCount = { genre: string; count: number };
export type Movie = { id: number; title: string; genre: string; durationMinutes: number; ageLabel: string; description: string; posterUrl: string | null; isActive: boolean };
export type MenuItem = { id: number; name: string; category: "DRINK" | "SNACK" | "FOOD"; imageUrl: string | null; priceVnd: number; isActive: boolean };
export type Booking = {
  id: number; code: string; roomId: number; room: { id: number; name: string }; startAt: string; endAt: string; occupiedUntil?: string;
  guestCount: number; status: string; paymentStatus: string; roomTotal: number; movieTitleSnapshot: string | null; preparationStatus: string;
  contactName?: string; contactPhone?: string; checkedInAt?: string | null; source?: string; note?: string | null; movieId?: number | null; movieVersion?: number;
  endedEarlyReason?: string | null; foodOrders?: FoodOrder[]; adjustments?: Adjustment[]; payment?: Payment | null; history?: HistoryRow[];
};
export type FoodOrder = { id: number; status: string; items: { id: number; itemNameSnapshot: string; unitPriceVnd: number; quantity: number }[]; booking?: { id: number; code: string; room: { name: string }; status: string } };
export type Adjustment = { id: number; kind: string; status: string; amountVnd: number; reason: string; createdAt?: string; booking?: { id: number; code: string; roomTotal: number; status: string; room: { name: string } }; createdBy?: { name: string } };
export type Payment = { id: number; originalTotalVnd: number; adjustmentVnd: number; amountVnd: number; method: string; paidAt: string };
export type HistoryRow = { id: number; field: string; oldValue: string | null; newValue: string; changedAt: string; reason: string | null };
export type Invoice = { bookingId: number; code: string; status: string; paymentStatus: string; endedEarlyReason: string | null; roomTotalVnd: number; itemsTotalVnd: number; originalTotalVnd: number; adjustment: Adjustment | null; approvedAdjustmentVnd: number; amountDueVnd: number; unresolvedOrderIds: number[]; canCollect: boolean; blockers: string[] };
export type Availability = { window: { startAt: string; endAt: string; occupiedUntil: string }; rooms: Room[] };
