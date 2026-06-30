import { PrismaClient } from "@prisma/client";
import { grantCasualLot, monthKey } from "../domain/leave";
import { generatePayrollForMonth } from "../domain/payroll";

// Run the monthly close for every user for a given month (0-indexed month).
export async function runMonthClose(prisma: PrismaClient, year: number, month0: number) {
  const first = new Date(year, month0, 1);
  const start = first;
  const end = new Date(year, month0 + 1, 0, 23, 59, 59, 999);
  const mk = monthKey(first);

  const users = await prisma.user.findMany();
  const casual = await prisma.leaveType.findFirst({ where: { policyType: "ACCRUAL_LOT" } });

  for (const u of users) {
    // 1) grant this month's casual lot
    if (casual) await grantCasualLot(prisma, u.id, casual, first);

    // 2) merit points (§4): +1 no casual used, +1 no WFH used
    const month = await prisma.attendanceRecord.findMany({
      where: { userId: u.id, date: { gte: start, lte: end } },
    });
    const usedCasual = month.some((a) => a.status === "CASUAL");
    const usedWfh = month.some((a) => a.status === "WFH");
    const reasons = [!usedCasual ? "no-casual" : null, !usedWfh ? "no-wfh" : null].filter(Boolean);
    await prisma.meritRecord.upsert({
      where: { userId_month: { userId: u.id, month: mk } },
      update: { points: reasons.length, reasons: reasons.join(",") },
      create: { userId: u.id, month: mk, points: reasons.length, reasons: reasons.join(",") },
    });

    // 3) payroll adjustment lines (idempotent)
    await generatePayrollForMonth(prisma, u.id, year, month0);
  }

  return { month: mk, users: users.length };
}

// CLI: npx tsx src/jobs/monthClose.ts 2026 6
if (require.main === module) {
  const prisma = new PrismaClient();
  const [y, m] = process.argv.slice(2).map(Number);
  runMonthClose(prisma, y || new Date().getFullYear(), (m || new Date().getMonth() + 1) - 1)
    .then((r) => console.log("Month close done:", r))
    .finally(() => prisma.$disconnect());
}
