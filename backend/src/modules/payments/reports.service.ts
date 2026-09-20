import { prisma } from "../../core/prisma.js";

export async function getReports(fromDate?: string, toDate?: string) {
  const start = fromDate ? new Date(`${fromDate}T00:00:00.000Z`) : new Date(0);
  const end = toDate ? new Date(`${toDate}T23:59:59.999Z`) : new Date();

  // 1. Report: Bookings by date (Total bookings created within the given period)
  const bookingsCount = await prisma.booking.count({
    where: {
      createdAt: { gte: start, lte: end },
    },
  });

  // 2. Report: Collected revenue (Total amountVnd from Payment records filtered by paidAt)
  const paidPayments = await prisma.payment.aggregate({
    _sum: { amountVnd: true },
    where: {
      paidAt: { gte: start, lte: end },
    },
  });
  const totalRevenueVnd = paidPayments._sum?.amountVnd ?? 0;

  // 3. Report: Room usage hours (Calculate total duration between startAt and endAt or endedAt)
  const completedBookings = await prisma.booking.findMany({
    where: {
      status: "COMPLETED",
      createdAt: { gte: start, lte: end },
    },
    select: { startAt: true, endAt: true, endedAt: true },
  });

  const totalUsedMinutes = completedBookings.reduce((acc, b) => {
    const startTime = b.startAt;
    const endTime = b.endedAt ?? b.endAt;
    if (startTime && endTime) {
      const durationMs = new Date(endTime).getTime() - new Date(startTime).getTime();
      return acc + Math.max(0, Math.floor(durationMs / (1000 * 60)));
    }
    return acc;
  }, 0);

  const totalRoomHours = Number((totalUsedMinutes / 60).toFixed(2));

  // 4. Report: Uncollected (UNPAID) and Waived (WAIVED) bookings
  const unpaidAndWaived = await prisma.booking.findMany({
    where: {
      paymentStatus: { in: ["UNPAID", "WAIVED"] },
      status: "COMPLETED",
      createdAt: { gte: start, lte: end },
    },
    select: {
      id: true,
      code: true,
      paymentStatus: true,
      roomTotal: true,
      adjustments: { where: { isCurrent: true }, select: { kind: true, status: true, amountVnd: true } },
    },
  });

  const totalUnpaidVnd = unpaidAndWaived
    .filter((b) => b.paymentStatus === "UNPAID")
    .reduce((sum, b) => sum + b.roomTotal, 0);

  const totalWaivedVnd = unpaidAndWaived
    .filter((b) => b.paymentStatus === "WAIVED")
    .reduce((sum, b) => sum + b.roomTotal, 0);

  // Print raw report data directly to Terminal for inspection
  console.log("\n== DB RECONCILED REPORT DATA ==");
  console.log(JSON.stringify({
    period: { from: start.toISOString(), to: end.toISOString() },
    summary: {
      totalBookings: bookingsCount,
      totalRevenueVnd,
      totalRoomHours,
      unpaidAndWaivedSummary: {
        unpaidCount: unpaidAndWaived.filter((b) => b.paymentStatus === "UNPAID").length,
        totalUnpaidVnd,
        waivedCount: unpaidAndWaived.filter((b) => b.paymentStatus === "WAIVED").length,
        totalWaivedVnd,
      },
    },
    unpaidAndWaivedList: unpaidAndWaived,
  }, null, 2));
  console.log("====\n");

  return {
    period: { from: start.toISOString(), to: end.toISOString() },
    summary: {
      totalBookings: bookingsCount, // Report 1
      totalRevenueVnd,              // Report 2
      totalRoomHours,               // Report 3
      unpaidAndWaivedSummary: {     // Report 4
        unpaidCount: unpaidAndWaived.filter((b) => b.paymentStatus === "UNPAID").length,
        totalUnpaidVnd,
        waivedCount: unpaidAndWaived.filter((b) => b.paymentStatus === "WAIVED").length,
        totalWaivedVnd,
      },
    },
    unpaidAndWaivedList: unpaidAndWaived,
  };
}