import { PrismaClient } from "@prisma/client";
import { sickOccurrences, monthKey } from "./leave";

// Upsert keyed on (user, date, type, source) so re-runs update rather than duplicate.
async function upsertAdj(
  prisma: PrismaClient,
  a: {
    userId: string; date: Date; type: any; unitFraction?: number;
    amount?: number | null; sourceType: string; sourceId: string | null; note?: string;
  }
) {
  const rate = a.amount ?? (await rateFor(prisma, a.userId, a.unitFraction));
  return prisma.payrollAdjustment.upsert({
    where: {
      userId_date_type_sourceId: {
        userId: a.userId, date: a.date, type: a.type, sourceId: a.sourceId ?? "",
      },
    },
    update: { unitFraction: a.unitFraction ?? null, amount: rate, note: a.note },
    create: {
      userId: a.userId, date: a.date, type: a.type, unitFraction: a.unitFraction ?? null,
      amount: rate, sourceType: a.sourceType, sourceId: a.sourceId ?? "", note: a.note,
    },
  });
}

async function rateFor(prisma: PrismaClient, userId: string, fraction?: number) {
  if (fraction == null) return null;
  const u = await prisma.user.findUnique({ where: { id: userId } });
  return u?.dailyRate ? Number(u.dailyRate) * fraction : null;
}

// Generate all payroll lines for a user for a given month (idempotent).
export async function generatePayrollForMonth(prisma: PrismaClient, userId: string, year: number, month0: number) {
  const start = new Date(year, month0, 1);
  const end = new Date(year, month0 + 1, 0, 23, 59, 59, 999);

  const attendance = await prisma.attendanceRecord.findMany({
    where: { userId, date: { gte: start, lte: end } },
    orderBy: { date: "asc" },
  });

  // §3.2 lateness
  for (const r of attendance) {
    if (r.refusedAfterLate)
      await upsertAdj(prisma, { userId, date: r.date, type: "LATE_DEDUCTION", unitFraction: 1.0, sourceType: "attendance", sourceId: r.id, note: "Refusal after late arrival (100%)" });
    else if (r.late)
      await upsertAdj(prisma, { userId, date: r.date, type: "LATE_DEDUCTION", unitFraction: 0.5, sourceType: "attendance", sourceId: r.id, note: "Late after 10:15 (50%)" });
  }

  // §2.1 sick (interpretation B): day 1 of each occurrence is free; days 2+ are paid out
  // of remaining casual, and only the days casual can't cover become LOP.
  // Idempotent: we clear this month's sick-LOP lines and recompute from current lot state.
  await prisma.payrollAdjustment.deleteMany({ where: { userId, type: "LOP_SICK", date: { gte: start, lte: end } } });

  const casualType = await prisma.leaveType.findFirst({ where: { policyType: "ACCRUAL_LOT" } });
  let casualRemaining = 0;
  if (casualType) {
    const lots = await prisma.leaveGrant.findMany({
      where: { userId, leaveTypeId: casualType.id, OR: [{ expiresOn: null }, { expiresOn: { gte: start } }] },
    });
    // remaining after voluntary leave-request usage (lot.used); voluntary keeps priority
    casualRemaining = lots.reduce((s, l) => s + (Number(l.amount) - Number(l.used)), 0);
  }

  const sickDates = attendance.filter((a) => a.status === "SICK").map((a) => a.date);
  for (const occ of sickOccurrences(sickDates)) {
    for (let i = 1; i < occ.length; i++) {            // index 0 = free first day
      const d = occ[i];
      if (casualRemaining >= 1) { casualRemaining -= 1; continue; } // rescued by casual → paid
      await prisma.payrollAdjustment.create({
        data: {
          userId, date: d, type: "LOP_SICK", unitFraction: 1.0,
          amount: await rateFor(prisma, userId, 1.0),
          sourceType: "attendance", sourceId: `sick:${monthKey(d)}:${+d}`,
          note: `LOP sick day ${i + 1} of occurrence (casual exhausted)`,
        },
      });
    }
  }

  // leave overflow LOP (computed at approval, recorded here for export)
  const leaves = await prisma.leaveRequest.findMany({
    where: { userId, status: "APPROVED", startDate: { gte: start, lte: end }, lopDays: { gt: 0 } },
  });
  for (const lr of leaves)
    await upsertAdj(prisma, { userId, date: lr.startDate, type: "LOP_LEAVE", unitFraction: Number(lr.lopDays), sourceType: "leaveRequest", sourceId: lr.id, note: "Casual exhausted → LOP" });

  return prisma.payrollAdjustment.findMany({ where: { userId, date: { gte: start, lte: end } }, orderBy: { date: "asc" } });
}
